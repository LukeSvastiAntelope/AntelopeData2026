/**
 * QA hardening smoke — fail-closed Live secrets + cron auth in production.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/smoke-qa-failclosed.ts
 */

import { NextRequest } from 'next/server';
import {
  isProductionRuntime,
  liveSigningSecret,
  liveSigningSecretOrNull,
} from '../src/app/utils/live/signing-secret';
import {
  issueHostToken,
  verifyHostToken,
} from '../src/app/utils/live/host-token';
import {
  issueParticipantToken,
  verifyParticipantToken,
} from '../src/app/utils/live/participant-token';
import { assertCronAuthorized } from '../src/app/utils/cron-auth';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const saved: Record<string, string | undefined> = {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
  AUTH_SECRET: process.env.AUTH_SECRET,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  JWT_SECRET_KEY: process.env.JWT_SECRET_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
};

function clearSecrets() {
  delete process.env.AUTH_SECRET;
  delete process.env.NEXTAUTH_SECRET;
  delete process.env.JWT_SECRET_KEY;
  delete process.env.CRON_SECRET;
  delete process.env.VERCEL_ENV;
}

function restore() {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

async function main() {
  try {
    // production: no secret → throw / null
    clearSecrets();
    process.env.NODE_ENV = 'production';
    assert(isProductionRuntime() === true, 'prod detect');
    let threw = false;
    try {
      liveSigningSecret();
    } catch {
      threw = true;
    }
    assert(threw, 'liveSigningSecret throws in prod without secret');
    assert(liveSigningSecretOrNull() === null, 'orNull returns null');
    assert(verifyHostToken('x.y') === null, 'verify host rejects');
    assert(verifyParticipantToken('x.y') === null, 'verify participant rejects');

    delete process.env.CRON_SECRET;
    const r1 = assertCronAuthorized(
      new NextRequest('http://localhost/api/cron/x', { method: 'POST' })
    );
    assert(r1 !== null && r1.status === 503, 'cron 503 when unset in prod');

    process.env.CRON_SECRET = 'correct';
    const r2 = assertCronAuthorized(
      new NextRequest('http://localhost/api/cron/x', {
        method: 'POST',
        headers: { 'x-cron-secret': 'wrong' },
      })
    );
    assert(r2 !== null && r2.status === 401, 'cron 401 wrong secret');

    assert(
      assertCronAuthorized(
        new NextRequest('http://localhost/api/cron/x', {
          method: 'POST',
          headers: { 'x-cron-secret': 'correct' },
        })
      ) === null,
      'cron allows correct secret'
    );

    // development fallback
    clearSecrets();
    process.env.NODE_ENV = 'development';
    assert(liveSigningSecret() === 'live-dev-secret', 'dev fallback');
    const tok = issueHostToken({
      sessionId: 1,
      organizationId: 2,
      code: 'ABC',
    });
    assert(verifyHostToken(tok)?.sessionId === 1, 'dev roundtrip host');
    const ptok = issueParticipantToken({
      participantId: 9,
      sessionId: 1,
      organizationId: 2,
    });
    assert(
      verifyParticipantToken(ptok)?.participantId === 9,
      'dev roundtrip participant'
    );
    assert(
      assertCronAuthorized(
        new NextRequest('http://localhost/x', { method: 'POST' })
      ) === null,
      'dev cron open ok'
    );

    console.log('QA fail-closed smoke PASSED');
  } finally {
    restore();
  }
}

main().catch((err) => {
  console.error('QA fail-closed smoke FAILED', err);
  process.exit(1);
});
