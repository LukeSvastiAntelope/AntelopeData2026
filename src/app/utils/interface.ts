export interface IAgentProfile {
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
}

export interface IPrinciple {
    title: string;
    description: string;
}