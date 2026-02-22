type SimpleMessage = { role: 'user' | 'agent'; content: string };
type NewsItem = { publishedAt?: string | null };

function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function computeRepetitionScore(question: string, recentMessages: SimpleMessage[]): number {
  const recentAssistant = recentMessages
    .filter((m) => m.role === 'agent' && m.content?.trim())
    .slice(-3);
  if (!recentAssistant.length) return 0;
  const maxSimilarity = Math.max(
    ...recentAssistant.map((m) => jaccardSimilarity(question, m.content))
  );
  return Number(Math.max(0, Math.min(1, maxSimilarity)).toFixed(4));
}

export function computeContinuityScore(question: string, recentMessages: SimpleMessage[]): number {
  const recentUser = recentMessages
    .filter((m) => m.role === 'user' && m.content?.trim())
    .slice(-3);
  if (!recentUser.length) return 0;
  const avgSimilarity =
    recentUser.reduce((sum, m) => sum + jaccardSimilarity(question, m.content), 0) / recentUser.length;
  return Number(Math.max(0, Math.min(1, avgSimilarity)).toFixed(4));
}

export function computeFreshnessScore(items: NewsItem[]): number {
  if (!items.length) return 0;
  const now = Date.now();
  const scored = items.map((item) => {
    const ts = item.publishedAt ? new Date(item.publishedAt).getTime() : now - 30 * 24 * 60 * 60 * 1000;
    const ageDays = Math.max(0, (now - ts) / (24 * 60 * 60 * 1000));
    return Math.exp(-ageDays / 4);
  });
  const avg = scored.reduce((a, b) => a + b, 0) / scored.length;
  return Number(Math.max(0, Math.min(1, avg)).toFixed(4));
}
