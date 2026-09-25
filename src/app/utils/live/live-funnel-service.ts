/**
 * Live L6 — post-event funnel: leads → opt-in rails, gated follow-up, report.
 * Tenant-scoped + suppression-aware. Nothing auto-sends to the room.
 */

import { openSql } from '@/app/utils/database/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { LiveRepo, type LiveSession } from '@/app/utils/database/live-repo';
import { isOrgContactSuppressed } from '@/app/utils/services/site-form-capture';
import { listAudienceParticipants } from '@/app/utils/live/audience-intelligence';
import { latestRoomOpinionRead } from '@/app/utils/live/room-opinion-service';
import { ReportStorageService } from '@/app/utils/services/report-storage-service';
import {
  stageOutboundDraftSend,
  type StageOutboundResult,
} from '@/app/utils/services/outbound-send-governance';
import type {
  OutboundDraft,
  SegmentTailoringContext,
} from '@/app/utils/services/outbound-draft-service';
import { SMALL_SAMPLE_DISCLAIMER } from '@/app/utils/services/autotrigger-outputs';

export type LiveLead = {
  participantId: number;
  personRecordId: number | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  role: string | null;
  company: string | null;
  headline: string | null;
  intake: Record<string, unknown>;
  joinedAt: string;
  sharedContact: boolean;
  bookedCta: boolean;
  suppressed: boolean;
};

export type LiveFunnelMetrics = {
  joined: number;
  identified: number;
  anonymous: number;
  sharedContact: number;
  bookedCta: number;
  suppressed: number;
  exportable: number;
  conversionSharedPct: number;
  conversionBookedPct: number;
};

function normalizeEmail(email: string | null | undefined): string | null {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

function intakeStr(
  intake: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const k of keys) {
    const v = intake[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

function looksBooked(intake: Record<string, unknown>): boolean {
  const keys = [
    'booked',
    'book_call',
    'cta',
    'booked_call',
    'scheduled',
    'interested_in_call',
  ];
  for (const k of keys) {
    const v = intake[k];
    if (v == null) continue;
    if (typeof v === 'boolean' && v) return true;
    const s = String(v).toLowerCase();
    if (['yes', 'true', '1', 'booked', 'scheduled'].includes(s)) return true;
  }
  return false;
}

export async function buildLiveLeadList(params: {
  sessionId: number;
  organizationId: number;
}): Promise<{ session: LiveSession; leads: LiveLead[]; metrics: LiveFunnelMetrics }> {
  const session = await LiveRepo.getSessionById(
    params.sessionId,
    params.organizationId
  );
  if (!session) throw new Error('Session not found');

  const { participants } = await listAudienceParticipants(
    params.sessionId,
    params.organizationId
  );

  const leads: LiveLead[] = [];
  for (const p of participants) {
    if (p.isAnonymous) continue;
    const email =
      normalizeEmail(p.email) ||
      normalizeEmail(intakeStr(p.intake, 'email'));
    const phone = intakeStr(p.intake, 'phone', 'phone_number');
    const sharedContact = Boolean(email || phone || p.linkedinUrl);
    const bookedCta = looksBooked(p.intake);
    const suppressed = sharedContact
      ? await isOrgContactSuppressed({
          organizationId: params.organizationId,
          email,
          phone,
        })
      : false;

    leads.push({
      participantId: p.id,
      personRecordId: p.personRecordId,
      displayName: p.displayName,
      email,
      phone,
      linkedinUrl: p.linkedinUrl,
      role: intakeStr(p.intake, 'role') || p.profile.role,
      company: intakeStr(p.intake, 'company') || p.profile.company,
      headline: p.headline || p.profile.headline,
      intake: p.intake,
      joinedAt: p.joinedAt,
      sharedContact,
      bookedCta,
      suppressed,
    });
  }

  const allParticipants = await LiveRepo.listParticipants(
    params.sessionId,
    params.organizationId
  );
  const identified = allParticipants.filter((p) => !p.isAnonymous).length;
  const anonymous = allParticipants.length - identified;
  const sharedContact = leads.filter((l) => l.sharedContact && !l.suppressed).length;
  const bookedCta = leads.filter((l) => l.bookedCta && !l.suppressed).length;
  const suppressed = leads.filter((l) => l.suppressed).length;
  const exportable = leads.filter((l) => l.sharedContact && !l.suppressed).length;
  const joined = allParticipants.length;

  const metrics: LiveFunnelMetrics = {
    joined,
    identified,
    anonymous,
    sharedContact,
    bookedCta,
    suppressed,
    exportable,
    conversionSharedPct: joined
      ? Math.round((sharedContact / joined) * 100)
      : 0,
    conversionBookedPct: joined
      ? Math.round((bookedCta / joined) * 100)
      : 0,
  };

  return { session, leads, metrics };
}

export function leadsToCsv(leads: LiveLead[]): string {
  const header = [
    'participant_id',
    'person_record_id',
    'display_name',
    'email',
    'phone',
    'linkedin_url',
    'role',
    'company',
    'headline',
    'shared_contact',
    'booked_cta',
    'suppressed',
    'joined_at',
  ];
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const rows = leads
    .filter((l) => !l.suppressed)
    .map((l) =>
      [
        l.participantId,
        l.personRecordId,
        l.displayName,
        l.email,
        l.phone,
        l.linkedinUrl,
        l.role,
        l.company,
        l.headline,
        l.sharedContact ? 1 : 0,
        l.bookedCta ? 1 : 0,
        l.suppressed ? 1 : 0,
        l.joinedAt,
      ]
        .map(escape)
        .join(',')
    );
  return [header.join(','), ...rows].join('\n');
}

/**
 * Push exportable leads into survey_optins (existing opt-in rail).
 * Source = live_session; slug = live:{code}. Skips suppressed.
 */
export async function syncLeadsToOptinRails(params: {
  sessionId: number;
  organizationId: number;
}): Promise<{ synced: number; skippedSuppressed: number; skippedNoContact: number }> {
  const { session, leads } = await buildLiveLeadList(params);
  const db = await openSql();

  async function ensureColumn(sql: string) {
    try {
      await db.execute(sql);
    } catch {
      /* already exists or unsupported */
    }
  }
  await ensureColumn(
    `ALTER TABLE survey_optins ADD COLUMN organization_id INT NULL`
  );
  await ensureColumn(
    `ALTER TABLE survey_optins ADD COLUMN site_slug VARCHAR(96) NULL`
  );
  await ensureColumn(
    `ALTER TABLE survey_optins ADD COLUMN email VARCHAR(255) NULL`
  );
  await ensureColumn(
    `ALTER TABLE survey_optins MODIFY phone VARCHAR(32) NULL`
  );

  // Confirm email column; fall back to disclosure-only dedupe if missing
  let hasEmailCol = false;
  try {
    const [cols] = await db.execute<RowDataPacket[]>(
      `SHOW COLUMNS FROM survey_optins LIKE 'email'`
    );
    hasEmailCol = Boolean(cols[0]);
  } catch {
    hasEmailCol = false;
  }

  let synced = 0;
  let skippedSuppressed = 0;
  let skippedNoContact = 0;
  const slug = `live:${session.code}`;

  for (const lead of leads) {
    if (lead.suppressed) {
      skippedSuppressed += 1;
      continue;
    }
    if (!lead.email && !lead.phone) {
      skippedNoContact += 1;
      continue;
    }
    const disclosure = JSON.stringify({
      liveSessionId: session.id,
      liveCode: session.code,
      participantId: lead.participantId,
      personRecordId: lead.personRecordId,
      eventType: session.eventType,
      name: lead.displayName,
      role: lead.role,
      company: lead.company,
      email: lead.email,
    });

    if (hasEmailCol) {
      const [existing] = await db.execute<RowDataPacket[]>(
        `SELECT id FROM survey_optins
         WHERE source = 'live_session'
           AND survey_slug = ?
           AND organization_id = ?
           AND (
             (? IS NOT NULL AND email = ?)
             OR (? IS NOT NULL AND phone = ?)
           )
         LIMIT 1`,
        [
          slug,
          params.organizationId,
          lead.email,
          lead.email,
          lead.phone,
          lead.phone,
        ]
      );
      if (existing[0]) continue;

      await db.execute<ResultSetHeader>(
        `INSERT INTO survey_optins
          (survey_slug, survey_id, phone, email, consent, disclosure, source,
           organization_id, site_slug)
         VALUES (?, NULL, ?, ?, 1, ?, 'live_session', ?, NULL)`,
        [
          slug,
          lead.phone || null,
          lead.email,
          disclosure,
          params.organizationId,
        ]
      );
    } else {
      const [existing] = await db.execute<RowDataPacket[]>(
        `SELECT id FROM survey_optins
         WHERE source = 'live_session'
           AND survey_slug = ?
           AND organization_id = ?
           AND phone = ?
         LIMIT 1`,
        [slug, params.organizationId, lead.phone || lead.email || '']
      );
      if (existing[0]) continue;

      await db.execute<ResultSetHeader>(
        `INSERT INTO survey_optins
          (survey_slug, survey_id, phone, consent, disclosure, source,
           organization_id, site_slug)
         VALUES (?, NULL, ?, 1, ?, 'live_session', ?, NULL)`,
        [
          slug,
          lead.phone || lead.email || '',
          disclosure,
          params.organizationId,
        ]
      );
    }
    synced += 1;
  }

  await LiveRepo.appendEvent({
    sessionId: session.id,
    organizationId: params.organizationId,
    type: 'session.leads_synced',
    payload: { synced, skippedSuppressed, skippedNoContact, slug },
  });

  return { synced, skippedSuppressed, skippedNoContact };
}

/**
 * Compose a follow-up draft and stage it at the approval gate.
 * fullAutoSend is always false — host must approve on /outbound.
 */
export async function stageLiveFollowUp(params: {
  userId: number;
  sessionId: number;
  organizationId: number;
  format?: 'email' | 'sms';
  subject?: string;
  body?: string;
}): Promise<{
  metrics: LiveFunnelMetrics;
  stage: StageOutboundResult;
  draft: OutboundDraft;
}> {
  const { session, leads, metrics } = await buildLiveLeadList(params);
  const exportable = leads.filter((l) => l.sharedContact && !l.suppressed);
  const emails = exportable
    .map((l) => l.email)
    .filter((e): e is string => Boolean(e));
  const phones = exportable
    .map((l) => l.phone)
    .filter((p): p is string => Boolean(p));
  const personIds = exportable
    .map((l) => l.personRecordId)
    .filter((id): id is number => id != null);

  if (!emails.length && !phones.length) {
    throw new Error('No exportable contacts to follow up (after suppression)');
  }

  const opinion = await latestRoomOpinionRead(
    params.sessionId,
    params.organizationId
  );
  const format = params.format === 'sms' ? 'sms' : 'email';
  const thin = exportable.length < 20;
  const defaultBody =
    format === 'sms'
      ? `Thanks for joining ${session.title}. ${
          opinion?.roomSummary?.slice(0, 120) || 'We appreciated your input.'
        }${thin ? `\n\n${SMALL_SAMPLE_DISCLAIMER}` : ''}`
      : `Subject: Thanks for joining ${session.title}\n\nHi,\n\nThank you for being part of ${session.title}. ${
          opinion?.roomSummary || 'Your perspectives helped shape the conversation.'
        }\n\nWe'll follow up with next steps shortly.\n\n— ${
          session.hostName || 'The host'
        }${thin ? `\n\n${SMALL_SAMPLE_DISCLAIMER}` : ''}`;

  const body = params.body?.trim() || defaultBody;
  const draft: OutboundDraft = {
    format,
    title: `Live follow-up · ${session.code}`,
    body,
    groundedIn: (opinion?.groups || []).slice(0, 3).map((g) => ({
      label: g.name,
      value: `${Math.round(g.share * 100)}%`,
    })),
    honest: true,
    smallSampleDisclaimerApplied: thin,
  };

  const context: SegmentTailoringContext = {
    segmentId: `live:${session.code}`,
    segmentName: `Live · ${session.title}`,
    segmentSource: 'saved',
    voterCount: exportable.length,
    thinSegment: thin,
    observedAttributes: [
      `joined=${metrics.joined}`,
      `shared_contact=${metrics.sharedContact}`,
      `booked=${metrics.bookedCta}`,
    ],
    statedPositions: [],
    definition: { kind: 'live_session', sessionId: session.id } as any,
    disclaimer: thin ? SMALL_SAMPLE_DISCLAIMER : '',
  };

  const stage = await stageOutboundDraftSend({
    userId: params.userId,
    organizationId: params.organizationId,
    draft,
    context,
    fullAutoSend: false,
    dryRun: false,
    recipientOverride: { emails, phones, personIds },
    recipientLimit: Math.max(emails.length, phones.length, 1),
  });

  await LiveRepo.appendEvent({
    sessionId: session.id,
    organizationId: params.organizationId,
    type: 'session.followup_staged',
    payload: {
      stagedActionId: stage.stagedActionId,
      format,
      recipientCount: emails.length + phones.length,
      heldAtGate: stage.heldAtGate,
      status: stage.status,
    },
  });

  return { metrics, stage, draft };
}

/**
 * Auto-generate a shareable post-event report (top issues, sentiment/clusters, N contacts).
 */
export async function generateLivePostEventReport(params: {
  userId: string | number;
  sessionId: number;
  organizationId: number;
  endSession?: boolean;
}): Promise<{ reportId: string; metrics: LiveFunnelMetrics; reportPath: string }> {
  const { session, leads, metrics } = await buildLiveLeadList(params);
  const opinion = await latestRoomOpinionRead(
    params.sessionId,
    params.organizationId
  );
  const questions = await LiveRepo.listQuestions(session.id);
  const snapshot = await LiveRepo.buildScreenSnapshot(session.code);

  if (params.endSession !== false && session.status !== 'ended') {
    await LiveRepo.updateSession(session.id, params.organizationId, {
      status: 'ended',
    });
  }

  const clusterLines =
    opinion?.groups
      ?.map(
        (g) =>
          `- **${g.name}** (${Math.round(g.share * 100)}%, n=${g.count}): ${g.characterization} — receipts: ${g.receiptEventIds.join(', ')}`
      )
      .join('\n') || '_No open-text clusters yet._';

  const topIssues =
    snapshot?.qa
      ?.slice(0, 5)
      .map((q, i) => `${i + 1}. (↑${q.upvotes}) ${q.text}`)
      .join('\n') || '_No audience Q&A captured._';

  const activeBars =
    snapshot?.activeQuestion?.results?.pollBars
      ?.map((b) => `- ${b.label}: ${b.pct}% (n=${b.count})`)
      .join('\n') || '';

  const exec = [
    `# ${session.title} — post-event recap`,
    '',
    `Code **${session.code}** · ${session.eventType.replace('_', ' ')} · host ${session.hostName || '—'}`,
    '',
    `**Room size:** ${metrics.joined} joined (${metrics.identified} identified, ${metrics.anonymous} anonymous).`,
    `**Funnel:** ${metrics.sharedContact} shared contact (${metrics.conversionSharedPct}%) → ${metrics.bookedCta} booked/CTA (${metrics.conversionBookedPct}%).`,
    `**New exportable contacts:** ${metrics.exportable} (suppressed: ${metrics.suppressed}).`,
    '',
    opinion?.roomSummary || 'No room summary generated.',
    opinion?.smallSampleDisclaimer
      ? `\n_${opinion.smallSampleDisclaimer}_`
      : '',
  ].join('\n');

  const sections = [
    {
      type: 'executive_summary' as const,
      title: 'Executive summary',
      content: exec,
      orderIndex: 0,
    },
    {
      type: 'thematic_analysis' as const,
      title: 'Opinion clusters',
      content: [
        opinion?.roomSummary || '',
        '',
        clusterLines,
        opinion?.insufficientDataMessage
          ? `\nNote: ${opinion.insufficientDataMessage}`
          : '',
      ].join('\n'),
      orderIndex: 1,
    },
    {
      type: 'insights' as const,
      title: 'Top audience questions & poll pulse',
      content: [`## Top questions\n${topIssues}`, '', activeBars ? `## Latest poll\n${activeBars}` : ''].join(
        '\n'
      ),
      orderIndex: 2,
    },
    {
      type: 'appendix' as const,
      title: 'Funnel & contacts',
      content: [
        `| Metric | Count |`,
        `| --- | --- |`,
        `| Joined | ${metrics.joined} |`,
        `| Shared contact | ${metrics.sharedContact} |`,
        `| Booked / CTA | ${metrics.bookedCta} |`,
        `| Exportable (not suppressed) | ${metrics.exportable} |`,
        `| Suppressed | ${metrics.suppressed} |`,
        '',
        `Questions run: ${questions.length}.`,
        `Lead sample (max 15):`,
        ...leads
          .filter((l) => l.sharedContact && !l.suppressed)
          .slice(0, 15)
          .map(
            (l) =>
              `- ${l.displayName || '—'} · ${l.email || l.phone || 'no channel'} · ${l.role || ''}`
          ),
      ].join('\n'),
      orderIndex: 3,
    },
  ];

  const storage = new ReportStorageService();
  const reportId = await storage.persistPackagedReport(String(params.userId), {
    title: `Live recap · ${session.title} (${session.code})`,
    query: `live-session:${session.id}:${session.code}`,
    reportType: 'comprehensive',
    sections,
    metadata: {
      source: 'live-session',
      liveSessionId: session.id,
      liveCode: session.code,
      eventType: session.eventType,
      funnel: metrics,
      opinionGroupCount: opinion?.groupCount ?? 0,
      significance: {
        minTotalResponses: opinion?.thresholds?.minTotalResponses ?? 80,
        minCellSize: opinion?.thresholds?.minCellSize ?? 25,
        smallSampleDisclaimer: opinion?.smallSampleDisclaimer ?? null,
      },
    },
  });

  await LiveRepo.appendEvent({
    sessionId: session.id,
    organizationId: params.organizationId,
    type: 'session.report_generated',
    payload: { reportId, metrics },
  });

  return {
    reportId,
    metrics,
    reportPath: `/reports/${reportId}`,
  };
}
