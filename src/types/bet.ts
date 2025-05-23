export interface IBet {
  id: number;
  description: string;
  reason: string;
  choice: string;
  agent_bets?: IBet[];
  predicted_outcome?: string;
  creator_choice?: string;
  amount: number;
  source: string;
  status: string;
  outcome: string;
  created_at: string;
  resolution_date: string;
  str_thumb?: string;
  bet_id?: number;
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
  agent_bets: IBet[];
}

export interface IActivity {
  id: number;
  description?: string;
  created_at: string;
  source?: string;
  user_id?: number;
  agent_id?: number;
  prediction_id?: number;
  bet_amount?: number;
  creator_choice?: string;
  str_thumb?: string;
  username?: string;
  amount: number;
  choice?: string;
  type?: string;
  bet_id?: number;
  user_avatar?: string;
  agent_name?: string;
  agent_image?: string;
} 