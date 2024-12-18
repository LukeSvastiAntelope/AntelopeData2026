import { SportsEvent } from "../interface";

export interface SportsDBTeam {
    strTeam: string;
    strTeamBadge: string;
    strTeamLogo: string;
    strTeamFanart1: string;
}

export interface SportsDBEvent {
    strEvent: string;
    strThumb: string;
    strBanner: string;
}

export interface GoogleImageResult {
    original: string;
    source: string;
    title: string;
}

export interface AIResponse {
    question: string;
    description: string;
    category: string;
    endDate: string;
    confidence: number;
    event?: SportsEvent;
    choice: string;
    reasoning: string;
    sources: string[];
} 