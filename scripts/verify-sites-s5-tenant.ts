/**
 * Sites S5 — verify tenant scoping: client organizationId cannot leak across orgs.
 * Run: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-sites-s5-tenant.ts
 */

import { openSql } from '../src/app/utils/database/db';
import { SiteRepo } from '../src/app/utils/database/site-repo';
import { defaultSiteContent } from '../src/app/utils/types/site';
import { captureSiteForm } from '../src/app/utils/services/site-form-capture';

async function main() {
  const db = await openSql();

  // Ensure org B exists
  let orgB = 0;
  {
    const [rows] = await db.execute(
      `SELECT id FROM organizations WHERE name = 'S5 Tenant B' LIMIT 1`
    );
    const existing = (rows as { id: number }[])[0]?.id;
    if (existing) {
      orgB = Number(existing);
    } else {
      const [r] = await db.execute(
        `INSERT INTO organizations (name, slug, created_by, candidate_name, office_type, state)
         VALUES ('S5 Tenant B', ?, 2, 'Blake Other', 'state_senate', 'NY')`,
        [`s5-tenant-b-${Date.now()}`]
      );
      orgB = Number((r as { insertId: number }).insertId);
    }
  }

  const siteA = await SiteRepo.getPublishedSiteBySlug('alex-rivera-efc37bb8');
  if (!siteA) throw new Error('Need published site alex-rivera-efc37bb8 (org A)');
  const orgA = siteA.organizationId;
  if (orgA === orgB) throw new Error('org A and B must differ');

  // Publish a site for org B
  let siteBSlug = '';
  {
    const list = await SiteRepo.listSitesByOrganization(orgB);
    const published = list.find((s) => s.status === 'published');
    if (published) {
      siteBSlug = published.slug;
    } else {
      const content = defaultSiteContent({
        meta: { candidateName: 'Blake Other', office: 'State Senate' },
      });
      const id = await SiteRepo.createSite({
        organizationId: orgB,
        templateId: 'classic_civic',
        content,
        status: 'published',
        createdBy: 2,
      });
      const site = await SiteRepo.getSiteById(id, orgB);
      siteBSlug = site!.slug;
    }
  }

  const unique = Date.now();
  const emailA = `s5-tenant-a-${unique}@example.com`;
  const emailB = `s5-tenant-b-${unique}@example.com`;

  // Submit to site A while spoofing organizationId = orgB
  const capA = await captureSiteForm({
    siteSlug: siteA.slug,
    formType: 'signup',
    name: 'Tenant A Person',
    email: emailA,
    phone: '+15551001001',
    metadata: { rejectedClientOrganizationId: orgB },
  });

  if (capA.organizationId !== orgA) {
    throw new Error(
      `LEAK: signup for site A stored under org ${capA.organizationId}, expected ${orgA}`
    );
  }
  if (capA.organizationId === orgB) {
    throw new Error('LEAK: client organizationId=B was trusted');
  }

  // Submit to site B
  const capB = await captureSiteForm({
    siteSlug: siteBSlug,
    formType: 'volunteer',
    name: 'Tenant B Person',
    email: emailB,
    phone: '+15551001002',
    metadata: { rejectedClientOrganizationId: orgA },
  });

  if (capB.organizationId !== orgB) {
    throw new Error(
      `LEAK: volunteer for site B stored under org ${capB.organizationId}, expected ${orgB}`
    );
  }

  // person_records must not cross
  const [personsA] = await db.execute(
    `SELECT id, organization_id, email FROM person_records
     WHERE organization_id = ? AND LOWER(email) = ?`,
    [orgA, emailA.toLowerCase()]
  );
  const [personsB] = await db.execute(
    `SELECT id, organization_id, email FROM person_records
     WHERE organization_id = ? AND LOWER(email) = ?`,
    [orgB, emailB.toLowerCase()]
  );
  const [crossA] = await db.execute(
    `SELECT id FROM person_records WHERE organization_id = ? AND LOWER(email) = ?`,
    [orgB, emailA.toLowerCase()]
  );
  const [crossB] = await db.execute(
    `SELECT id FROM person_records WHERE organization_id = ? AND LOWER(email) = ?`,
    [orgA, emailB.toLowerCase()]
  );

  if (!(personsA as unknown[]).length) throw new Error('person A missing in org A');
  if (!(personsB as unknown[]).length) throw new Error('person B missing in org B');
  if ((crossA as unknown[]).length) throw new Error('LEAK: email A appears in org B');
  if ((crossB as unknown[]).length) throw new Error('LEAK: email B appears in org A');

  // Unpublished / unknown slug must fail
  let unpublishedOk = false;
  try {
    await captureSiteForm({
      siteSlug: 'does-not-exist-s5-xyz',
      formType: 'contact',
      name: 'X',
      email: 'x@example.com',
      message: 'hello there friend',
    });
  } catch (e) {
    unpublishedOk =
      Boolean(e && typeof e === 'object' && (e as { statusCode?: number }).statusCode === 404);
  }
  if (!unpublishedOk) throw new Error('Expected 404 for unknown slug');

  // submissions table tenant columns
  const [subs] = await db.execute(
    `SELECT organization_id, site_slug, form_type FROM site_form_submissions
     WHERE id IN (?, ?)`,
    [capA.submissionId, capB.submissionId]
  );
  console.log('VERIFY_OK', {
    orgA,
    orgB,
    siteA: siteA.slug,
    siteB: siteBSlug,
    capA: { org: capA.organizationId, id: capA.submissionId },
    capB: { org: capB.organizationId, id: capB.submissionId },
    subs,
  });
  process.exit(0);
}

main().catch((e) => {
  console.error('VERIFY_FAILED', e);
  process.exit(1);
});
