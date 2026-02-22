/**
 * Lightweight quality harness for chat behavior.
 * Usage: npx tsx scripts/evaluate-chat-quality.ts
 */

import {
  computeContinuityScore,
  computeFreshnessScore,
  computeRepetitionScore,
} from '../src/app/utils/evaluations/chat-evals';

function printResult(name: string, value: number) {
  const pct = Math.round(value * 100);
  console.log(`${name}: ${pct}% (${value.toFixed(4)})`);
}

function run() {
  const recentMessages = [
    { role: 'user' as const, content: 'what happened in my district this week?' },
    { role: 'agent' as const, content: 'The primary results settled and turnout shifted in late-reporting precincts.' },
    { role: 'user' as const, content: 'what should we do tomorrow?' },
    { role: 'agent' as const, content: 'Focus on rapid-response messaging and earned media in key precinct clusters.' },
  ];

  const repetition = computeRepetitionScore(
    'what should we do tomorrow about this?',
    recentMessages
  );
  const continuity = computeContinuityScore(
    'what should we do tomorrow about this?',
    recentMessages
  );
  const freshness = computeFreshnessScore([
    { publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
    { publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
    { publishedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString() },
  ]);

  console.log('Chat Quality Evaluation');
  console.log('=======================');
  printResult('Repetition score (lower is better)', repetition);
  printResult('Continuity score (higher is better)', continuity);
  printResult('Freshness score (higher is better)', freshness);

  const warnings: string[] = [];
  if (repetition > 0.85) warnings.push('High repetition risk detected.');
  if (continuity < 0.35) warnings.push('Weak follow-up continuity detected.');
  if (freshness < 0.25) warnings.push('News freshness risk detected.');

  if (warnings.length) {
    console.log('\nWarnings');
    console.log('--------');
    warnings.forEach((w) => console.log(`- ${w}`));
  } else {
    console.log('\nAll checks within baseline thresholds.');
  }
}

run();
