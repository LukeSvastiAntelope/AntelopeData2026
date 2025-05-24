import { SetStateAction } from "react";

import { Dispatch } from "react";

export interface IPlatformAccount {
    platform_id: number;
    platform: string;
}

export interface IAgentProfile {
    id: number;
    name: string;
    description: string;
    image: string;
    maxBetSize: number;
    interests: string[];
    principles: string;
    riskLevel: string;
    conservativeBetSize: number;
    moderateBetSize: number;
    aggressiveBetSize: number;
    user_id: number;
    category: string;
    sport_preference?: string;
    maxTimelineLimit: number;
    wallet_balance: number;
    nft_address: string;
    trainCount: number;
    train_index: string;
    ipfs_hash?: string;
    platform_accounts: IPlatformAccount[];
    is_bet: number;
    role?: "user" | "admin";
    model: string;
    plugins: string[];
    successRate?: number;
    username?: string;
    created_at?: string;
    updated_at?: string;
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    system_prompt?: string;
    telegram_chat_id?: string;
    telegram_username?: string;
    telegram_first_name?: string;
    telegram_last_name?: string;
    telegram_photo_url?: string;
    is_telegram_connected?: boolean;
    is_onboarded?: boolean;
    total_winnings?: number;
}

export interface IFormDataAgentProfile {
    id: number;
    user_id: number;
    name: string;
    description: string;
    maxBetSize: number;
    interests: string;
    riskLevel: string;
    conservativeBetSize: number;
    moderateBetSize: number;
    aggressiveBetSize: number;
    principles: string;
    image: string;
    maxTimelineLimit: number;
    category: string;
    model: string;
    plugins: string;
    is_bet: number;
    sport_preference?: string;
    is_onboarded?: boolean;
}

export interface IPrinciple {
    title: string;
    description: string;
}

export interface ILeague {
    idLeague: string;
    strLeague: string;
    strSport: string;
}

export interface IMatch {
    idEvent: string;
    strEvent: string;
    strHomeTeam: string;
    strAwayTeam: string;
    dateEvent: string;
    strLeague: string;
    strThumb: string;
}

export interface AutomatedPrediction {
    question: string;
    description: string;
    category: string;
    endDate: Date;
    initialStake: number;
    choice: string;
    confidence: number;
    reasoning: string;
    event?: PredictionEvent;  // Optional for sports predictions
    images?: PredictionImage[];
    sources?: string[];
    principlesApplied?: string;
    principleScore?: number;
    userId?: number;
    agentId?: number;
    pineconeId?: string;
}

export interface SportsEvent {
    idEvent: string;
    strEvent: string;
    dateEvent: string;
    strVenue: string;
    strHomeTeam: string;
    strAwayTeam: string;
    strLeague: string;
    strSeason: string;
    idLeague: string;
    strThumb: string;
}

export interface PredictionEvent {
    winner: string;
    event_id: string;
    league_id: string;
    home_team: string;
    away_team: string;
}

export interface PredictionImage {
    url: string;
    source: string;
    title: string;
}

export interface TeamStats {
    name: string;
    logo?: string;
    recentForm?: string;
    ranking?: number;
}

export interface NewsItem {
    title: string;
    link: string;
    date: string;
    source?: string;
}

export interface BetDecision {
    predictionId: number;
    agentId: number;
    betAmount: number;
    choice: 'Yes' | 'No';
    confidence: number;
    reasoning: string;
    timestamp: Date;
    riskAssessment: string;
    opposingCreator?: boolean;
    userId?: number;
    pineconeId?: string;
}

export interface BetReasonStep {
    step: 'interesting' | 'marketData' | 'similarPredictions' | 'newsAnalysis' | 'finalDecision';
    reasoning: string;
}

export interface MarketData {
    symbol: string;
    price: number;
    change24h?: number;
    volume24h?: number;
    lastUpdated?: string;
    change?: number;
    volume?: number;
}

export interface Prediction {
    id: number;
    user_id: number;
    description: string;
    source: string;
    status: 'open' | 'closed' | 'resolved';
    created_at: string;
    resolution_date: string;
    bet_amount: number;
    creator_choice: string;
    predicted_outcome: string;
    agent_bets?: string;
    outcome: string;
    team_a?: string;
    team_b?: string;
    betReason?: BetReasonStep[];
    marketData?: MarketData;
    reasoning?: string;
    context?: string;
    choices?: string;
}

export interface GroupAnalysis {
    confidenceScores: Record<string, number>;
    riskScores: Record<string, number>;
    analysis: Record<string, {
        disagreement: number;
        reasoning: string;
    }>;
    riskAssessment: Record<string, string>;
    reasoning: Record<string, string>;
}

export interface ValidatedAnalysis {
    confidenceScores: { [key: string]: number };
    riskScores: { [key: string]: number };
    analysis: {
        [key: string]: {
            disagreement: number;
            reasoning: string;
        }
    };
    riskAssessment: { [key: string]: string };
    reasoning: { [key: string]: string };
}

export interface PredictionAnalysis {
    id: number;
    shouldBet: boolean;
    recommendedChoice: 'Yes' | 'No';
    confidence: number;
    reasoning: string;
    riskAssessment: string;
}

export interface GroupedPredictions {
    [topic: string]: Prediction[];
}

export interface IBet {
    id: string;
    description: string;
    choice: string;
    amount: number;
    status: string;
    created_at: string;
    str_thumb: string;
    source: string;
    predicted_outcome: string;
    outcome: string;
    resolution_date: string;
    creator_choice: string;
    reason: string;
    pinecone_id: string;
    agent_id: number;
    bet_id?: number;
    user_id: number;
}

export interface SerpApiNewsResult {
    title: string;
    link: string;
    snippet: string;
    date: string;
    source?: string;
}

export interface UserDB {
    id: number;
    telegram_id: string;
    username: string;
    wallet_balance: number;
    total_winnings: number;
    escrow_balance: number;
    password: string;
    is_verified: number;
    role: "user" | "admin";
}

export interface AgentDB {
    id: number;
    name: string;
    description: string;
    image: string;
    maxBetSize: number;
    interests: string |string[];
    principles: string;
    riskLevel: string;
    conservativeBetSize: number;
    moderateBetSize: number;
    aggressiveBetSize: number;
    user_id: number;
    category: string;
    maxTimelineLimit: number;
    wallet_balance: number;
    nft_address: string;
    trainCount: number;
    train_index: string;
    ipfs_hash?: string;
    platform_accounts: IPlatformAccount[];
    is_bet: number;
    role?: "user" | "admin";
    model: string;
    plugins: string | string[];
    successRate?: number;
    username?: string;
}

export interface PaymentIntentDB {
    id: number;
    payment_id: string;
    user_id: number;
    platform_id: number;
    agent_id: number;
    amount: number;
    credit_amount: number;
    payment_method: string;
    from_address: string;
    status: string;
    expires_at: string;
}

export interface PredictionDB {
    id: number;
    user_id: number;
    platform_id: number;
    description: string;
    source: string;
    status: string;
    created_at: string;
    resolution_date: string;
    bet_amount: number;
    creator_choice: string;
    source_url: string;
    bet_type: string;
    fixed_odds: string;
    event_id: number;
    league_id: number;
    team_a: string;
    team_b: string;
    str_thumb: string;
    outcome: string;
    predicted_outcome: string;
    source_type: string;
    updated_at: string;
    group_info: string;
    group_id: string;
    agent_id: number;
    pinecone_id: string;
    bets?: IBet[];
    yes_count: number;
    no_count: number;
    log?: string;
    choices?: string[] | string;
}

export interface IPrediction {
    id: string;
    description: string;
    source: string;
    predicted_outcome: string;
    creator_choice: string;
    bets_count: number;
    status: string;
    bet_amount: number;
    resolution_date: string;
    str_thumb: string;
    outcome: string;
    created_at: string;
    yes_amount?: number;
    no_amount?: number;
    agent_bets?: IBet[];
    league_id: number;
}

export interface ILeaderboardData {
    id: number;
    rank: number;
    name: string;
    total_winnings: number;
    bets_count: number;
    image: string;
    win_rate: number;
    wins: number;
    losses: number;
    open: number;
}

export interface CreatePredictionInput {
    user_id: number;
    description: string;
    source: string;
    source_url: string;
    created_at: string;
    status: string;
    bet_amount: number;
    creator_choice: string;
    event_id: number;
    league_id: number;
    team_a: string;
    team_b: string;
    str_thumb: string;
    predicted_outcome: string;
    agent_id: number;
    source_type: string;
    bet_type: string;
    resolution_date: string;
    context?: string;
}

export interface IAskAgentProps {
    agentProfile: IAgentProfile | null;
    setAgentProfile: Dispatch<SetStateAction<IAgentProfile | null>>;
}

export interface ChatMessage {
    role: "user" | "agent";
    content: string | React.ReactNode;
    type: "training" | "ask" | "strategy";
}

export interface IAgentContext {
    agent: IAgentProfile | null;
    setAgent: Dispatch<SetStateAction<IAgentProfile | null>>;
    user: UserDB | null;
    setUser: Dispatch<SetStateAction<UserDB | null>>;
    isAgentProfileLoading: boolean;
    setIsAgentProfileLoading: Dispatch<SetStateAction<boolean>>;
}