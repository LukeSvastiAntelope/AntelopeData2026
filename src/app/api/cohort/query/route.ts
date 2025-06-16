import { NextRequest, NextResponse } from "next/server";
import { openSql as getMySQLConnection } from "@/app/utils/database/db";
import { CohortRepo } from "@/app/utils/database/cohort-repo";
import { CohortFilterRule } from "@/app/utils/interface";
import { TextEncoder } from "util";
import { createCompletion } from "@/app/utils/services/ai-service";
import { verifyConfirmationToken } from "@/app/utils/api/token";

interface CohortQueryPayload {
  cohort?: { id?: number; filter?: CohortFilterRule[] };
  question: string;
  topK?: number;
  surveyId?: number;
  model?: string;
  sources?: { survey: boolean; twins: boolean; web: boolean };
  systemPrompt?: string;
}

function buildWhereClause(rules: CohortFilterRule[], params: any[]): string {
  const clauses: string[] = [];

  for (const rule of rules) {
    switch (rule.op) {
      case "=":
        clauses.push(`${rule.field} = ?`);
        params.push(rule.value);
        break;
      case "IN":
        if (Array.isArray(rule.value) && rule.value.length) {
          clauses.push(`${rule.field} IN (${rule.value.map(() => "?").join(",")})`);
          params.push(...rule.value);
        }
        break;
      case "CONTAINS":
        clauses.push(`JSON_CONTAINS(${rule.field}, '"${rule.value}"')`);
        break;
    }
  }

  return clauses.length ? clauses.join(" AND ") : "1"; // default TRUE
}

export async function POST(req: NextRequest) {
  try {
    // Verify JWT token and get user ID
    const token = req.headers.get('Authorization')?.split(' ')[1];
    const jwtPayload = await verifyConfirmationToken(token as string);
    if (!jwtPayload) {
      return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    }
    const userId = jwtPayload.email as string;

    const body = (await req.json()) as CohortQueryPayload;
    const { cohort, question, topK = 50, surveyId, model = 'gpt-4o', sources, systemPrompt } = body;

    if (!question || question.trim() === "") {
      return NextResponse.json({ status: false, message: "Question is required" }, { status: 400 });
    }

    // Resolve cohort filter
    let filterRules: CohortFilterRule[] = [];
    if (cohort?.id) {
      const cohorts = await CohortRepo.listVisibleCohorts(null, "admin"); // we need dedicated repo method to getById; quick workaround
      const found = cohorts.find((c) => c.id === cohort.id);
      if (!found) {
        return NextResponse.json({ status: false, message: "Cohort not found" }, { status: 404 });
      }
      filterRules = found.filter_json as any;
    } else if (cohort?.filter) {
      filterRules = cohort.filter;
    }

    // Fetch survey answers that match - ONLY from user's surveys
    const db = await getMySQLConnection();
    const params: any[] = [];
    let whereClause = buildWhereClause(filterRules, params);
    
    // Always filter by user's surveys
    if (whereClause === "1") {
      whereClause = 's.created_by = ?';
    } else {
      whereClause += ' AND s.created_by = ?';
    }
    params.push(userId);
    
    if (surveyId) {
      whereClause += ' AND sr.survey_id = ?';
      params.push(surveyId);
    }
    
    // MySQL prepared statements do not allow parameter placeholders for LIMIT.
    const safeLimit = Math.max(1, Math.min(topK, 1000));
    const [rows] = await db.execute<any[]>(
      `SELECT sr.id as rid, sa.answer_value,
               COALESCE(sr.age_range,
                        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.ageRange')),
                        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.age')),
                        JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.age_range'))
               ) AS age_val,
               JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.location')) AS location_val,
               JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.occupation')) AS occupation_val,
               JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.education')) AS education_val,
               JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.income')) AS income_val,
               JSON_UNQUOTE(JSON_EXTRACT(sr.demographics,'$.politicalViews')) AS political_val
       FROM survey_responses sr
       JOIN survey_answers sa ON sr.id = sa.response_id
       JOIN surveys s ON sr.survey_id = s.id
       WHERE ${whereClause}
       LIMIT ${safeLimit}`,
      params
    );

    if (!rows.length) {
      return NextResponse.json({ status: true, answer: "No survey data available for this cohort." });
    }

    const answersText = rows.map((r) => r.answer_value).join("\n");

    // Demographic distribution summaries
    const ageCounts: Record<string, number> = {};
    const locationCounts: Record<string, number> = {};
    const occupationCounts: Record<string, number> = {};
    const educationCounts: Record<string, number> = {};
    const incomeCounts: Record<string, number> = {};
    const politicalCounts: Record<string, number> = {};
    
    const seen = new Set<number>();
    rows.forEach((r:any)=> {
      if(seen.has(r.rid)) return;
      seen.add(r.rid);
      
      // Age
      const age = r.age_val as string | null;
      if(age){ ageCounts[age] = (ageCounts[age]||0)+1; }
      
      // Location
      const location = r.location_val as string | null;
      if(location){ locationCounts[location] = (locationCounts[location]||0)+1; }
      
      // Occupation
      const occupation = r.occupation_val as string | null;
      if(occupation){ occupationCounts[occupation] = (occupationCounts[occupation]||0)+1; }
      
      // Education
      const education = r.education_val as string | null;
      if(education){ educationCounts[education] = (educationCounts[education]||0)+1; }
      
      // Income
      const income = r.income_val as string | null;
      if(income){ incomeCounts[income] = (incomeCounts[income]||0)+1; }
      
      // Political Views
      const political = r.political_val as string | null;
      if(political){ politicalCounts[political] = (politicalCounts[political]||0)+1; }
    });

    // Build numeric age array for adaptive binning
    const numericAges:number[] = [];
    rows.forEach((r:any)=>{
      const ageStr = (r.age_val as string)||'';
      if(/\d+/.test(ageStr)){
        const m = ageStr.match(/(\d{1,3})/);
        if(m){ numericAges.push(parseInt(m[1],10)); }
      }
    });

    // determine grouping from question
    function binAges(): {labels:string[]; counts:number[]} {
      if(numericAges.length===0) return {labels:Object.keys(ageCounts),counts:Object.values(ageCounts)};
      const ages = numericAges.slice().sort((a,b)=>a-b);
      const bins:number[]=[]; let labels:string[]=[]; let counts:number[]=[];
      const qLower = question.toLowerCase();
      const makeHistogram=(width:number)=>{
        const min = Math.min(...ages); const max=Math.max(...ages);
        const start = Math.floor(min/width)*width;
        const end = Math.ceil((max+1)/width)*width;
        const size = Math.ceil((end-start)/width);
        counts = Array(size).fill(0);
        labels = Array(size).fill('');
        for(let i=0;i<size;i++){
          const from=start+i*width;
          const to=from+width-1;
          labels[i]=`${from}-${to}`;
        }
        ages.forEach(a=>{
          const idx=Math.floor((a-start)/width);
          counts[idx]++;
        });
      };
      if(/decade|10\s?year|10-year/.test(qLower)){
        makeHistogram(10);
      } else if(/5\s?-?year/.test(qLower)){
        makeHistogram(5);
      } else if(/five/.test(qLower) && /group|category|bin|split/.test(qLower)){
        // quantiles 5
        const n=5; labels=[];counts=Array(n).fill(0);
        const step=Math.floor(ages.length/n);
        for(let i=0;i<n;i++){
          const slice=ages.slice(i*step, i===n-1?undefined:(i+1)*step);
          if(slice.length){
            labels.push(`${slice[0]}-${slice[slice.length-1]}`);
            counts[i]=slice.length;
          }
        }
      } else {
        // default distinct ages
        labels=Object.keys(ageCounts);
        counts=Object.values(ageCounts);
      }
      return {labels,counts};
    }

    const {labels:ageLabels, counts:ageValues} = binAges();

    const ageTotal = ageValues.reduce((a,b)=>a+b,0)||1;
    const ageSummaryLines = ageLabels.map((lab,idx)=>`${lab}: ${Math.round((ageValues[idx]/ageTotal)*100)}%`);
    const ageSummary = ageSummaryLines.join(', ');

    // Helper function to create demographic summaries
    const createDemographicSummary = (counts: Record<string, number>, maxItems: number = 5) => {
      const total = Object.values(counts).reduce((a,b)=>a+b,0)||1;
      const sorted = Object.entries(counts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, maxItems);
      return sorted.map(([key, count]) => `${key}: ${Math.round((count/total)*100)}%`).join(', ');
    };

    // Create summaries for all demographics
    const locationSummary = Object.keys(locationCounts).length > 0 ? createDemographicSummary(locationCounts) : '';
    const occupationSummary = Object.keys(occupationCounts).length > 0 ? createDemographicSummary(occupationCounts) : '';
    const educationSummary = Object.keys(educationCounts).length > 0 ? createDemographicSummary(educationCounts) : '';
    const incomeSummary = Object.keys(incomeCounts).length > 0 ? createDemographicSummary(incomeCounts) : '';
    const politicalSummary = Object.keys(politicalCounts).length > 0 ? createDemographicSummary(politicalCounts) : '';

    // Build comprehensive demographic summary
    const demographicParts = [];
    if (ageSummary) demographicParts.push(`Age: ${ageSummary}`);
    if (locationSummary) demographicParts.push(`Location: ${locationSummary}`);
    if (occupationSummary) demographicParts.push(`Occupation: ${occupationSummary}`);
    if (educationSummary) demographicParts.push(`Education: ${educationSummary}`);
    if (incomeSummary) demographicParts.push(`Income: ${incomeSummary}`);
    if (politicalSummary) demographicParts.push(`Political Views: ${politicalSummary}`);
    
    const fullDemographicSummary = demographicParts.join(' | ');

    // Build chart spec for UI
    const chartSpec = {
      type: 'bar',
      title: 'Age distribution',
      labels: ageLabels,
      values: ageValues
    };

    // Prepare stats & quotes
    const sampleSize = rows.length;
    const quoteObjs = rows.slice(0, 3).map((r: any, idx: number) => ({ id: idx + 1, text: r.answer_value as string }));

    // naive sentiment counts
    let pos = 0, neg = 0, neu = 0;
    const positiveWords = ['good','love','great','like','best','excellent'];
    const negativeWords = ['bad','hate','poor','worst','expensive','overpriced'];
    rows.forEach((r:any)=>{
      const text = (r.answer_value as string).toLowerCase();
      if (positiveWords.some(w=>text.includes(w))) pos++; else if (negativeWords.some(w=>text.includes(w))) neg++; else neu++;
    });

    const statsJson = {
      sampleSize,
      sentiment:{ pos, neu, neg },
      quotes: quoteObjs,
      demographics: {
        age: ageCounts,
        location: locationCounts,
        occupation: occupationCounts,
        education: educationCounts,
        income: incomeCounts,
        political: politicalCounts
      }
    };

    const statsAppendix = `\n\n---\nsample-size: ${sampleSize}\nsentiment: 👍 ${Math.round((pos/sampleSize)*100)}% | 😐 ${Math.round((neu/sampleSize)*100)}% | 👎 ${Math.round((neg/sampleSize)*100)}%\ndemographics: ${fullDemographicSummary}\ncitations:\n` + quoteObjs.map(q=>`[${q.id}] "${q.text.slice(0,120)}"`).join('\n');

    // Build prompt with quotes list
    const quotesForPrompt = quoteObjs.map(q=>`[${q.id}] ${q.text}`).join('\n');
    const prompt = `You are asked to represent the collective voice of a cohort of people. Cite at most 3 supporting quotes using markers like [1], [2]. Demographics of the cohort: ${fullDemographicSummary}. Do not mention limitations about providing graphs. After answering, stop; do NOT output the stats block.\n\nUser question: "${question}"\n\nSupporting quotes:\n${quotesForPrompt}`;

    // build deterministic demographic sentence before prompt
    const demographicSentence = fullDemographicSummary ? `Demographics: ${fullDemographicSummary}.` : '';

    const encoder = new TextEncoder();
    const systemMessage = systemPrompt || "You are an expert analyst summarising the perspectives of a group of survey respondents. Respond clearly and concisely without repeating words or phrases.";

    // update completion call - use more tokens for o3 models due to reasoning overhead
    const isO3Model = model.startsWith('o3') || model.startsWith('o1');
    const maxTokens = isO3Model ? 3000 : 500;
    
    const completion = await createCompletion({
      model: model,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: demographicSentence + "\n\n" + prompt }
      ],
      temperature: 0.25,
      frequencyPenalty: 0.2,
      presencePenalty: 0.2,
      maxTokens: maxTokens,
    });

    console.log(`Model: ${model}, Completion response:`, completion);
    console.log(`Query executed for user ${userId}, found ${rows.length} responses from user's surveys`);
    
    const fullAnswer = completion.content || "I apologize, but I couldn't generate a response. Please try again or switch to a different model.";

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(fullAnswer));
        controller.enqueue(encoder.encode(statsAppendix));
        if (question.toLowerCase().match(/chart|graph|distribution|histogram/)) {
          controller.enqueue(encoder.encode('\n```chart\n' + JSON.stringify(chartSpec) + '\n```\n'));
        }
        controller.close();
      }
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Sample-Size": String(rows.length),
      },
    });
  } catch (error) {
    console.error("Error in cohort query:", error);
    return NextResponse.json({ status: false, message: "Internal error" }, { status: 500 });
  }
} 