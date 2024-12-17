export interface IAgentProfile {
    id: number;
    name: string;
    description: string;
    image: string;
    maxBetSize: number;
    interests: string[];
    principles: IPrinciple[];
    riskLevel: 'conservative' | 'moderate' | 'aggressive';
    conservativeBetSize: number;
    moderateBetSize: number;
    aggressiveBetSize: number;
    user_id: number;
    category: string;
    maxTimelineLimit: number;
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
    choice: 'Yes' | 'No';
    confidence: number;
    reasoning: string;
    event?: SportsEvent;  // Optional for sports predictions
    images?: PredictionImage[];
    sources?: string[];
    principlesApplied?: string[];
    principleScore?: number;
    userId?: number;
    agentId?: number;
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