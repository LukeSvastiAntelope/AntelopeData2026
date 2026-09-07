import { createCompletion } from '@/app/utils/services/ai-service';

export type ConsultantAction = {
  id: string;
  label: string;
  description: string;
  href: string;
};

export type ConsultantTurnResult = {
  reply: string;
  actions: ConsultantAction[];
  modelUsed: string;
};

export type ConsultantMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type CampaignBrief = {
  candidateName?: string | null;
  office?: string | null;
  district?: string | null;
  state?: string | null;
  party?: string | null;
  electionDate?: string | null;
  topIssues?: string | null;
};

const DEFAULT_MODEL =
  process.env.ANTHROPIC_API_KEY
    ? 'claude-sonnet-4-20250514'
    : process.env.OPENAI_API_KEY
      ? 'gpt-4o'
      : 'claude-sonnet-4-20250514';

const SYSTEM_PROMPT = `You are Antelope's Campaign Consultant Expert Agent — a seasoned political strategist for hyperlocal and downballot races (school board, city council, county, state house, etc.).

Your job:
- Help candidates hit the ground running with a practical campaign plan
- Ask clarifying questions when race context is missing (office, district, timeline, opponents, budget band)
- Ground advice in polling/listening when data exists; otherwise say what data to collect next
- Prefer concrete next steps over vague strategy jargon
- Never invent endorsements, poll numbers, or opponent quotes
- Stay nonpartisan in method: advise the candidate in front of you

Response style:
- Clear markdown with short sections
- Lead with the most important recommendation
- End with 2-4 numbered next actions the candidate can take this week

After your markdown advice, append a single JSON block (and nothing after it) in this exact form:
\`\`\`json
{"actions":[{"id":"create_baseline_survey","label":"Create a baseline voter survey","description":"Short description","href":"/create/survey/ai"},{"id":"open_analytics","label":"Analyze existing poll data","description":"Short description","href":"/cohort-chat"},{"id":"import_data","label":"Import existing survey data","description":"Short description","href":"/surveys/import"}]}
\`\`\`

Only include actions that make sense for the conversation. Valid href prefixes:
- /create/survey/ai
- /cohort-chat
- /surveys/import
- /dashboard
- /voter-file
- /agents/campaign-consultant
`;

function buildBriefBlock(brief?: CampaignBrief | null) {
  if (!brief) return 'No campaign brief provided yet.';
  const lines = [
    brief.candidateName && `Candidate: ${brief.candidateName}`,
    brief.office && `Office: ${brief.office}`,
    brief.district && `District: ${brief.district}`,
    brief.state && `State: ${brief.state}`,
    brief.party && `Party: ${brief.party}`,
    brief.electionDate && `Election: ${brief.electionDate}`,
    brief.topIssues && `Top issues: ${brief.topIssues}`,
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : 'No campaign brief provided yet.';
}

function extractActions(content: string): { cleanReply: string; actions: ConsultantAction[] } {
  const fence = content.match(/```json\s*([\s\S]*?)```/i);
  if (!fence) {
    return { cleanReply: content.trim(), actions: defaultActions() };
  }
  let actions: ConsultantAction[] = defaultActions();
  try {
    const parsed = JSON.parse(fence[1]);
    if (Array.isArray(parsed?.actions)) {
      actions = parsed.actions
        .filter((a: any) => a && typeof a.label === 'string' && typeof a.href === 'string')
        .map((a: any) => ({
          id: String(a.id || a.label).toLowerCase().replace(/\s+/g, '_').slice(0, 64),
          label: String(a.label).slice(0, 80),
          description: String(a.description || '').slice(0, 160),
          href: String(a.href).startsWith('/') ? String(a.href) : '/cohort-chat',
        }))
        .slice(0, 4);
    }
  } catch {
    // keep defaults
  }
  const cleanReply = content.replace(fence[0], '').trim();
  return { cleanReply, actions: actions.length ? actions : defaultActions() };
}

function defaultActions(): ConsultantAction[] {
  return [
    {
      id: 'create_baseline_survey',
      label: 'Create a baseline voter survey',
      description: 'Use AI to draft a short district poll so the consultant has real numbers.',
      href: '/create/survey/ai',
    },
    {
      id: 'import_data',
      label: 'Import existing poll data',
      description: 'Bring in CSV/Excel or another survey tool so analysis can start immediately.',
      href: '/surveys/import',
    },
    {
      id: 'open_analytics',
      label: 'Open analytics chat',
      description: 'Ask questions against a survey once data is loaded.',
      href: '/cohort-chat',
    },
  ];
}

export function getConsultantStarterPrompts(): string[] {
  return [
    'I am running for local office and need a 30-day campaign kickoff plan.',
    'Help me decide what to poll first in my district and why.',
    'Draft a message framework for persuadable voters vs base turnout.',
    'What should my weekly consultant checklist look like until election day?',
  ];
}

export async function runCampaignConsultantTurn(params: {
  messages: ConsultantMessage[];
  brief?: CampaignBrief | null;
  model?: string;
}): Promise<ConsultantTurnResult> {
  const model = params.model || DEFAULT_MODEL;
  const history = (params.messages || []).slice(-12);

  const completion = await createCompletion({
    model,
    maxTokens: 1800,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content: `Campaign brief:\n${buildBriefBlock(params.brief)}`,
      },
      ...history.map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      })),
    ],
  });

  const { cleanReply, actions } = extractActions(completion.content || '');
  return {
    reply:
      cleanReply ||
      'I can help you build a turnkey campaign plan. Tell me the office you are running for, your district, and your election date.',
    actions,
    modelUsed: model,
  };
}

export function consultantOfflineFallback(userMessage: string): ConsultantTurnResult {
  const lower = userMessage.toLowerCase();
  const wantsPoll = /poll|survey|research|baseline/.test(lower);
  const reply = [
    '## Campaign Consultant (setup mode)',
    '',
    'I am ready to act as your campaign consultant, but no AI provider key is configured in this environment yet (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`).',
    '',
    '### What I will do once connected',
    '1. Learn your race (office, district, timeline, opponents)',
    '2. Recommend a listening plan (what to poll first)',
    '3. Turn findings into talking points, weekly priorities, and outreach experiments',
    '4. Hand you concrete Antelope actions (create survey, import data, analyze results)',
    '',
    wantsPoll
      ? '### Suggested next step now\nStart with a **baseline voter survey** or **import existing poll data** so analytics has something real to work with.'
      : '### Suggested next step now\nShare your office + district + election date, then create or import poll data so advice is grounded.',
  ].join('\n');

  return {
    reply,
    actions: defaultActions(),
    modelUsed: 'offline-fallback',
  };
}
