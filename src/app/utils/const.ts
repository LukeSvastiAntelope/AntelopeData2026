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

export const GPT_MODELS = [
    // OpenAI — GPT-5.x flagship family
    {
        key: 'gpt-5.2',
        label: 'GPT-5.2',
        type: "openai",
        model: 'gpt-5.2'
    },
    {
        key: 'gpt-5.2-pro',
        label: 'GPT-5.2 Pro',
        type: "openai",
        model: 'gpt-5.2-pro'
    },
    {
        key: 'gpt-5.1',
        label: 'GPT-5.1',
        type: "openai",
        model: 'gpt-5.1'
    },
    {
        key: 'gpt-5',
        label: 'GPT-5',
        type: "openai",
        model: 'gpt-5'
    },
    {
        key: 'gpt-5-pro',
        label: 'GPT-5 Pro',
        type: "openai",
        model: 'gpt-5-pro'
    },
    {
        key: 'gpt-5-mini',
        label: 'GPT-5 Mini',
        type: "openai",
        model: 'gpt-5-mini'
    },
    {
        key: 'gpt-5-nano',
        label: 'GPT-5 Nano',
        type: "openai",
        model: 'gpt-5-nano'
    },
    // OpenAI — GPT-4.1 family (non-reasoning)
    {
        key: 'gpt-4.1',
        label: 'GPT-4.1',
        type: "openai",
        model: 'gpt-4.1'
    },
    {
        key: 'gpt-4.1-mini',
        label: 'GPT-4.1 Mini',
        type: "openai",
        model: 'gpt-4.1-mini'
    },
    {
        key: 'gpt-4.1-nano',
        label: 'GPT-4.1 Nano',
        type: "openai",
        model: 'gpt-4.1-nano'
    },
    // OpenAI — o-series reasoning models
    {
        key: 'o4-mini',
        label: 'o4-mini',
        type: "openai",
        model: 'o4-mini'
    },
    {
        key: 'o3-pro',
        label: 'o3-pro',
        type: "openai",
        model: 'o3-pro'
    },
    {
        key: "o3",
        label: "o3",
        type: "openai",
        model: "o3"
    },
    {
        key: "o3-mini",
        label: "o3-mini",
        type: "openai",
        model: "o3-mini"
    },
    {
        key: 'o1',
        label: 'o1',
        type: "openai",
        model: 'o1'
    },
    // OpenAI — GPT-4o family (legacy)
    {
        key: 'gpt-4o',
        label: 'GPT-4o',
        type: "openai",
        model: 'gpt-4o'
    },
    {
        key: 'gpt-4o-mini',
        label: 'GPT-4o Mini',
        type: "openai",
        model: 'gpt-4o-mini'
    },
    {
        key: 'gpt-4-turbo',
        label: 'GPT-4 Turbo',
        type: "openai",
        model: 'gpt-4-turbo'
    },
    
    // DeepSeek Models
    {
        key: "deepseek-chat",
        label: "DeepSeek Chat",
        type: "deepseek",
        model: "deepseek-chat"
    },
    {
        key: "deepseek-coder",
        label: "DeepSeek Coder",
        type: "deepseek",
        model: "deepseek-coder"
    },
    
    // Google Gemini Models
    {
        key: "gemini-2.0-flash",
        label: "Gemini 2.0 Flash",
        type: "gemini",
        model: "gemini-2.0-flash"
    },
    {
        key: "gemini-1.5-pro",
        label: "Gemini 1.5 Pro",
        type: "gemini",
        model: "gemini-1.5-pro"
    },
    {
        key: "gemini-1.5-flash",
        label: "Gemini 1.5 Flash",
        type: "gemini",
        model: "gemini-1.5-flash"
    },
    
    // Anthropic Claude Models — latest (4.x family)
    {
        key: "claude-opus-4-8",
        label: "Claude Opus 4.8",
        type: "anthropic",
        model: "claude-opus-4-8"
    },
    {
        key: "claude-sonnet-4-6",
        label: "Claude Sonnet 4.6",
        type: "anthropic",
        model: "claude-sonnet-4-6"
    },
    {
        key: "claude-haiku-4-5-20251001",
        label: "Claude Haiku 4.5",
        type: "anthropic",
        model: "claude-haiku-4-5-20251001"
    },
    // Legacy Claude models (kept for backwards compatibility)
    {
        key: "claude-3-5-sonnet-latest",
        label: "Claude 3.5 Sonnet",
        type: "anthropic",
        model: "claude-3-5-sonnet-latest"
    },
];

/**
 * Curated shortlist of the latest GPT and Claude models shown in the
 * AI Survey Builder model picker. Keys must match a GPT_MODELS entry.
 * `recommended: true` marks the default selection.
 */
export const SURVEY_MODELS = [
    { key: 'gpt-4.1',                    label: 'GPT-4.1',            provider: 'OpenAI' as const,    blurb: 'Fast, reliable structured output', recommended: true },
    { key: 'gpt-5.1',                    label: 'GPT-5.1',           provider: 'OpenAI' as const,    blurb: 'Most capable OpenAI model' },
    { key: 'gpt-5',                      label: 'GPT-5',             provider: 'OpenAI' as const,    blurb: 'Advanced reasoning' },
    { key: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6', provider: 'Anthropic' as const, blurb: 'Balanced quality and speed' },
    { key: 'claude-opus-4-8',            label: 'Claude Opus 4.8',   provider: 'Anthropic' as const, blurb: 'Most capable Claude model' },
    { key: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5',  provider: 'Anthropic' as const, blurb: 'Fastest Claude model' },
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
