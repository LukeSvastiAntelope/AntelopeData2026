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
    // OpenAI Models
    {
        key: "o3-mini",
        label: "o3-mini",
        type: "openai",
        model: "o3-mini"
    },
    {
        key: "o3",
        label: "o3",
        type: "openai",
        model: "o3"
    },
    {
        key: 'o1',
        label: 'o1',
        type: "openai",
        model: 'o1'
    },
    {
        key: 'o1-mini',
        label: 'o1-mini',
        type: "openai",
        model: 'o1-mini'
    },
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
    {
        key: 'gpt-4',
        label: 'GPT-4',
        type: "openai",
        model: 'gpt-4'
    },
    // Newer OpenAI models (if available via account)
    {
        key: 'gpt-5',
        label: 'GPT-5',
        type: "openai",
        model: 'gpt-5'
    },
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
        key: 'gpt-3.5-turbo',
        label: 'GPT-3.5 Turbo',
        type: "openai",
        model: 'gpt-3.5-turbo'
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
    
    // Anthropic Claude Models
    {
        key: "claude-3-5-sonnet-latest",
        label: "Claude 3.5 Sonnet",
        type: "anthropic",
        model: "claude-3-5-sonnet-latest"
    },
    {
        key: "claude-3-5-haiku-latest",
        label: "Claude 3.5 Haiku",
        type: "anthropic",
        model: "claude-3-5-haiku-latest"
    },
    {
        key: "claude-3-opus-latest",
        label: "Claude 3 Opus",
        type: "anthropic",
        model: "claude-3-opus-latest"
    },
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
