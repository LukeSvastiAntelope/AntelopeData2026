/**
 * Volunteer V3 — stage pre-shift reminders + post-shift check-in prompts
 * through the gated outbound (never auto-sends).
 */

import {
  stageOutboundDraftSend,
  type StageOutboundResult,
} from '@/app/utils/services/outbound-send-governance';
import type { OutboundDraft } from '@/app/utils/services/outbound-draft-service';
import type { SegmentTailoringContext } from '@/app/utils/services/outbound-draft-service';
import {
  VolunteerShiftsRepo,
  type VolunteerShift,
} from '@/app/utils/database/volunteer-shifts-repo';

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export async function stageShiftReminder(params: {
  userId: number;
  organizationId: number;
  shift: VolunteerShift;
  kind: 'pre_shift' | 'post_shift_checkin';
  format?: 'email' | 'sms';
}): Promise<{
  staged: StageOutboundResult | null;
  recipientCount: number;
  skippedReason?: string;
}> {
  const claims = await VolunteerShiftsRepo.listActiveClaimsForShift(
    params.shift.id
  );
  const emails = claims
    .map((c) => c.email)
    .filter((e): e is string => Boolean(e));
  const phones = claims
    .map((c) => c.phone)
    .filter((p): p is string => Boolean(p));
  const personIds = claims
    .map((c) => c.personRecordId)
    .filter((id): id is number => id != null);

  if (!emails.length && !phones.length) {
    return {
      staged: null,
      recipientCount: 0,
      skippedReason: 'No contactable claimants',
    };
  }

  const format =
    params.format ||
    (emails.length ? 'email' : 'sms');

  const when = formatWhen(params.shift.startsAt);
  const where = params.shift.locationText || 'see portal for details';
  const turfNote = params.shift.turfLabel
    ? ` Turf: ${params.shift.turfLabel}.`
    : '';

  let body: string;
  if (params.kind === 'pre_shift') {
    body =
      format === 'sms'
        ? `Reminder: "${params.shift.title}" ${when} @ ${where}.${turfNote} Reply or open the portal to check in. Thanks!`
        : `Subject: Reminder — ${params.shift.title}\n\nHi,\n\nFriendly reminder that you're signed up for **${params.shift.title}** on ${when} (${where}).${turfNote}\n\nOpen the volunteer portal to confirm or check in when you arrive.\n\nThank you for volunteering.`;
  } else {
    body =
      format === 'sms'
        ? `Thanks for "${params.shift.title}"! Tap the portal to check in if you haven't — it helps us cut no-shows.`
        : `Subject: Check in — ${params.shift.title}\n\nHi,\n\nThanks for being part of **${params.shift.title}**. If you made it, please check in on the volunteer portal so we know who showed up.\n\nYour time matters — we appreciate you.`;
  }

  const draft: OutboundDraft = {
    format,
    title:
      params.kind === 'pre_shift'
        ? `Volunteer reminder · ${params.shift.title}`
        : `Volunteer check-in · ${params.shift.title}`,
    body,
    groundedIn: [
      { label: 'shift', value: params.shift.title },
      { label: 'starts', value: when },
      { label: 'claimants', value: String(claims.length) },
    ],
    honest: true,
    smallSampleDisclaimerApplied: claims.length < 10,
  };

  const context: SegmentTailoringContext = {
    segmentId: `volunteer_shift:${params.shift.id}`,
    segmentName: `Volunteers · ${params.shift.title}`,
    segmentSource: 'saved',
    voterCount: claims.length,
    thinSegment: claims.length < 10,
    observedAttributes: [
      `shift_id=${params.shift.id}`,
      `kind=${params.kind}`,
      `turf=${params.shift.turfId || 'none'}`,
    ],
    statedPositions: [],
    definition: {
      kind: 'volunteer_shift',
      shiftId: params.shift.id,
      reminderKind: params.kind,
    } as any,
    disclaimer: '',
  };

  const stage = await stageOutboundDraftSend({
    userId: params.userId,
    organizationId: params.organizationId,
    draft,
    context,
    fullAutoSend: false,
    dryRun: false,
    recipientOverride: {
      emails: format === 'email' ? emails : [],
      phones: format === 'sms' ? phones : [],
      personIds,
    },
    recipientLimit: Math.max(emails.length, phones.length, 1),
  });

  await VolunteerShiftsRepo.markReminderStaged(params.shift.id, params.kind);
  await VolunteerShiftsRepo.logReminder({
    organizationId: params.organizationId,
    kind: params.kind,
    shiftId: params.shift.id,
    stagedActionId: stage.stagedActionId,
    recipientCount: claims.length,
  });

  return { staged: stage, recipientCount: claims.length };
}

/**
 * Poll shifts that need pre-reminder or post-checkin prompts and stage them.
 * Always holds at the outbound approval gate.
 */
export async function pollVolunteerShiftReminders(opts?: {
  organizationId?: number;
}): Promise<{
  considered: number;
  staged: number;
  skipped: number;
  results: Array<{
    shiftId: number;
    kind: string;
    staged: boolean;
    stagedActionId?: number;
    skippedReason?: string;
  }>;
}> {
  const results: Array<{
    shiftId: number;
    kind: string;
    staged: boolean;
    stagedActionId?: number;
    skippedReason?: string;
  }> = [];
  let staged = 0;
  let skipped = 0;

  const needingPre = await VolunteerShiftsRepo.listShiftsNeedingPreReminder({
    organizationId: opts?.organizationId,
  });
  const needingCheckin =
    await VolunteerShiftsRepo.listShiftsNeedingCheckinPrompt({
      organizationId: opts?.organizationId,
    });

  const jobs: Array<{
    shift: VolunteerShift;
    kind: 'pre_shift' | 'post_shift_checkin';
  }> = [
    ...needingPre.map((s) => ({ shift: s, kind: 'pre_shift' as const })),
    ...needingCheckin.map((s) => ({
      shift: s,
      kind: 'post_shift_checkin' as const,
    })),
  ];

  for (const job of jobs) {
    const ownerId = await VolunteerShiftsRepo.resolveOrgOwnerUserId(
      job.shift.organizationId
    );
    if (!ownerId) {
      skipped++;
      results.push({
        shiftId: job.shift.id,
        kind: job.kind,
        staged: false,
        skippedReason: 'No org owner/admin to stage under',
      });
      continue;
    }
    try {
      const out = await stageShiftReminder({
        userId: ownerId,
        organizationId: job.shift.organizationId,
        shift: job.shift,
        kind: job.kind,
      });
      if (!out.staged) {
        skipped++;
        results.push({
          shiftId: job.shift.id,
          kind: job.kind,
          staged: false,
          skippedReason: out.skippedReason,
        });
        // Still mark so we don't retry forever with no contacts
        await VolunteerShiftsRepo.markReminderStaged(
          job.shift.id,
          job.kind
        );
        continue;
      }
      staged++;
      results.push({
        shiftId: job.shift.id,
        kind: job.kind,
        staged: true,
        stagedActionId: out.staged.stagedActionId,
      });
    } catch (err) {
      skipped++;
      results.push({
        shiftId: job.shift.id,
        kind: job.kind,
        staged: false,
        skippedReason:
          err instanceof Error ? err.message : 'stage failed',
      });
    }
  }

  return {
    considered: jobs.length,
    staged,
    skipped,
    results,
  };
}
