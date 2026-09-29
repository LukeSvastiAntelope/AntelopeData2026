export const AGENT_RISK_LEVEL = [
    'conservative',
    'moderate',
    'aggressive'
]

export const CATEGORIES = [
    'General',
    'Markets',
    'Crypto',
    'Sports'
]

export const SPORTS_CATEGORIES = [
    'NFL',
    'NBA',
    'Soccer',
    'MLB',
    'NHL',
    'Tennis',
    'Golf',
    'Racing',
    'Other'
]

/**
 * Model picker entries — Anthropic gateway tiers only.
 * Concrete model ids live exclusively in ai-service DEFAULT_TIER_MODELS / env.
 * Export name kept as GPT_MODELS for existing imports.
 */
export const GPT_MODELS = [
    {
        key: "workhorse",
        label: "Workhorse (Sonnet)",
        type: "anthropic",
        model: "workhorse"
    },
    {
        key: "heavy",
        label: "Heavy (Opus)",
        type: "anthropic",
        model: "heavy"
    },
    {
        key: "cheap",
        label: "Cheap (Haiku)",
        type: "anthropic",
        model: "cheap"
    },
];

/**
 * Anthropic-only model picker for the AI Survey Builder.
 * Keys are gateway tiers (resolved in ai-service).
 */
export const SURVEY_MODELS = [
    { key: 'workhorse', label: 'Workhorse (Sonnet)', provider: 'Anthropic' as const, blurb: 'Default — analytics, agents, drafting', recommended: true },
    { key: 'heavy',     label: 'Heavy (Opus)',       provider: 'Anthropic' as const, blurb: 'Deepest analysis — use selectively' },
    { key: 'cheap',     label: 'Cheap (Haiku)',      provider: 'Anthropic' as const, blurb: 'High-volume classification & summarization' },
];

export const PLUGINS = [
    {
        key: "google_news",
        label: "Google News",
    },
    {
        key: "google_finance",
        label: "Google Finance",
    },
    {
        key: "reddit",
        label: "Reddit",
    },
    {
        key: "twitter",
        label: "x.com",
    },
    {
        key: "hackernews",
        label: "Hackernews",
    },
    {
        key: "coinmarketcap",
        label: "CoinmarketCap",
    },
    {
        key: "custom",
        label: "Custom Source",
    }
];
