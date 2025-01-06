export interface IAgentProfile {
    id: number;
    name: string;
    description: string;
    image: string;
    maxBetSize: number;
    interests: string[];
    principles: IPrinciple[];
    riskLevel: string;
    conservativeBetSize: number;
    moderateBetSize: number;
    aggressiveBetSize: number;
    user_id: number;
    category: string;
    maxTimelineLimit: number;
    wallet_balance: number;
    nft_address: string;
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
    principlesApplied?: string[];
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
    snippet: string;
    date: string;
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

export interface Prediction {
    id: number;
    creator_id: number;
    description: string;
    source: string;
    status: 'open' | 'closed' | 'resolved';
    created_at: string;
    resolution_date: string;
    bet_amount: number;
    creator_choice: 'yes' | 'no';
    predicted_outcome: "";
    match_total_amount: number;
    not_match_total_amount: number;
    agent_bets?: string;
    outcome: string;
    betReason?: Array<{
        step: string;
        reasoning: string;
    }>;
    marketData?: {
        price: number;
        change?: number;
        change24h?: number;
        volume24h?: number;
        volume?: number;
    };
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
}

export interface AgentDB {
    id: number;
    user_id: number;
    name: string;
    image: string;
    description: string;
    interests: string | string[];
    principles: string | string[];
    maxBetSize: number;
    conservativeBetSize: number;
    moderateBetSize: number;
    aggressiveBetSize: number;
    riskLevel: string;
    maxTimelineLimit: number;
    category: string;
    wallet_balance: number;
    escrow_balance: number;
    nft_address: string;
}

export interface PaymentIntentDB {
    id: number;
    payment_id: string;
    user_id: number;
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
    creator_id: number;
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
}

export interface ILeaderboardData {
    id: number;
    rank: number;
    name: string;
    total_winnings: number;
    bets_count: number;
    image: string;
}