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
    event?: SportsEvent;  // Optional for sports predictions
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
