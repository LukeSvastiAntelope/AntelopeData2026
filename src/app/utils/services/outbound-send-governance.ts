/**
 * MT3 — Governed send for tailored outbound drafts.
 *
 * Microtargeting supplies *what to say*. Who/when comes from the propensity
 * engagement loop (quarantined) — never blast the raw segment membership.
 * Public SMS/email goes through executeTool → Auto-Post staged cards;
 * auto-execute only when the user explicitly opts in (fullAutoSend) under
 * loop_config auto_within_limits. Letter / ad copy stage as review-only cards.
 */

import { openSql } from '@/app/utils/database/db';
import { ConsultantRepo } from '@/app/utils/database/consultant-repo';
import { LoopConfigRepo } from '@/app/utils/database/loop-config-repo';
import { PropensityRepo } from '@/app/utils/database/propensity-repo';
import { executeTool, executeApprovedTool } from '@/app/utils/services/tools/executor';
import { stripRawPriorFromPayload } from '@/app/utils/propensity/quarantine';
import {
  type OutboundDraft,
  type OutboundFormat,
  type SegmentTailoringContext,
} from '@/app/utils/services/outbound-draft-service';
import { resolveVoterSegment } from '@/app/utils/services/voter-segments';
import type { RowDataPacket } from 'mysql2';

export type SendableOutboundFormat = 'sms' | 'email';

export type OutboundRecipientBundle = {
  /** Contact channels for send_* tools — from propensity ∩ segment ∩ contactable */
  emails: string[];
  phones: string[];
  personIds: number[];
  /** How recipients were chosen (never "entire segment blast") */
  source: 'propensity_intersect_segment' | 'override' | 'empty';
  note: string;
};

export type StageOutboundResult = {
  format: OutboundFormat;
  toolName: string;
  stagedActionId: number;
  status: 'pending_approval' | 'executed' | 'review_only';
  heldAtGate: boolean;
  fullAutoApplied: boolean;
  autonomy: string;
  recipients: OutboundRecipientBundle;
  summary: string;
  thinSegment: boolean;
  smallSampleDisclaimerApplied: boolean;
};

function parseEmailSubjectBody(raw: string): { subject: string; html: string } {
  const lines = raw.split(/\r?\n/);
  let subject = 'Campaign update';
  let start = 0;
  if (/^subject:\s*/i.test(lines[0] || '')) {
    subject = lines[0].replace(/^subject:\s*/i, '').trim() || subject;
    start = 1;
    if (lines[1]?.trim() === '') start = 2;
  }
  const text = lines.slice(start).join('\n').trim();
  const html = text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
  return { subject, html: html || `<p>${text}</p>` };
}

/**
 * Who to contact: propensity who-next ∩ live segment membership, with email/phone.
 * Never returns the full segment as a blast list on its own.
 */
export async function resolveGovernedRecipients(params: {
  organizationId: number;
  segmentId?: string | null;
  segmentPersonIds?: number[];
  limit?: number;
  /** Smoke / tests: inject contacts without propensity rows */
  override?: { emails?: string[]; phones?: string[]; personIds?: number[] };
}): Promise<OutboundRecipientBundle> {
  if (params.override) {
    return {
      emails: (params.override.emails || []).map((e) => e.trim()).filter(Boolean),
      phones: (params.override.phones || []).map((p) => p.trim()).filter(Boolean),
      personIds: params.override.personIds || [],
      source: 'override',
      note: 'Recipient override (smoke/test) — production path uses propensity ∩ segment.',
    };
  }

  let segmentIds = new Set(params.segmentPersonIds || []);
  if (params.segmentId && segmentIds.size === 0) {
    const resolved = await resolveVoterSegment({
      organizationId: params.organizationId,
      segmentId: params.segmentId,
      limit: 500,
    });
    segmentIds = new Set(resolved.people.map((p) => p.personId));
  }

  const whoNext = await PropensityRepo.whoToWorkNext(params.organizationId, {
    excludeSuppressed: true,
    limit: params.limit ?? 50,
  });

  // Prefer intersection; if propensity empty, still do not fall back to segment blast.
  const intersected = whoNext.filter((r) => segmentIds.has(r.person_record_id));
  const chosenIds = (
    intersected.length
      ? intersected
      : // Message applies to segment; who-when still from propensity ranking when no overlap yet
        whoNext.filter((r) => segmentIds.size === 0 || segmentIds.has(r.person_record_id))
  )
    .map((r) => r.person_record_id)
    .slice(0, params.limit ?? 25);

  if (!chosenIds.length) {
    return {
      emails: [],
      phones: [],
      personIds: [],
      source: 'empty',
      note:
        'No propensity who-next recipients intersect this segment yet. Message is staged; who/when remains with the engagement loop — not a segment blast.',
    };
  }

  const db = await openSql();
  const ph = chosenIds.map(() => '?').join(',');
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, email, phone FROM person_records
     WHERE organization_id = ? AND id IN (${ph})`,
    [params.organizationId, ...chosenIds]
  );

  const emails: string[] = [];
  const phones: string[] = [];
  for (const r of rows) {
    if (r.email) emails.push(String(r.email).trim());
    if (r.phone) phones.push(String(r.phone).trim());
  }

  return stripRawPriorFromPayload({
    emails: [...new Set(emails.filter(Boolean))],
    phones: [...new Set(phones.filter(Boolean))],
    personIds: chosenIds,
    source: 'propensity_intersect_segment' as const,
    note: `Recipients from propensity who-next ∩ segment (${chosenIds.length} people). Microtargeting supplied the message only.`,
  });
}

function buildSendToolInput(
  format: SendableOutboundFormat,
  draft: OutboundDraft,
  recipients: OutboundRecipientBundle,
  segmentName: string
): { toolName: 'send_sms' | 'send_email'; input: Record<string, unknown> } | null {
  if (format === 'sms') {
    if (!recipients.phones.length) return null;
    return {
      toolName: 'send_sms',
      input: {
        to: recipients.phones,
        body: draft.body.slice(0, 1600),
      },
    };
  }
  if (!recipients.emails.length) return null;
  const { subject, html } = parseEmailSubjectBody(draft.body);
  return {
    toolName: 'send_email',
    input: {
      emails: recipients.emails,
      subject,
      html,
      campaignTitle: `${draft.title || segmentName}`.slice(0, 120),
    },
  };
}

/**
 * Stage a tailored draft at the same human gate as every other public send.
 */
export async function stageOutboundDraftSend(params: {
  userId: number;
  organizationId: number;
  draft: OutboundDraft;
  context: SegmentTailoringContext;
  segmentId?: string | null;
  /** Explicit opt-in to run executeApprovedTool after staging (never silent). */
  fullAutoSend?: boolean;
  /** Do not call executeApprovedTool even if fullAutoSend. */
  dryRun?: boolean;
  recipientOverride?: {
    emails?: string[];
    phones?: string[];
    personIds?: number[];
  };
  recipientLimit?: number;
}): Promise<StageOutboundResult> {
  const recipients = await resolveGovernedRecipients({
    organizationId: params.organizationId,
    segmentId: params.segmentId || params.context.segmentId,
    limit: params.recipientLimit,
    override: params.recipientOverride,
  });

  const loopConfig = await LoopConfigRepo.getOrCreate({
    userId: params.userId,
    organizationId: params.organizationId,
  });
  const autonomy = loopConfig.autonomy;
  const allowFullAuto =
    Boolean(params.fullAutoSend) &&
    autonomy === 'auto_within_limits' &&
    !params.dryRun;

  const conversation = await ConsultantRepo.getOrCreateConversation({
    userId: params.userId,
    organizationId: params.organizationId,
  });

  const format = params.draft.format;
  const thin = params.context.thinSegment;
  const disclaimerApplied = Boolean(params.draft.smallSampleDisclaimerApplied);

  // Letter / ad copy — review-only Auto-Post style cards (not executable send tools)
  if (format === 'letter' || format === 'ad_copy') {
    const summary = [
      `### ${format === 'letter' ? 'Letter' : 'Ad copy'} draft — review before distribution`,
      `- Segment: **${params.context.segmentName}** (n=${params.context.voterCount})`,
      thin ? '- _Thin segment — coarse copy + small-sample disclaimer included._' : null,
      recipients.note,
      '',
      params.draft.body.slice(0, 800) + (params.draft.body.length > 800 ? '…' : ''),
      '',
      '_Review only — printing/ad placement is not auto-executed. Approve marks reviewed._',
    ]
      .filter(Boolean)
      .join('\n');

    const staged = await ConsultantRepo.createStagedAction({
      conversationId: conversation.id,
      toolName: 'outbound_review',
      summary,
      payload: {
        kind: 'outbound_review',
        reviewOnly: true,
        tool: 'outbound_review',
        format,
        segmentId: params.context.segmentId,
        segmentName: params.context.segmentName,
        thinSegment: thin,
        smallSampleDisclaimerApplied: disclaimerApplied,
        draft: params.draft,
        recipients,
        description: 'Tailored outbound review card (letter/ad)',
      },
    });

    await appendStagedNotice({
      conversationId: conversation.id,
      userId: params.userId,
      messages: conversation.messages,
      content: [
        '### Outbound draft ready — review before it goes out',
        summary,
        '',
        '_Same gate language as Auto-Post. Nothing distributes until you Approve._',
      ].join('\n'),
      toolName: 'outbound_review',
      stagedActionId: staged.id,
    });

    return {
      format,
      toolName: 'outbound_review',
      stagedActionId: staged.id,
      status: 'review_only',
      heldAtGate: true,
      fullAutoApplied: false,
      autonomy,
      recipients,
      summary,
      thinSegment: thin,
      smallSampleDisclaimerApplied: disclaimerApplied,
    };
  }

  if (format !== 'sms' && format !== 'email') {
    throw new Error(`Unsupported outbound format for send gate: ${format}`);
  }

  const built = buildSendToolInput(format, params.draft, recipients, params.context.segmentName);

  // Still stage a review card when contacts aren't ready — never invent a blast list
  if (!built) {
    const summary = [
      `### ${format.toUpperCase()} draft — held (no contactable propensity recipients)`,
      `- Segment: **${params.context.segmentName}** (n=${params.context.voterCount})`,
      thin ? '- _Thin segment disclaimer baked into body._' : null,
      recipients.note,
      '',
      params.draft.body.slice(0, 600),
      '',
      '_Staged for review. Who/when stays with propensity — not a one-shot segment send._',
    ]
      .filter(Boolean)
      .join('\n');

    const staged = await ConsultantRepo.createStagedAction({
      conversationId: conversation.id,
      toolName: 'outbound_review',
      summary,
      payload: {
        kind: 'outbound_review',
        reviewOnly: true,
        tool: 'outbound_review',
        format,
        intendedTool: format === 'sms' ? 'send_sms' : 'send_email',
        segmentId: params.context.segmentId,
        thinSegment: thin,
        smallSampleDisclaimerApplied: disclaimerApplied,
        draft: params.draft,
        recipients,
      },
    });

    await appendStagedNotice({
      conversationId: conversation.id,
      userId: params.userId,
      messages: conversation.messages,
      content: summary,
      toolName: 'outbound_review',
      stagedActionId: staged.id,
    });

    return {
      format,
      toolName: 'outbound_review',
      stagedActionId: staged.id,
      status: 'review_only',
      heldAtGate: true,
      fullAutoApplied: false,
      autonomy,
      recipients,
      summary,
      thinSegment: thin,
      smallSampleDisclaimerApplied: disclaimerApplied,
    };
  }

  // Same path as video/stage-post and consultant: executeTool → pending_approval → card
  const toolResult = await executeTool(
    { name: built.toolName, input: built.input },
    { userId: params.userId, organizationId: params.organizationId }
  );

  if (!(toolResult.ok && toolResult.status === 'pending_approval' && toolResult.staged)) {
    throw new Error(
      `Expected pending_approval from ${built.toolName}, got ${toolResult.status}`
    );
  }

  const summary = [
    toolResult.summary,
    '',
    `- Segment message: **${params.context.segmentName}** (n=${params.context.voterCount})`,
    thin ? '- Thin-segment coarse copy + small-sample disclaimer included.' : null,
    `- ${recipients.note}`,
    `- Recipients queued: ${
      format === 'sms' ? recipients.phones.length : recipients.emails.length
    }`,
    '',
    '_Nothing sends until Approve — same Auto-Post gate as every other public send._',
  ]
    .filter(Boolean)
    .join('\n');

  const staged = await ConsultantRepo.createStagedAction({
    conversationId: conversation.id,
    toolName: toolResult.tool,
    summary,
    payload: {
      kind: 'outbound_send',
      tool: toolResult.tool,
      input: toolResult.staged.input,
      description: toolResult.staged.description,
      format,
      segmentId: params.context.segmentId,
      segmentName: params.context.segmentName,
      thinSegment: thin,
      smallSampleDisclaimerApplied: disclaimerApplied,
      draft: params.draft,
      recipients,
      autonomy,
    },
  });

  const refreshed = await ConsultantRepo.getConversationById(
    conversation.id,
    params.userId
  );

  await appendStagedNotice({
    conversationId: conversation.id,
    userId: params.userId,
    messages: refreshed?.messages || conversation.messages,
    content: [
      '### Tailored outbound — review before it goes out',
      summary,
    ].join('\n'),
    toolName: toolResult.tool,
    stagedActionId: staged.id,
  });

  // Autonomy dial: hold unless fullAutoSend opted in under auto_within_limits
  if (!allowFullAuto) {
    return {
      format,
      toolName: toolResult.tool,
      stagedActionId: staged.id,
      status: 'pending_approval',
      heldAtGate: true,
      fullAutoApplied: false,
      autonomy,
      recipients,
      summary,
      thinSegment: thin,
      smallSampleDisclaimerApplied: disclaimerApplied,
    };
  }

  // Explicit full-auto opt-in under auto_within_limits
  const execution = await executeApprovedTool(
    { name: built.toolName, input: built.input },
    { userId: params.userId, organizationId: params.organizationId }
  );
  const ok = Boolean(execution.ok && execution.status === 'executed');
  await ConsultantRepo.updateStagedAction(staged.id, {
    status: ok ? 'executed' : 'approved',
    resultSummary: execution.summary,
    resultData: execution.ok && 'data' in execution ? execution.data || null : null,
  });

  return {
    format,
    toolName: toolResult.tool,
    stagedActionId: staged.id,
    status: ok ? 'executed' : 'pending_approval',
    heldAtGate: !ok,
    fullAutoApplied: true,
    autonomy,
    recipients,
    summary: execution.summary,
    thinSegment: thin,
    smallSampleDisclaimerApplied: disclaimerApplied,
  };
}

async function appendStagedNotice(params: {
  conversationId: number;
  userId: number;
  messages: Awaited<
    ReturnType<typeof ConsultantRepo.getOrCreateConversation>
  >['messages'];
  content: string;
  toolName: string;
  stagedActionId: number;
}) {
  await ConsultantRepo.saveMessages(params.conversationId, params.userId, [
    ...params.messages,
    {
      role: 'assistant',
      content: params.content,
      meta: {
        kind: 'staged_notice' as const,
        toolName: params.toolName,
        risk: 'approval' as const,
        stagedActionId: params.stagedActionId,
      },
      createdAt: new Date().toISOString(),
    },
  ]);
}
