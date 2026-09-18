/**
 * V1 smoke: provider capabilities, mock generate, tool risk stays approval.
 */
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

async function main() {
  const {
    getDefaultVideoProviderId,
    getVideoProvider,
    listVideoProviders,
    assertRegistryRiskIntegrity,
  } = await import('../src/app/utils/services/tools/registry')
    .then(async () => {
      const providers = await import('../src/app/utils/services/video/providers');
      const registry = await import('../src/app/utils/services/tools/registry');
      return { ...providers, ...registry };
    });

  assertRegistryRiskIntegrity();
  const tool = (await import('../src/app/utils/services/tools/registry')).getTool(
    'generate_and_post_video'
  );
  if (!tool || tool.risk !== 'approval') {
    throw new Error('generate_and_post_video must remain risk=approval');
  }
  console.log('tool risk ok');

  const providers = listVideoProviders();
  console.log(
    'providers',
    providers.map((p) => `${p.id}[${p.modes.join(',')}]`).join(' | ')
  );
  const def = getDefaultVideoProviderId();
  console.log('default provider', def);

  const mock = getVideoProvider('mock');
  const handle = await mock.generate({
    prompt: 'housing plan upbeat city',
    mode: 't2v',
    aspectRatio: '9:16',
  });
  const result = await mock.result(handle.jobId);
  console.log('mock result', result.assetUrl?.slice(0, 60));

  const { startVideoGeneration, refreshVideoJob } = await import(
    '../src/app/utils/services/video/generate-service'
  );
  const job = await startVideoGeneration({
    userId: 1,
    prompt: 'gotv clip',
    mode: 't2v',
    provider: 'mock',
  });
  let refreshed = job;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 800));
    refreshed = await refreshVideoJob(job.jobId);
    if (refreshed.status === 'succeeded') break;
  }
  console.log('orchestrated job', refreshed.status, refreshed.assetUrl?.slice(0, 50));
  if (refreshed.status !== 'succeeded') throw new Error('mock job did not succeed');

  // Mode filtering: wan without FAL_WAN_V2V should not claim v2v unless env set
  const wan = getVideoProvider('wan').capabilities();
  console.log('wan modes', wan.modes.join(','));

  console.log('V1 smoke OK');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
