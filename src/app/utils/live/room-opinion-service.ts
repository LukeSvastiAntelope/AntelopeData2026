/**
 * Live L5 — Pol.is-style opinion clustering + room summary.
 *
 * Clustering & shares are computed in code. The model only names clusters and
 * writes a one-line characterization from provided receipts — it cannot assert
 * a theme without source response event ids. Significance floors come from
 * postable-insight-service.
 */

import { createHash } from 'crypto';
import { createCompletion } from '@/app/utils/services/ai-service';
import {
  POSTABLE_INSIGHT_THRESHOLDS,
  isBelowTotalResponseFloor,
} from '@/app/utils/services/postable-insight-service';
import { LiveRepo, type LiveQuestion, type LiveSession } from '@/app/utils/database/live-repo';
import {
  questionAllowsAttribution,
  LIVE_SMALL_N_DISCLAIMER,
} from '@/app/utils/live/audience-intelligence';

export type OpinionReceipt = {
  eventId: number;
  participantId: number | null;
  text: string;
  /** Only when the question allows attribution and participant is identified */
  displayName: string | null;
};

export type OpinionGroup = {
  id: string;
  name: string;
  characterization: string;
  share: number;
  count: number;
  /** Source response event ids — required receipts for every theme */
  receiptEventIds: number[];
  receipts: OpinionReceipt[];
};

export type RoomOpinionRead = {
  sessionId: number;
  organizationId: number;
  questionId: number | null;
  questionPrompt: string | null;
  asOf: string;
  totalResponses: number;
  groupCount: number;
  thresholds: {
    minTotalResponses: number;
    minCellSize: number;
  };
  insufficientData: boolean;
  insufficientDataMessage: string | null;
  smallSampleDisclaimer: string | null;
  method: 'lexical' | 'poll_options' | 'empty';
  groups: OpinionGroup[];
  roomSummary: string;
  /** Trace: every group name maps to receipt ids */
  traceable: true;
};

type TextUnit = {
  eventId: number;
  participantId: number | null;
  text: string;
  displayName: string | null;
  tokens: string[];
};

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'is', 'are', 'was', 'were', 'be', 'been', 'that', 'this', 'it', 'with', 'as',
  'we', 'you', 'they', 'i', 'me', 'my', 'our', 'their', 'not', 'no', 'yes',
  'just', 'from', 'by', 'about', 'into', 'than', 'then', 'so', 'if', 'do',
  'does', 'did', 'have', 'has', 'had', 'will', 'would', 'can', 'could',
]);

function tokenize(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Greedy agglomerative clustering into k groups (2–4). */
function clusterLexical(units: TextUnit[], k: number): TextUnit[][] {
  if (units.length === 0) return [];
  if (units.length <= k) return units.map((u) => [u]);

  // Seed: farthest-first
  const seeds: number[] = [0];
  while (seeds.length < k) {
    let bestI = -1;
    let bestD = -1;
    for (let i = 0; i < units.length; i++) {
      if (seeds.includes(i)) continue;
      const minSim = Math.min(
        ...seeds.map((s) => jaccard(units[i]!.tokens, units[s]!.tokens))
      );
      const dist = 1 - minSim;
      if (dist > bestD) {
        bestD = dist;
        bestI = i;
      }
    }
    if (bestI < 0) break;
    seeds.push(bestI);
  }

  const groups: TextUnit[][] = seeds.map((s) => [units[s]!]);
  const seeded = new Set(seeds);
  for (let i = 0; i < units.length; i++) {
    if (seeded.has(i)) continue;
    let bestG = 0;
    let bestSim = -1;
    for (let g = 0; g < groups.length; g++) {
      const centroidTokens = groups[g]!.flatMap((u) => u.tokens);
      const sim = jaccard(units[i]!.tokens, centroidTokens);
      if (sim > bestSim) {
        bestSim = sim;
        bestG = g;
      }
    }
    groups[bestG]!.push(units[i]!);
  }
  return groups.filter((g) => g.length > 0);
}

function topTerms(units: TextUnit[], n = 4): string[] {
  const counts = new Map<string, number>();
  for (const u of units) {
    for (const t of new Set(u.tokens)) {
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([t]) => t);
}

function heuristicName(units: TextUnit[], index: number): {
  name: string;
  characterization: string;
} {
  const terms = topTerms(units, 3);
  if (terms.length === 0) {
    return {
      name: `Group ${index + 1}`,
      characterization: `${units.length} responses with mixed wording.`,
    };
  }
  const name = terms
    .slice(0, 2)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(' · ');
  return {
    name,
    characterization: `Emphasizes ${terms.join(', ')} (${units.length} voices).`,
  };
}

async function nameClustersWithModel(
  clusters: TextUnit[][],
  total: number,
  questionPrompt: string | null
): Promise<Array<{ name: string; characterization: string }> | null> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    return null;
  }
  const payload = clusters.map((units, i) => ({
    clusterIndex: i,
    count: units.length,
    share: total ? Math.round((units.length / total) * 100) : 0,
    receiptEventIds: units.map((u) => u.eventId),
    sampleTexts: units.slice(0, 8).map((u) => u.text.slice(0, 180)),
  }));

  const prompt = `You name opinion clusters for a live room (Pol.is-style).
Rules:
- You MAY ONLY describe clusters using the sampleTexts and receiptEventIds provided.
- Do NOT invent themes, quotes, or groups that lack receipts.
- Return JSON only: { "groups": [ { "clusterIndex": 0, "name": "3-5 word name", "characterization": "one sentence" } ], "roomSummary": "2 sentences max about the room" }
- Names should be neutral and specific. No political scoring of individuals.

Question (optional context): ${questionPrompt || '(mixed open responses)'}
Clusters:
${JSON.stringify(payload, null, 2)}`;

  try {
    const model = process.env.ANTHROPIC_API_KEY
      ? 'claude-sonnet-4-6'
      : 'gpt-4o-mini';
    const res = await createCompletion({
      model,
      temperature: 0.2,
      maxTokens: 800,
      messages: [
        {
          role: 'system',
          content:
            'You are a careful analyst. Every claim must map to provided receiptEventIds. Reply with JSON only.',
        },
        { role: 'user', content: prompt },
      ],
    });
    const raw = res.content.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      groups?: Array<{
        clusterIndex: number;
        name: string;
        characterization: string;
      }>;
      roomSummary?: string;
    };
    if (!Array.isArray(parsed.groups)) return null;
    return clusters.map((_, i) => {
      const g = parsed.groups!.find((x) => x.clusterIndex === i);
      if (g?.name) {
        return {
          name: String(g.name).slice(0, 80),
          characterization: String(g.characterization || '').slice(0, 240),
        };
      }
      return heuristicName(clusters[i]!, i);
    });
  } catch (err) {
    console.warn('[room-opinion] LLM naming failed, using heuristics', err);
    return null;
  }
}

async function collectOpenUnits(params: {
  session: LiveSession;
  organizationId: number;
  questionId?: number | null;
}): Promise<{
  units: TextUnit[];
  question: LiveQuestion | null;
  method: 'lexical' | 'poll_options' | 'empty';
}> {
  const questions = await LiveRepo.listQuestions(params.session.id);
  const targetQs = params.questionId
    ? questions.filter((q) => q.id === params.questionId)
    : questions.filter((q) =>
        q.kind === 'open' || q.kind === 'wordcloud' || q.kind === 'qa'
      );

  // Prefer open text; if a single poll with agree/disagree options, treat as option clusters
  if (params.questionId) {
    const q = questions.find((x) => x.id === params.questionId) || null;
    if (q && q.kind === 'poll') {
      const events = await LiveRepo.listEvents(
        params.session.id,
        params.organizationId,
        { limit: 2000 }
      );
      const participants = await LiveRepo.listParticipants(
        params.session.id,
        params.organizationId
      );
      const pById = new Map(participants.map((p) => [p.id, p]));
      const attributed = questionAllowsAttribution(params.session, q);
      const latest = new Map<number, { eventId: number; value: string }>();
      for (const e of events) {
        if (
          e.questionId === q.id &&
          e.participantId != null &&
          e.type.startsWith('response.')
        ) {
          latest.set(e.participantId, {
            eventId: e.id,
            value: String((e.payload as any)?.value ?? ''),
          });
        }
      }
      const units: TextUnit[] = [];
      for (const [pid, ans] of latest) {
        const p = pById.get(pid);
        units.push({
          eventId: ans.eventId,
          participantId: pid,
          text: ans.value,
          displayName:
            attributed && p && !p.isAnonymous ? p.displayName : null,
          tokens: tokenize(ans.value),
        });
      }
      return { units, question: q, method: units.length ? 'poll_options' : 'empty' };
    }
  }

  const events = await LiveRepo.listEvents(
    params.session.id,
    params.organizationId,
    { limit: 2000 }
  );
  const participants = await LiveRepo.listParticipants(
    params.session.id,
    params.organizationId
  );
  const pById = new Map(participants.map((p) => [p.id, p]));
  const qById = new Map(targetQs.map((q) => [q.id, q]));

  const units: TextUnit[] = [];
  const seenText = new Set<string>();

  for (const e of events) {
    const q = e.questionId != null ? qById.get(e.questionId) : null;
    let text: string | null = null;
    if (e.type === 'qa.asked') {
      text = String((e.payload as any)?.text || '').trim();
    } else if (
      q &&
      (q.kind === 'open' || q.kind === 'wordcloud') &&
      e.type.startsWith('response.')
    ) {
      text = String((e.payload as any)?.value || '').trim();
    }
    if (!text || text.length < 2) continue;
    const key = `${e.participantId || 0}:${text.toLowerCase()}`;
    if (seenText.has(key)) continue;
    seenText.add(key);
    const p = e.participantId != null ? pById.get(e.participantId) : null;
    const attributed = q
      ? questionAllowsAttribution(params.session, q)
      : false;
    units.push({
      eventId: e.id,
      participantId: e.participantId,
      text,
      displayName:
        attributed && p && !p.isAnonymous ? p.displayName : null,
      tokens: tokenize(text),
    });
  }

  const question =
    params.questionId != null
      ? questions.find((q) => q.id === params.questionId) || null
      : targetQs[0] || null;

  return {
    units,
    question,
    method: units.length ? 'lexical' : 'empty',
  };
}

function buildRoomSummaryHeuristic(groups: OpinionGroup[]): string {
  if (!groups.length) {
    return 'Not enough open responses yet to form opinion groups.';
  }
  const top = [...groups].sort((a, b) => b.count - a.count)[0]!;
  const parts = groups
    .slice(0, 3)
    .map((g) => `${g.name} (${Math.round(g.share * 100)}%)`);
  return `The room splits into ${groups.length} opinion groups — leading: ${top.name}. Shares: ${parts.join('; ')}.`;
}

/**
 * Compute opinion groups for a live session. Always returns receipt-linked groups.
 */
export async function computeRoomOpinionRead(params: {
  sessionId: number;
  organizationId: number;
  questionId?: number | null;
  /** Persist as session_event room.opinion_read */
  persist?: boolean;
}): Promise<RoomOpinionRead> {
  const session = await LiveRepo.getSessionById(
    params.sessionId,
    params.organizationId
  );
  if (!session) throw new Error('Session not found');

  const { units, question, method } = await collectOpenUnits({
    session,
    organizationId: params.organizationId,
    questionId: params.questionId,
  });

  const totalResponses = units.length;
  const thresholds = {
    minTotalResponses: POSTABLE_INSIGHT_THRESHOLDS.minTotalResponses,
    minCellSize: POSTABLE_INSIGHT_THRESHOLDS.minCellSize,
  };
  const insufficientData = isBelowTotalResponseFloor(
    totalResponses,
    POSTABLE_INSIGHT_THRESHOLDS
  );

  if (totalResponses === 0) {
    const empty: RoomOpinionRead = {
      sessionId: session.id,
      organizationId: params.organizationId,
      questionId: question?.id ?? params.questionId ?? null,
      questionPrompt: question?.prompt ?? null,
      asOf: new Date().toISOString(),
      totalResponses: 0,
      groupCount: 0,
      thresholds,
      insufficientData: true,
      insufficientDataMessage:
        'No open responses yet — ask an open / wordcloud / Q&A prompt.',
      smallSampleDisclaimer: LIVE_SMALL_N_DISCLAIMER,
      method: 'empty',
      groups: [],
      roomSummary: 'Waiting for open responses to cluster.',
      traceable: true,
    };
    if (params.persist) {
      await LiveRepo.appendEvent({
        sessionId: session.id,
        organizationId: params.organizationId,
        type: 'room.opinion_read',
        payload: empty,
      });
    }
    return empty;
  }

  // Poll options → one group per distinct answer (natural clusters)
  let rawClusters: TextUnit[][];
  if (method === 'poll_options') {
    const byVal = new Map<string, TextUnit[]>();
    for (const u of units) {
      const list = byVal.get(u.text) || [];
      list.push(u);
      byVal.set(u.text, list);
    }
    rawClusters = Array.from(byVal.values())
      .sort((a, b) => b.length - a.length)
      .slice(0, 4);
  } else {
    const k = Math.min(4, Math.max(2, Math.round(Math.sqrt(totalResponses / 2))));
    rawClusters = clusterLexical(units, Math.min(k, totalResponses));
    // Merge tiny clusters into largest if we ended with >4 somehow
    rawClusters = rawClusters.sort((a, b) => b.length - a.length).slice(0, 4);
  }

  const named =
    (await nameClustersWithModel(
      rawClusters,
      totalResponses,
      question?.prompt ?? null
    )) || rawClusters.map((c, i) => heuristicName(c, i));

  const groups: OpinionGroup[] = rawClusters.map((cluster, i) => {
    const count = cluster.length;
    const share = totalResponses ? count / totalResponses : 0;
    const receipts: OpinionReceipt[] = cluster.map((u) => ({
      eventId: u.eventId,
      participantId: u.participantId,
      text: u.text,
      displayName: u.displayName,
    }));
    const id = createHash('sha1')
      .update(`${session.id}:${i}:${receipts.map((r) => r.eventId).join(',')}`)
      .digest('hex')
      .slice(0, 10);
    const label = named[i] || heuristicName(cluster, i);
    // Guard: refuse empty receipt lists
    if (!receipts.length) {
      throw new Error('Invariant: opinion group without receipts');
    }
    return {
      id,
      name: label.name,
      characterization: label.characterization,
      share,
      count,
      receiptEventIds: receipts.map((r) => r.eventId),
      receipts,
    };
  });

  // Drop groups below 1 response (shouldn't happen)
  const filtered = groups.filter((g) => g.count > 0 && g.receiptEventIds.length > 0);
  const anyThin = filtered.some((g) => g.count < thresholds.minCellSize);

  const read: RoomOpinionRead = {
    sessionId: session.id,
    organizationId: params.organizationId,
    questionId: question?.id ?? params.questionId ?? null,
    questionPrompt: question?.prompt ?? null,
    asOf: new Date().toISOString(),
    totalResponses,
    groupCount: filtered.length,
    thresholds,
    insufficientData,
    insufficientDataMessage: insufficientData
      ? `Total open responses (${totalResponses}) are below the publish floor of ${thresholds.minTotalResponses}. Clusters are directional only.`
      : null,
    smallSampleDisclaimer:
      insufficientData || anyThin ? LIVE_SMALL_N_DISCLAIMER : null,
    method,
    groups: filtered,
    roomSummary: buildRoomSummaryHeuristic(filtered),
    traceable: true,
  };

  // Prefer model room summary if available via a light second parse — already
  // baked into naming call when present; heuristic is fine as default.

  if (params.persist !== false) {
    await LiveRepo.appendEvent({
      sessionId: session.id,
      organizationId: params.organizationId,
      questionId: read.questionId,
      type: 'room.opinion_read',
      payload: {
        ...read,
        // Keep payload lean for event log — trim receipt text in stored copy
        groups: read.groups.map((g) => ({
          ...g,
          receipts: g.receipts.map((r) => ({
            eventId: r.eventId,
            participantId: r.participantId,
            text: r.text.slice(0, 280),
            displayName: r.displayName,
          })),
        })),
      },
    });
  }

  return read;
}

/** Latest persisted room.opinion_read for screen / host. */
export async function latestRoomOpinionRead(
  sessionId: number,
  organizationId: number
): Promise<RoomOpinionRead | null> {
  const events = await LiveRepo.listEvents(sessionId, organizationId, {
    type: 'room.opinion_read',
    limit: 500,
  });
  if (!events.length) return null;
  const last = events[events.length - 1]!;
  const payload = last.payload as RoomOpinionRead;
  if (!payload || !Array.isArray(payload.groups)) return null;
  // Enforce traceability invariant on read
  for (const g of payload.groups) {
    if (!g.receiptEventIds?.length) {
      console.warn('[room-opinion] dropping group without receipts', g.id);
    }
  }
  return {
    ...payload,
    groups: payload.groups.filter((g) => g.receiptEventIds?.length > 0),
    traceable: true,
  };
}
