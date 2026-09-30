/**
 * Volunteer V4 — AI personalized scripts, gated outbound, convert-to-volunteer.
 * Private contacts never merge into the org voter file.
 */

import { createCompletion } from '@/app/utils/services/ai-service';
import {
  stageOutboundDraftSend,
  type StageOutboundResult,
} from '@/app/utils/services/outbound-send-governance';
import type { OutboundDraft } from '@/app/utils/services/outbound-draft-service';
import type { SegmentTailoringContext } from '@/app/utils/services/outbound-draft-service';
import {
  VolunteerRelationalRepo,
  type OutreachChannel,
  type OutreachOutcome,
  type PrivateContact,
  type RelationalOutreach,
} from '@/app/utils/database/volunteer-relational-repo';
import { VolunteerEventsRepo } from '@/app/utils/database/volunteer-events-repo';
import { VolunteerRepo } from '@/app/utils/database/volunteer-repo';
import { EmailService } from '@/app/utils/services/email-service';
import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2/promise';

function fallbackScript(contact: PrivateContact, volunteerName: string): string {
  const rel = contact.relationshipNote
    ? ` (my ${contact.relationshipNote})`
    : '';
  const first = contact.displayName.split(/\s+/)[0] || contact.displayName;
  return `Hey ${first} — it's ${volunteerName}${rel}. I'm volunteering with a local campaign I care about and thought of you. Would you be open to hearing a quick pitch, or even joining me for a shift? No pressure either way — just wanted to reach out personally.`;
}

async function resolveVolunteerName(
  userId: number,
  organizationId: number
): Promise<string> {
  const sql = await openSql();
  const [rows] = await sql.execute<RowDataPacket[]>(
    `SELECT u.display_name, u.email, pr.first_name
     FROM users u
     LEFT JOIN organization_members om
       ON om.user_id = u.id AND om.organization_id = ?
     LEFT JOIN person_records pr ON pr.id = om.person_record_id
     WHERE u.id = ?
     LIMIT 1`,
    [organizationId, userId]
  );
  if (!rows.length) return 'a friend';
  const r = rows[0];
  if (r.display_name) return String(r.display_name).split(/\s+/)[0];
  if (r.first_name) return String(r.first_name);
  if (r.email) return String(r.email).split('@')[0];
  return 'a friend';
}

async function resolveCampaignName(organizationId: number): Promise<string> {
  const sql = await openSql();
  const [rows] = await sql.execute<RowDataPacket[]>(
    `SELECT name FROM organizations WHERE id = ? LIMIT 1`,
    [organizationId]
  );
  return rows[0]?.name ? String(rows[0].name) : 'our campaign';
}

/**
 * Generate a short, personal outreach script for one private contact.
 * Falls back to a template when no LLM key is configured.
 */
export async function generateRelationalScript(input: {
  organizationId: number;
  ownerUserId: number;
  contact: PrivateContact;
  channel?: OutreachChannel;
  askHint?: string | null;
}): Promise<{ script: string; usedFallback: boolean }> {
  const volunteerName = await resolveVolunteerName(
    input.ownerUserId,
    input.organizationId
  );
  const campaign = await resolveCampaignName(input.organizationId);
  const channel = input.channel || 'sms';
  const fallback = fallbackScript(input.contact, volunteerName);

  if (!process.env.ANTHROPIC_API_KEY) {
    return { script: fallback, usedFallback: true };
  }

  try {
    const completion = await createCompletion({
      tier: 'workhorse',
      temperature: 0.55,
      maxTokens: 280,
      usage: {
        organizationId: input.organizationId,
        userId: input.ownerUserId,
        feature: 'volunteer.relational',
      },
      messages: [
        {
          role: 'system',
          content: `You write short, warm relational outreach scripts for political volunteers texting or emailing people they already know.
Rules:
- Write in first person as the volunteer.
- Sound like a real person, not a campaign blast.
- 2–4 short sentences for SMS; up to 5 for email.
- Do NOT invent policy positions or attack opponents.
- Soft ask only — invite to learn more or volunteer.
- Return ONLY the script text, no quotes or labels.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            volunteerFirstName: volunteerName,
            campaignName: campaign,
            contactFirstName:
              input.contact.displayName.split(/\s+/)[0] ||
              input.contact.displayName,
            relationship: input.contact.relationshipNote || null,
            channel,
            askHint: input.askHint || 'Invite them to help or hear more',
          }),
        },
      ],
    });
    const script = (completion.content || '').trim();
    if (!script || script.length < 20) {
      return { script: fallback, usedFallback: true };
    }
    return { script: script.slice(0, 1200), usedFallback: false };
  } catch (err) {
    console.warn('[generateRelationalScript] LLM failed', err);
    return { script: fallback, usedFallback: true };
  }
}

export async function assignRelationalOutreach(input: {
  organizationId: number;
  ownerUserId: number;
  contactId: number;
  channel?: OutreachChannel;
  askHint?: string | null;
}): Promise<{ outreach: RelationalOutreach; usedFallback: boolean }> {
  const contact = await VolunteerRelationalRepo.getContact(
    input.contactId,
    input.ownerUserId,
    input.organizationId
  );
  if (!contact) throw new Error('Contact not found');

  let channel: OutreachChannel = input.channel || 'sms';
  if (!input.channel) {
    if (contact.phone) channel = 'sms';
    else if (contact.email) channel = 'email';
    else channel = 'in_person';
  }

  const { script, usedFallback } = await generateRelationalScript({
    organizationId: input.organizationId,
    ownerUserId: input.ownerUserId,
    contact,
    channel,
    askHint: input.askHint,
  });

  const outreach = await VolunteerRelationalRepo.createOutreach({
    organizationId: input.organizationId,
    ownerUserId: input.ownerUserId,
    contactId: contact.id,
    channel,
    scriptText: script,
  });

  await VolunteerEventsRepo.append({
    organizationId: input.organizationId,
    userId: input.ownerUserId,
    kind: 'outreach_scripted',
    points: 0,
    relatedType: 'outreach',
    relatedId: outreach.id,
    payload: { contactId: contact.id, channel, usedFallback },
  });

  return { outreach, usedFallback };
}

/**
 * Stage an SMS/email send through the gated outbound — never auto-sends.
 */
export async function stageRelationalSend(input: {
  organizationId: number;
  ownerUserId: number;
  outreachId: number;
}): Promise<{
  outreach: RelationalOutreach;
  staged: StageOutboundResult | null;
  skippedReason?: string;
}> {
  const outreach = await VolunteerRelationalRepo.getOutreach(
    input.outreachId,
    input.ownerUserId,
    input.organizationId
  );
  if (!outreach) throw new Error('Outreach not found');

  const format =
    outreach.channel === 'email'
      ? 'email'
      : outreach.channel === 'sms'
        ? 'sms'
        : null;
  if (!format) {
    return {
      outreach,
      staged: null,
      skippedReason:
        'In-person / call outreach is logged manually — nothing to stage',
    };
  }

  const email = outreach.contactEmail;
  const phone = outreach.contactPhone;
  if (format === 'email' && !email) {
    return { outreach, staged: null, skippedReason: 'Contact has no email' };
  }
  if (format === 'sms' && !phone) {
    return { outreach, staged: null, skippedReason: 'Contact has no phone' };
  }

  const name = outreach.contactName || 'friend';
  const body =
    format === 'email'
      ? `Subject: From me — a personal note\n\n${outreach.scriptText}`
      : outreach.scriptText;

  const draft: OutboundDraft = {
    format,
    title: `Relational · ${name}`,
    body,
    groundedIn: [
      { label: 'channel', value: format },
      { label: 'volunteer', value: String(input.ownerUserId) },
      { label: 'private_contact', value: 'not_in_voter_file' },
    ],
    honest: true,
    smallSampleDisclaimerApplied: true,
  };

  const context: SegmentTailoringContext = {
    segmentId: `volunteer_relational:${outreach.id}`,
    segmentName: `Relational · private network`,
    segmentSource: 'saved',
    voterCount: 1,
    thinSegment: true,
    observedAttributes: [
      `outreach_id=${outreach.id}`,
      `private_network=1`,
      `never_merge_voter_file=1`,
    ],
    statedPositions: [],
    definition: {
      kind: 'volunteer_relational',
      outreachId: outreach.id,
    } as any,
    disclaimer: 'Private volunteer network — not voter file',
  };

  const stage = await stageOutboundDraftSend({
    userId: input.ownerUserId,
    organizationId: input.organizationId,
    draft,
    context,
    fullAutoSend: false,
    dryRun: false,
    recipientOverride: {
      emails: format === 'email' && email ? [email] : [],
      phones: format === 'sms' && phone ? [phone] : [],
      personIds: [],
    },
    recipientLimit: 1,
  });

  await VolunteerRelationalRepo.markStaged({
    outreachId: outreach.id,
    ownerUserId: input.ownerUserId,
    organizationId: input.organizationId,
    stagedActionId: stage.stagedActionId,
  });

  await VolunteerEventsRepo.append({
    organizationId: input.organizationId,
    userId: input.ownerUserId,
    kind: 'outreach_staged',
    points: 0,
    relatedType: 'outreach',
    relatedId: outreach.id,
    payload: { stagedActionId: stage.stagedActionId, format },
  });

  const refreshed = await VolunteerRelationalRepo.getOutreach(
    outreach.id,
    input.ownerUserId,
    input.organizationId
  );

  return { outreach: refreshed!, staged: stage };
}

export async function logRelationalOutcome(input: {
  organizationId: number;
  ownerUserId: number;
  outreachId: number;
  outcome: OutreachOutcome;
  outcomeNote?: string | null;
}): Promise<RelationalOutreach> {
  const logged = await VolunteerRelationalRepo.logOutcome(input);

  // Points only for meaningful reach outcomes
  const pointsWorthy = [
    'reached',
    'will_help',
    'wants_to_volunteer',
    'left_message',
  ].includes(input.outcome);

  await VolunteerEventsRepo.append({
    organizationId: input.organizationId,
    userId: input.ownerUserId,
    kind: 'outreach_logged',
    points: pointsWorthy ? undefined : 0,
    relatedType: 'outreach',
    relatedId: logged.id,
    payload: { outcome: input.outcome },
  });

  return logged;
}

/**
 * Convert a private contact into a volunteer invite (magic link).
 * Creates volunteer identity via existing spine — does NOT merge the
 * private contact row into the voter file / canvassing person list.
 */
export async function convertContactToVolunteer(input: {
  organizationId: number;
  ownerUserId: number;
  outreachId: number;
}): Promise<{
  outreach: RelationalOutreach;
  joinPath: string;
  email: string;
}> {
  const outreach = await VolunteerRelationalRepo.getOutreach(
    input.outreachId,
    input.ownerUserId,
    input.organizationId
  );
  if (!outreach) throw new Error('Outreach not found');
  const email = outreach.contactEmail?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Contact needs an email to convert to a volunteer');
  }

  const issued = await VolunteerRepo.issueMagicLink({
    organizationId: input.organizationId,
    email,
    displayName: outreach.contactName || null,
    invitedBy: input.ownerUserId,
    source: 'relational_recruit' as any,
    phone: outreach.contactPhone,
    intake: {
      recruited_by_user_id: input.ownerUserId,
      private_contact_id: outreach.contactId,
      note: 'Converted from private friends-and-family network (not voter file)',
    },
  });

  const campaign = await resolveCampaignName(input.organizationId);
  try {
    await EmailService.sendVolunteerMagicLink(
      issued.email,
      outreach.contactName || undefined,
      issued.rawToken,
      campaign
    );
  } catch (err) {
    console.warn('[convertContactToVolunteer] email failed', err);
  }

  await VolunteerRelationalRepo.markConverted({
    outreachId: outreach.id,
    ownerUserId: input.ownerUserId,
    organizationId: input.organizationId,
  });

  if (!outreach.outcome) {
    await VolunteerRelationalRepo.logOutcome({
      outreachId: outreach.id,
      ownerUserId: input.ownerUserId,
      organizationId: input.organizationId,
      outcome: 'wants_to_volunteer',
      outcomeNote: 'Converted to volunteer invite',
    });
  }

  await VolunteerEventsRepo.append({
    organizationId: input.organizationId,
    userId: input.ownerUserId,
    kind: 'contact_converted',
    relatedType: 'outreach',
    relatedId: outreach.id,
    payload: {
      email: issued.email,
      privateContactId: outreach.contactId,
      neverMergedToVoterFile: true,
    },
  });

  const refreshed = await VolunteerRelationalRepo.getOutreach(
    outreach.id,
    input.ownerUserId,
    input.organizationId
  );

  return {
    outreach: refreshed!,
    joinPath: `/portal/auth/verify?token=${encodeURIComponent(issued.rawToken)}`,
    email: issued.email,
  };
}
