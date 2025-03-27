export const AGENT_RISK_LEVEL = [
    'conservative',
    'moderate',
    'aggressive'
]

export const CATEGORIES = [
    'General',
    'Markets',
    'Crypto',
    'Soccer',
    'English Premier League',
    'NBA',
    'NFL',
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
