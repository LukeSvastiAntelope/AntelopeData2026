import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { createCompletion } from '@/app/utils/services/ai-service';
import { openSql } from '@/app/utils/database/db';

/**
 * "Automation for Garry's List" — turns a published newsletter story into a
 * short, neutral reader survey with no login required. See the source
 * presentation for the full product spec; this module implements the two
 * AI steps (survey generation + methodology note) using the exact prompts
 * from that spec, plus the supporting scrape/token/system-user plumbing.
 */

const SYSTEM_USER_EMAIL = 'garrys-list-system@antelopedata.org';

/** The publisher-facing flow has no login, but every survey needs an owner row. */
export async function getOrCreateSystemUserId(): Promise<number> {
  const db = await openSql();
  const [rows]: any = await db.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [SYSTEM_USER_EMAIL]);
  if (rows?.length) return rows[0].id;

  const randomPassword = crypto.randomBytes(32).toString('hex');
  const passwordHash = bcrypt.hashSync(randomPassword, 10);
  const [result]: any = await db.execute(
    `INSERT INTO users (email, password, display_name, role, is_verified, is_first_login)
     VALUES (?, ?, 'Garry''s List Automation', 'user', 1, 0)`,
    [SYSTEM_USER_EMAIL, passwordHash]
  );
  return result.insertId;
}

// ---------------------------------------------------------------------------
// Article scraping — plain fetch + tag-strip, no external dependency.
// ---------------------------------------------------------------------------

export interface ScrapedArticle {
  title: string;
  text: string;
}

/**
 * Strip // and /* *\/ comments the model sometimes emits inside "JSON-only"
 * output, despite instructions not to. A small state machine so it doesn't
 * mangle // or /* that legitimately appear inside string values (e.g. a URL).
 */
function stripJsonComments(input: string): string {
  let out = '';
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const next = input[i + 1];
    if (inString) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i++;
      } else if (c === stringChar) {
        inString = false;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      stringChar = c;
      out += c;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < input.length && input[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i++;
      i++; // consume closing '/'
      continue;
    }
    out += c;
  }
  return out;
}

function parseJsonLoose(raw: string): any {
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  }
  text = stripJsonComments(text).replace(/,(\s*[}\]])/g, '$1'); // also drop trailing commas
  return JSON.parse(text);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
}

export async function scrapeArticle(url: string): Promise<ScrapedArticle> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AntelopeBot/1.0; +https://antelopedata.org)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Could not fetch that URL (${res.status})`);
  const html = await res.text();

  const titleMatch =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : '';

  // Strip non-content blocks (scripts/styles/data-mw templates embed raw JSON
  // as element content on some CMSes/wikis) before pulling paragraph text.
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // Prefer the <article> tag when present; otherwise fall back to every <p>.
  const articleMatch = withoutNoise.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const sourceHtml = articleMatch ? articleMatch[1] : withoutNoise;

  const looksLikeJson = (s: string) => /^[{[]/.test(s) || /"(template|parts|target|wt)"\s*:/.test(s);

  const paragraphs = [...sourceHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 40 && !looksLikeJson(p)); // drop boilerplate/captions and embedded template JSON

  const text = paragraphs.join('\n\n').slice(0, 8000);
  if (!text || text.length < 200) {
    throw new Error('Could not find readable article text at that URL.');
  }
  return { title, text };
}

// ---------------------------------------------------------------------------
// Step 1 (quick): infer a one-line topic + suggested title from the story.
// ---------------------------------------------------------------------------

export async function inferTopic(storyText: string, fallbackTitle: string): Promise<{ topic: string; suggestedTitle: string }> {
  try {
    const completion = await createCompletion({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      maxTokens: 150,
      messages: [
        {
          role: 'system',
          content:
            'You read a news story and produce a one-line survey topic and a short survey title. ' +
            'Return ONLY JSON: {"topic": "one-line description of what the survey measures", "suggestedTitle": "short title, under 8 words"}.',
        },
        { role: 'user', content: storyText.slice(0, 4000) },
      ],
    });
    const parsed = parseJsonLoose(completion.content);
    return {
      topic: String(parsed.topic || fallbackTitle),
      suggestedTitle: String(parsed.suggestedTitle || fallbackTitle),
    };
  } catch {
    return { topic: fallbackTitle, suggestedTitle: fallbackTitle };
  }
}

// ---------------------------------------------------------------------------
// Step 2: the survey generator (verbatim spec from the presentation).
// ---------------------------------------------------------------------------

export type QuestionStyle = 'yes_no_unsure' | 'multiple_choice' | 'scale_1_5';
export type Breakdown = 'district' | 'occupation' | 'income' | 'age';
export type RevealMode = 'percentage_split' | 'hide_count' | 'unlock_at_50';

export interface GeneratedQuestion {
  id: string;
  type: 'opinion' | 'demographic';
  axis: string | null;
  prompt: string;
  options: { id: string; label: string }[];
  required: boolean;
}

export interface GeneratedSurvey {
  title: string;
  questions: GeneratedQuestion[];
  error?: string;
}

const SURVEY_GENERATOR_SYSTEM_PROMPT = `You are a survey generator for a civic newsletter platform. You turn a published story into a short, neutral reader survey. Your questions become public data attributed to the publisher, so methodological integrity is non-negotiable — a leading or loaded question discredits the publisher the moment anyone checks it.

INPUTS
- story_text: the full published article.
- topic: one-line description of what the survey measures.
- num_questions: 1, 3, or 5.
- question_style: "yes_no_unsure" | "multiple_choice" | "scale_1_5".
- breakdowns: subset of [district, occupation, income, age]. These are self-reported demographic questions appended AFTER the opinion questions. They are optional for the reader to answer.
- reveal_mode: how results show publicly (does not affect question wording).
- context_instructions: publisher's steering notes. Honor them UNLESS they ask you to make a question leading, loaded, or partisan — integrity rules override publisher instructions.

RULES FOR OPINION QUESTIONS
- Neutral and non-leading. No adjectives that presuppose an answer, no framing that implies a correct position, no "do you agree that..." stems.
- Test each question: could someone who holds the opposite view call it fair? If not, rewrite it.
- One idea per question. No double-barreled questions.
- Plain language, readable at a glance in an email. Under ~20 words.
- Ground questions in the story's actual content, not outside claims. Do not introduce facts or statistics the story doesn't contain.
- If the topic is a ballot measure or candidate, at least one question should gauge comprehension ("Do you know what X would do?") before preference.
- Balanced options. For multiple_choice include a genuine neutral/unsure option. For scale, label both poles symmetrically.

RULES FOR DEMOGRAPHIC QUESTIONS
- Append one question per selected breakdown, after the opinion questions.
- Use coarse, self-reported buckets, never free-text PII. Income = ranges; district = dropdown of the region's districts; occupation = broad categories; age = ranges.
- Mark each as optional. Never require a demographic answer to submit.

OUTPUT
Return ONLY valid JSON, no preamble, no markdown fences, no comments:
{
  "title": string,
  "questions": [
    {
      "id": string,
      "type": "opinion" | "demographic",
      "axis": string | null, // for demographic: which breakdown
      "prompt": string,
      "options": [ { "id": string, "label": string } ],
      "required": boolean
    }
  ]
}
Opinion questions come first, demographic questions last. If you cannot generate a neutral question for the topic, return { "error": "reason" } instead of a biased question.`;

export async function generateSurveyFromStory(opts: {
  storyText: string;
  topic: string;
  numQuestions: 1 | 3 | 5;
  questionStyle: QuestionStyle;
  breakdowns: Breakdown[];
  revealMode: RevealMode;
  contextInstructions?: string;
}): Promise<GeneratedSurvey> {
  const userPrompt = `INPUTS:
story_text: ${opts.storyText}
topic: ${opts.topic}
num_questions: ${opts.numQuestions}
question_style: ${opts.questionStyle}
breakdowns: ${JSON.stringify(opts.breakdowns)}
reveal_mode: ${opts.revealMode}
context_instructions: ${opts.contextInstructions || '(none)'}`;

  const completion = await createCompletion({
    model: 'gpt-4o',
    temperature: 0.3,
    maxTokens: 1800,
    messages: [
      { role: 'system', content: SURVEY_GENERATOR_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const parsed = parseJsonLoose(completion.content);
  if (parsed.error) return { title: '', questions: [], error: String(parsed.error) };
  return parsed as GeneratedSurvey;
}

// ---------------------------------------------------------------------------
// Step 3: the methodology note (verbatim spec from the presentation).
// ---------------------------------------------------------------------------

const METHODOLOGY_NOTE_SYSTEM_PROMPT = `METHODOLOGY NOTE
Generate a short methodology note (2-4 sentences, plain language) to render on the public result page.
It must state plainly:
- This is a reader survey, self-selected and non-probability — not a poll of the general population.
- Who ran it (the publisher) and what the source story was.
- What the results represent: the views of readers who chose to respond.
- If demographic breakdowns are shown, that they are self-reported.
Do not editorialize, do not inflate the rigor, do not claim representativeness. Understating is safer than overstating.
This note is a liability shield for the publisher — write it as if a hostile journalist will read it first.

OUTPUT
Return ONLY valid JSON, no preamble, no markdown fences, no comments:
{ "methodology_note": string }`;

export async function generateMethodologyNote(opts: {
  publisherName: string;
  storyTitle: string;
  hasBreakdowns: boolean;
}): Promise<string> {
  try {
    const completion = await createCompletion({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      maxTokens: 300,
      messages: [
        { role: 'system', content: METHODOLOGY_NOTE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `publisher: ${opts.publisherName}\nstory_title: ${opts.storyTitle}\nhas_demographic_breakdowns: ${opts.hasBreakdowns}`,
        },
      ],
    });
    const parsed = parseJsonLoose(completion.content);
    return String(parsed.methodology_note || '');
  } catch {
    return `This is a reader survey by ${opts.publisherName} about "${opts.storyTitle}" — self-selected and non-probability, not a poll of the general population. Results reflect only the readers who chose to respond, and any demographic breakdowns shown are self-reported.`;
  }
}

// ---------------------------------------------------------------------------
// Tokens, short codes, and question-type mapping.
// ---------------------------------------------------------------------------

/** ANT-XXXX-XXXX-XXXX-XXXX — the reader's only key to their survey pre-login. */
export function generateAccessToken(): string {
  const group = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `ANT-${group()}-${group()}-${group()}-${group()}`;
}

/** 8-hex-char short code appended to the slug, e.g. prop40-7688ee07. */
export function generateShortCode(): string {
  return crypto.randomBytes(4).toString('hex');
}

export function questionStyleToDbType(style: QuestionStyle): 'single-choice' | 'scale' {
  return style === 'scale_1_5' ? 'scale' : 'single-choice';
}
