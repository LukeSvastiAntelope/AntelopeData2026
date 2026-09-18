/**
 * V2 smoke: clip providers, clip_video risk=auto, mock clip job, guardrails.
 */
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

async function main() {
  const { assertRegistryRiskIntegrity, getTool } = await import(
    '../src/app/utils/services/tools/registry'
  );
  assertRegistryRiskIntegrity();
  const clipTool = getTool('clip_video');
  if (!clipTool || clipTool.risk !== 'auto') {
    throw new Error('clip_video must be risk=auto');
  }
  const postTool = getTool('generate_and_post_video');
  if (!postTool || postTool.risk !== 'approval') {
    throw new Error('generate_and_post_video must stay approval');
  }
  console.log('registry risks ok');

  const {
    getDefaultClipProviderId,
    listClipProviders,
    getClipProvider,
  } = await import('../src/app/utils/services/video/clippers');
  console.log(
    'clippers',
    listClipProviders()
      .map((p) => p.id)
      .join(','),
    'default=',
    getDefaultClipProviderId()
  );

  const {
    assertOwnAssetUse,
    applyAiDisclosure,
  } = await import('../src/app/utils/services/video/guardrails');
  const blocked = assertOwnAssetUse({
    prompt: 'animate Trump saying our housing plan',
  });
  if (blocked.ok) throw new Error('expected public-figure prompt to block');
  console.log('guardrail blocked public figure:', blocked.reason?.slice(0, 60));

  const okOwn = assertOwnAssetUse({
    prompt: '30-sec clip of me talking about housing, city backdrop',
  });
  if (!okOwn.ok) throw new Error('own-candidate prompt should pass');

  const withDisc = applyAiDisclosure({
    caption: 'Vote Tuesday',
    includeDisclosure: true,
  });
  if (!withDisc.includes('AI-generated')) throw new Error('disclosure missing');
  console.log('disclosure ok');

  const { startClipJob, refreshClipJob } = await import(
    '../src/app/utils/services/video/clip-service'
  );
  const job = await startClipJob({
    userId: 1,
    sourceUrl: 'https://example.com/speech.mp4',
    provider: 'mock',
  });
  let refreshed = job;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 700));
    refreshed = await refreshClipJob(job.jobId);
    if (refreshed.status === 'succeeded') break;
  }
  console.log(
    'clip job',
    refreshed.status,
    'clips',
    refreshed.clips.length,
    'top',
    refreshed.clips[0]?.hook?.slice(0, 40)
  );
  if (refreshed.status !== 'succeeded' || !refreshed.clips.length) {
    throw new Error('mock clip job failed');
  }

  // Ensure inhouse is explicitly not built
  try {
    getClipProvider('inhouse');
    throw new Error('inhouse should throw');
  } catch (e) {
    if (!(e instanceof Error) || !/not built/i.test(e.message)) throw e;
    console.log('V3 inhouse correctly unavailable');
  }

  console.log('V2 smoke OK');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
