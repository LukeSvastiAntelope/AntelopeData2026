/**
 * Political Modeling Engine
 *
 * Takes aggregated survey data and produces election outcome predictions:
 *  - Win probabilities via Monte Carlo simulation
 *  - Likely-voter screens using voting_frequency demographic
 *  - Turnout estimates by demographic segment
 *  - Key driver analysis
 */

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface SurveyResponseRow {
  demographics: Record<string, string>;
  answers: Record<string, string | string[]>;
}

export interface CandidateResult {
  name: string;
  rawSupport: number;
  likelyVoterSupport: number;
  winProbability: number;
  marginOfError: number;
}

export interface SegmentBreakdown {
  segment: string;
  sampleSize: number;
  candidateSupport: Record<string, number>;
  turnoutEstimate: number;
}

export interface KeyDriver {
  segment: string;
  impact: 'high' | 'medium' | 'low';
  description: string;
}

export interface PredictionResult {
  candidates: CandidateResult[];
  totalSampleSize: number;
  likelyVoterSampleSize: number;
  segmentBreakdowns: SegmentBreakdown[];
  keyDrivers: KeyDriver[];
  overallMarginOfError: number;
  confidenceLevel: number;
  methodology: string;
}

// -----------------------------------------------------------------------
// Historical turnout rates by segment (national averages)
// -----------------------------------------------------------------------

const TURNOUT_RATES: Record<string, number> = {
  // By voting frequency
  'Every election': 0.92,
  'Most elections': 0.75,
  'Occasionally': 0.45,
  'Rarely': 0.2,
  'Never voted': 0.08,
  // By age
  '18-24': 0.48,
  '25-34': 0.55,
  '35-44': 0.62,
  '45-54': 0.67,
  '55-64': 0.72,
  '65+': 0.76,
  // Default
  default: 0.6,
};

// -----------------------------------------------------------------------
// Likely Voter Screen
// -----------------------------------------------------------------------

function isLikelyVoter(demographics: Record<string, string>): boolean {
  const frequency = demographics.voting_frequency;
  if (!frequency) return true; // If unknown, include
  return ['Every election', 'Most elections'].includes(frequency);
}

function getTurnoutRate(demographics: Record<string, string>): number {
  // Prefer voting frequency if available
  if (demographics.voting_frequency && TURNOUT_RATES[demographics.voting_frequency] !== undefined) {
    return TURNOUT_RATES[demographics.voting_frequency];
  }
  // Fall back to age-based
  if (demographics.age && TURNOUT_RATES[demographics.age] !== undefined) {
    return TURNOUT_RATES[demographics.age];
  }
  return TURNOUT_RATES.default;
}

// -----------------------------------------------------------------------
// Monte Carlo Simulation
// -----------------------------------------------------------------------

function monteCarloWinProbability(
  candidateShare: number,
  sampleSize: number,
  simulations: number = 10000
): number {
  // Standard error of proportion
  const se = Math.sqrt((candidateShare * (1 - candidateShare)) / Math.max(sampleSize, 1));

  let wins = 0;
  for (let i = 0; i < simulations; i++) {
    // Box-Muller transform for normal random
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const simulated = candidateShare + z * se;
    if (simulated > 0.5) wins++;
  }

  return wins / simulations;
}

// -----------------------------------------------------------------------
// Margin of Error (95% CI)
// -----------------------------------------------------------------------

function marginOfError(proportion: number, sampleSize: number): number {
  const z = 1.96; // 95% confidence
  return z * Math.sqrt((proportion * (1 - proportion)) / Math.max(sampleSize, 1));
}

// -----------------------------------------------------------------------
// Engine
// -----------------------------------------------------------------------

export class PoliticalModelingEngine {
  /**
   * Run a full prediction from survey response data.
   *
   * @param responses - Array of survey responses with demographics and answers
   * @param candidateQuestionKey - The question key (or substring) that identifies
   *   the head-to-head or favorability question. The engine will look for answers
   *   matching candidate names.
   * @param candidateNames - The candidate names to track (e.g., ["Biden", "Trump"])
   */
  static predict(
    responses: SurveyResponseRow[],
    candidateQuestionKey: string,
    candidateNames: string[]
  ): PredictionResult {
    if (responses.length === 0) {
      return emptyResult(candidateNames);
    }

    // ---- 1. Extract candidate support from answers ----
    const allVoterResponses = responses.map((r) => {
      const choice = findCandidateChoice(r.answers, candidateQuestionKey, candidateNames);
      return {
        demographics: r.demographics,
        choice,
        isLikelyVoter: isLikelyVoter(r.demographics),
        turnoutRate: getTurnoutRate(r.demographics),
      };
    });

    const withChoice = allVoterResponses.filter((r) => r.choice !== null);
    const likelyVoters = withChoice.filter((r) => r.isLikelyVoter);

    // ---- 2. Raw support ----
    const rawCounts = countByCandidate(withChoice.map((r) => r.choice!), candidateNames);
    const lvCounts = countByCandidate(likelyVoters.map((r) => r.choice!), candidateNames);

    // ---- 3. Turnout-weighted support ----
    const turnoutWeighted: Record<string, number> = {};
    let totalWeight = 0;
    for (const r of withChoice) {
      if (r.choice) {
        turnoutWeighted[r.choice] = (turnoutWeighted[r.choice] || 0) + r.turnoutRate;
        totalWeight += r.turnoutRate;
      }
    }

    // ---- 4. Build candidate results ----
    const candidates: CandidateResult[] = candidateNames.map((name) => {
      const rawShare = withChoice.length > 0 ? (rawCounts[name] || 0) / withChoice.length : 0;
      const lvShare = likelyVoters.length > 0 ? (lvCounts[name] || 0) / likelyVoters.length : 0;
      const moe = marginOfError(lvShare, likelyVoters.length);
      const winProb = monteCarloWinProbability(lvShare, likelyVoters.length);

      return {
        name,
        rawSupport: Math.round(rawShare * 1000) / 10,
        likelyVoterSupport: Math.round(lvShare * 1000) / 10,
        winProbability: Math.round(winProb * 1000) / 10,
        marginOfError: Math.round(moe * 1000) / 10,
      };
    });

    // ---- 5. Segment breakdowns ----
    const segmentBreakdowns = buildSegmentBreakdowns(withChoice, candidateNames);

    // ---- 6. Key drivers ----
    const keyDrivers = identifyKeyDrivers(segmentBreakdowns, candidateNames);

    // ---- 7. Overall margin of error ----
    const overallMoE = Math.round(marginOfError(0.5, likelyVoters.length) * 1000) / 10;

    return {
      candidates,
      totalSampleSize: responses.length,
      likelyVoterSampleSize: likelyVoters.length,
      segmentBreakdowns,
      keyDrivers,
      overallMarginOfError: overallMoE,
      confidenceLevel: 95,
      methodology:
        `Based on ${responses.length} total responses (${likelyVoters.length} likely voters). ` +
        `Likely voter screen uses voting frequency. Margin of error ±${overallMoE}% at 95% confidence. ` +
        `Win probability estimated via ${(10000).toLocaleString()}-iteration Monte Carlo simulation.`,
    };
  }
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function findCandidateChoice(
  answers: Record<string, string | string[]>,
  questionKey: string,
  candidateNames: string[]
): string | null {
  const qKeyLower = questionKey.toLowerCase();

  for (const [key, value] of Object.entries(answers)) {
    if (!key.toLowerCase().includes(qKeyLower)) continue;

    const answerStr = Array.isArray(value) ? value.join(' ') : value;
    for (const candidate of candidateNames) {
      if (answerStr.toLowerCase().includes(candidate.toLowerCase())) {
        return candidate;
      }
    }
  }
  return null;
}

function countByCandidate(choices: string[], candidateNames: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of candidateNames) counts[name] = 0;
  for (const c of choices) {
    if (counts[c] !== undefined) counts[c]++;
  }
  return counts;
}

interface VoterEntry {
  demographics: Record<string, string>;
  choice: string | null;
  turnoutRate: number;
}

function buildSegmentBreakdowns(
  voters: VoterEntry[],
  candidateNames: string[]
): SegmentBreakdown[] {
  const segmentFields = [
    'party_affiliation',
    'age',
    'gender',
    'ethnicity',
    'education',
    'state',
    'voting_frequency',
    'ideology_spectrum',
  ];

  const breakdowns: SegmentBreakdown[] = [];

  for (const field of segmentFields) {
    const groups = new Map<string, VoterEntry[]>();

    for (const voter of voters) {
      const val = voter.demographics[field];
      if (!val) continue;
      if (!groups.has(val)) groups.set(val, []);
      groups.get(val)!.push(voter);
    }

    for (const [value, group] of groups) {
      if (group.length < 5) continue; // Skip tiny groups

      const support: Record<string, number> = {};
      const withChoice = group.filter((v) => v.choice !== null);

      for (const name of candidateNames) {
        const count = withChoice.filter((v) => v.choice === name).length;
        support[name] = withChoice.length > 0 ? Math.round((count / withChoice.length) * 1000) / 10 : 0;
      }

      const avgTurnout =
        group.reduce((sum, v) => sum + v.turnoutRate, 0) / group.length;

      breakdowns.push({
        segment: `${formatFieldName(field)}: ${value}`,
        sampleSize: group.length,
        candidateSupport: support,
        turnoutEstimate: Math.round(avgTurnout * 1000) / 10,
      });
    }
  }

  return breakdowns.sort((a, b) => b.sampleSize - a.sampleSize);
}

function identifyKeyDrivers(
  segments: SegmentBreakdown[],
  candidateNames: string[]
): KeyDriver[] {
  if (candidateNames.length < 2) return [];

  const drivers: KeyDriver[] = [];

  for (const seg of segments) {
    const [c1, c2] = candidateNames;
    const s1 = seg.candidateSupport[c1] || 0;
    const s2 = seg.candidateSupport[c2] || 0;
    const gap = Math.abs(s1 - s2);
    const leader = s1 > s2 ? c1 : c2;

    if (gap >= 30 && seg.sampleSize >= 10) {
      drivers.push({
        segment: seg.segment,
        impact: 'high',
        description: `${leader} leads by ${gap.toFixed(1)}pp among ${seg.segment} (n=${seg.sampleSize})`,
      });
    } else if (gap >= 15 && seg.sampleSize >= 10) {
      drivers.push({
        segment: seg.segment,
        impact: 'medium',
        description: `${leader} leads by ${gap.toFixed(1)}pp among ${seg.segment} (n=${seg.sampleSize})`,
      });
    } else if (gap < 5 && seg.sampleSize >= 15) {
      drivers.push({
        segment: seg.segment,
        impact: 'low',
        description: `Toss-up among ${seg.segment} — only ${gap.toFixed(1)}pp gap (n=${seg.sampleSize})`,
      });
    }
  }

  return drivers
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.impact] - order[b.impact];
    })
    .slice(0, 15);
}

function formatFieldName(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function emptyResult(candidateNames: string[]): PredictionResult {
  return {
    candidates: candidateNames.map((name) => ({
      name,
      rawSupport: 0,
      likelyVoterSupport: 0,
      winProbability: 0,
      marginOfError: 0,
    })),
    totalSampleSize: 0,
    likelyVoterSampleSize: 0,
    segmentBreakdowns: [],
    keyDrivers: [],
    overallMarginOfError: 0,
    confidenceLevel: 95,
    methodology: 'Insufficient data for prediction.',
  };
}
