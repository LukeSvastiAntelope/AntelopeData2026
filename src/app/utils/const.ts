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
    {
        key: 'gpt-4o',
        label: 'gpt-4o',
        type: "openai",
        model: 'gpt-4o'
    },
    {
        key: "gemini-2",
        label: "Gemini 2",
        type: "gemini",
        model: "gemini-2.0-flash"
    },
    {
        key: "claude-3-5-sonnet",
        label: "Claude 3.5 Sonnet",
        type: "anthropic",
        model: "claude-3-5-sonnet-latest"
    },
    {
        key: "claude-3-5-haiku",
        label: "Claude 3.5 Haiku",
        type: "anthropic",
        model: "claude-3-5-haiku-latest"
    },
    {
        key: "claude-3-opus",
        label: "Claude 3 Opus",
        type: "anthropic",
        model: "claude-3-opus-latest"
    },
    // {
    //     key: "deepseek",
    //     label: "deepseek",
    // },
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
