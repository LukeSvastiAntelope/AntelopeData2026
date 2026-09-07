#!/usr/bin/env node
/**
 * Seed featured "example" surveys with realistic US-politics content and dummy
 * response data. Featured surveys are surfaced to every user (see
 * SurveyRepo.getSurveysForUser): owned by another user, status='published',
 * is_public=1, and title contains "Example" or "Pew Research".
 *
 * Connection comes from MYSQL_* env vars. Re-runnable: it deletes any surveys
 * owned by the system user first, then recreates them.
 *
 * Usage:
 *   MYSQL_HOST=... MYSQL_PORT=... MYSQL_USER=... MYSQL_PASSWORD=... MYSQL_DATABASE=... \
 *   node scripts/seed-example-surveys.js
 */
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SYSTEM_EMAIL = 'examples@antelopedata.org';
const SYSTEM_NAME = 'Antelope Examples';

const rand = (n) => Math.floor(Math.random() * n);
const pickWeighted = (options, weights) => {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < options.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return options.length - 1;
};
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  + '-' + crypto.randomBytes(4).toString('hex');

// Demographic pools (roughly US-representative)
const AGE = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const AGE_W = [12, 18, 18, 17, 17, 18];
const PARTY = ['Democrat', 'Republican', 'Independent', 'Other'];
const PARTY_W = [33, 33, 28, 6];
const GENDER = ['male', 'female', 'other'];
const GENDER_W = [48, 50, 2];
const INCOME = ['<$30k', '$30k-$60k', '$60k-$100k', '$100k-$150k', '>$150k'];
const INCOME_W = [20, 25, 25, 18, 12];
const REGIONS = ['Northeast', 'Midwest', 'South', 'West'];

const OPEN_ENDED = [
  'The economy and cost of living are my top concern right now.',
  'I want to see more bipartisan cooperation in Washington.',
  'Healthcare costs need serious attention.',
  'I care most about how candidates plan to handle inflation.',
  'Honestly undecided — waiting to hear more from both sides.',
  'Local issues matter more to me than national politics.',
  'Protecting democratic institutions is what I value most.',
  'Lower taxes and less regulation would help my family.',
  'Education and the future for young people is my priority.',
  'I just want leaders who actually keep their promises.',
];

// Each survey: questions with optional per-option weights to make distributions realistic.
const SURVEYS = [
  {
    title: 'Example: 2024 National Voter Sentiment Poll',
    description: 'A foundational national poll measuring presidential approval, mood of the country, and the issues driving voters. Sample dataset with simulated responses.',
    responses: 1406,
    createdDaysAgo: 41,
    questions: [
      { type: 'single-choice', prompt: 'Generally speaking, do you think things in the country are headed in the right direction or are off on the wrong track?', options: ['Right direction', 'Wrong track', 'Not sure'], weights: [34, 56, 10], required: true },
      { type: 'rating', prompt: 'How would you rate the job the President is doing?', options: ['Strongly disapprove', 'Disapprove', 'Neither', 'Approve', 'Strongly approve'], weights: [26, 18, 14, 24, 18], required: true },
      { type: 'single-choice', prompt: 'Which issue matters most to your vote this year?', options: ['Economy & inflation', 'Healthcare', 'Immigration', 'Abortion', 'Crime & safety', 'Climate change', 'Democracy & elections'], weights: [33, 13, 14, 11, 10, 9, 10], required: true },
      { type: 'single-choice', prompt: 'If the election were held today, which party’s candidate would you support for Congress?', options: ['Democratic candidate', 'Republican candidate', 'Third party', 'Undecided'], weights: [44, 45, 5, 6], required: true },
      { type: 'rating', prompt: 'How confident are you that elections in your state are conducted fairly?', options: ['Not at all confident', 'Slightly', 'Moderately', 'Very', 'Completely confident'], weights: [12, 14, 26, 30, 18], required: false },
      { type: 'rating', prompt: 'How would you describe the current state of the national economy?', options: ['Very poor', 'Poor', 'Fair', 'Good', 'Very good'], weights: [16, 26, 34, 20, 4], required: false },
      { type: 'multiple-choice', prompt: 'Which sources do you rely on most for political news? (Select all that apply)', options: ['Cable TV news', 'Local news', 'Social media', 'Newspapers', 'Podcasts', 'Friends & family'], required: false, multi: true },
      { type: 'yes-no', prompt: 'Are you certain you will vote in the upcoming election?', options: ['Yes', 'No'], weights: [78, 22], required: true },
      { type: 'rating', prompt: 'How motivated are you to vote compared to previous elections?', options: ['Much less', 'Less', 'About the same', 'More', 'Much more'], weights: [8, 10, 32, 28, 22], required: false },
      { type: 'text', prompt: 'In your own words, what is the single most important issue facing the country today?', required: false },
    ],
  },
  {
    title: 'Example: Key Issues & Policy Priorities Survey',
    description: 'An issue-priorities deep dive ranking how voters weigh the economy, healthcare, immigration and more. Sample dataset with simulated responses.',
    responses: 186,
    createdDaysAgo: 18,
    questions: [
      { type: 'rating', prompt: 'How important is reducing inflation and the cost of living to you?', options: ['Not important', 'Slightly', 'Moderately', 'Very', 'Extremely important'], weights: [3, 5, 14, 30, 48], required: true },
      { type: 'rating', prompt: 'How important is improving access to affordable healthcare?', options: ['Not important', 'Slightly', 'Moderately', 'Very', 'Extremely important'], weights: [4, 8, 18, 34, 36], required: true },
      { type: 'rating', prompt: 'How important is securing the border and immigration reform?', options: ['Not important', 'Slightly', 'Moderately', 'Very', 'Extremely important'], weights: [10, 10, 18, 28, 34], required: true },
      { type: 'rating', prompt: 'How important is addressing climate change to you?', options: ['Not important', 'Slightly', 'Moderately', 'Very', 'Extremely important'], weights: [16, 12, 20, 26, 26], required: true },
      { type: 'single-choice', prompt: 'Which approach to taxes do you prefer?', options: ['Lower taxes, less spending', 'Higher taxes on high earners', 'Keep taxes about the same', 'Not sure'], weights: [34, 34, 20, 12], required: false },
      { type: 'multiple-choice', prompt: 'Which areas should receive more federal funding? (Select all that apply)', options: ['Education', 'Infrastructure', 'Defense', 'Healthcare', 'Social Security', 'Border security', 'Clean energy'], required: false, multi: true },
      { type: 'single-choice', prompt: 'On most political issues, how would you describe your views?', options: ['Very liberal', 'Somewhat liberal', 'Moderate', 'Somewhat conservative', 'Very conservative'], weights: [14, 20, 32, 20, 14], required: true },
      { type: 'yes-no', prompt: 'Do you think the two parties are capable of working together to solve major problems?', options: ['Yes', 'No'], weights: [38, 62], required: false },
      { type: 'text', prompt: 'Is there a policy area you feel politicians are ignoring? Tell us about it.', required: false },
    ],
  },
  {
    title: 'Example: Candidate Favorability & Debate Reaction',
    description: 'A post-debate reaction poll capturing candidate favorability and who voters felt performed best. Sample dataset with simulated responses.',
    responses: 113,
    createdDaysAgo: 6,
    questions: [
      { type: 'rating', prompt: 'Overall, what is your impression of Candidate A?', options: ['Very unfavorable', 'Unfavorable', 'Neutral', 'Favorable', 'Very favorable'], weights: [24, 16, 18, 22, 20], required: true },
      { type: 'rating', prompt: 'Overall, what is your impression of Candidate B?', options: ['Very unfavorable', 'Unfavorable', 'Neutral', 'Favorable', 'Very favorable'], weights: [22, 18, 18, 22, 20], required: true },
      { type: 'single-choice', prompt: 'Who do you think performed better in the most recent debate?', options: ['Candidate A', 'Candidate B', 'About the same', 'Did not watch'], weights: [38, 36, 14, 12], required: true },
      { type: 'multiple-choice', prompt: 'Which qualities matter most to you in a candidate? (Select all that apply)', options: ['Honesty', 'Experience', 'Strong leadership', 'Shares my values', 'Cares about people like me', 'Can get things done'], required: false, multi: true },
      { type: 'rating', prompt: 'How likely are you to change your vote based on the debates?', options: ['Very unlikely', 'Unlikely', 'Unsure', 'Likely', 'Very likely'], weights: [40, 24, 16, 12, 8], required: false },
      { type: 'single-choice', prompt: 'After the debate, are you more or less enthusiastic about voting?', options: ['Much less', 'Less', 'No change', 'More', 'Much more'], weights: [6, 10, 40, 26, 18], required: false },
      { type: 'yes-no', prompt: 'Did the debate address the issues you care about most?', options: ['Yes', 'No'], weights: [44, 56], required: false },
      { type: 'text', prompt: 'What is one thing you wish the candidates had talked about?', required: false },
    ],
  },
];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true,
  });
  console.log(`Connected to ${process.env.MYSQL_HOST}/${process.env.MYSQL_DATABASE}`);

  // 1. System user
  let [rows] = await conn.execute('SELECT id FROM users WHERE email = ?', [SYSTEM_EMAIL]);
  let systemId;
  if (rows.length) {
    systemId = rows[0].id;
  } else {
    const hash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);
    const [r] = await conn.execute(
      'INSERT INTO users (email, password, display_name, is_verified, role) VALUES (?, ?, ?, 1, ?)',
      [SYSTEM_EMAIL, hash, SYSTEM_NAME, 'admin']
    );
    systemId = r.insertId;
  }
  console.log(`System user id: ${systemId}`);

  // 2. Clean up any previous example surveys owned by the system user (cascade by hand)
  const [old] = await conn.execute('SELECT id FROM surveys WHERE created_by = ?', [systemId]);
  for (const s of old) {
    await conn.execute('DELETE a FROM survey_answers a JOIN survey_responses r ON a.response_id = r.id WHERE r.survey_id = ?', [s.id]);
    await conn.execute('DELETE FROM survey_responses WHERE survey_id = ?', [s.id]);
    await conn.execute('DELETE FROM survey_questions WHERE survey_id = ?', [s.id]);
    await conn.execute('DELETE FROM surveys WHERE id = ?', [s.id]);
  }
  if (old.length) console.log(`Removed ${old.length} previous example survey(s)`);

  // 3. Recreate
  for (const def of SURVEYS) {
    const createdAt = new Date(Date.now() - def.createdDaysAgo * 86400000)
      .toISOString().slice(0, 19).replace('T', ' ');
    const [sr] = await conn.execute(
      `INSERT INTO surveys (title, description, slug, created_by, is_public, status, source, anonymity_level, demographics_required, created_at)
       VALUES (?, ?, ?, ?, 1, 'published', 'native', 'semi_anonymous', 0, ?)`,
      [def.title, def.description, slugify(def.title), systemId, createdAt]
    );
    const surveyId = sr.insertId;

    // questions
    const qIds = [];
    for (let i = 0; i < def.questions.length; i++) {
      const q = def.questions[i];
      const [qr] = await conn.execute(
        `INSERT INTO survey_questions (survey_id, type, prompt, options, is_required, question_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [surveyId, q.type, q.prompt, q.options ? JSON.stringify(q.options) : null, q.required ? 1 : 0, i + 1]
      );
      qIds.push(qr.insertId);
    }

    // responses (batched) + answers (batched)
    const N = def.responses;
    const respValues = [];
    for (let n = 0; n < N; n++) {
      const age = AGE[pickWeighted(AGE, AGE_W)];
      const party = PARTY[pickWeighted(PARTY, PARTY_W)];
      const gender = GENDER[pickWeighted(GENDER, GENDER_W)];
      const income = INCOME[pickWeighted(INCOME, INCOME_W)];
      const region = REGIONS[rand(REGIONS.length)];
      // Keys must match the generated columns: ageRange, political, income, gender, interests.
      const demo = JSON.stringify({ ageRange: age, political: party, gender, income, interests: [region] });
      const submitted = new Date(new Date(createdAt).getTime() + rand(def.createdDaysAgo * 86400000))
        .toISOString().slice(0, 19).replace('T', ' ');
      respValues.push([surveyId, demo, 'semi_anonymous', 'native', submitted]);
    }
    // Insert responses in one multi-row statement; ids are sequential from insertId.
    // age_range/political_affiliation/income_bracket/gender are GENERATED from demographics.
    const placeholders = respValues.map(() => '(?,?,?,?,?)').join(',');
    const flat = respValues.flat();
    const [rr] = await conn.query(
      `INSERT INTO survey_responses (survey_id, demographics, anonymity_level, source, submitted_at) VALUES ${placeholders}`,
      flat
    );
    const firstRespId = rr.insertId;

    // answers
    let answerRows = [];
    const flushAnswers = async () => {
      if (!answerRows.length) return;
      const ph = answerRows.map(() => '(?,?,?,?)').join(',');
      await conn.query(
        `INSERT INTO survey_answers (response_id, question_id, answer_value, answer_code) VALUES ${ph}`,
        answerRows.flat()
      );
      answerRows = [];
    };
    for (let n = 0; n < N; n++) {
      const responseId = firstRespId + n;
      for (let qi = 0; qi < def.questions.length; qi++) {
        const q = def.questions[qi];
        const qId = qIds[qi];
        if (q.type === 'text') {
          if (Math.random() < 0.45) answerRows.push([responseId, qId, OPEN_ENDED[rand(OPEN_ENDED.length)], null]);
          continue;
        }
        if (q.multi) {
          const k = 1 + rand(Math.min(3, q.options.length));
          const chosen = [...q.options].sort(() => Math.random() - 0.5).slice(0, k);
          answerRows.push([responseId, qId, chosen.join('; '), null]);
          continue;
        }
        const idx = q.weights ? pickWeighted(q.options, q.weights) : rand(q.options.length);
        answerRows.push([responseId, qId, q.options[idx], idx + 1]);
      }
      if (answerRows.length >= 1000) await flushAnswers();
    }
    await flushAnswers();

    console.log(`✓ ${def.title} (id ${surveyId}) — ${def.questions.length} questions, ${N} responses`);
  }

  await conn.end();
  console.log('Done.');
}

main().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
