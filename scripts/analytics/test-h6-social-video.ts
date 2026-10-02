/**
 * H6 smoke: disclosure exact-match + playable URL proxy helper.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/analytics/test-h6-social-video.ts
 */

import { applyAiDisclosure, AI_DISCLOSURE_DEFAULT } from '../../src/app/utils/services/video/guardrails';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/** Mirror of resolvePlayableMediaUrl without DOM. */
function resolvePlayableMediaUrl(
  url: string | null | undefined,
  localAssetUrl?: string | null
): string {
  const local = (localAssetUrl || '').trim();
  if (local) return local;
  const raw = (url || '').trim();
  if (!raw) throw new Error('Missing media URL');
  if (
    raw.startsWith('/api/media/') ||
    raw.startsWith('/api/image-proxy') ||
    raw.startsWith('data:') ||
    raw.startsWith('blob:')
  ) {
    return raw;
  }
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return `/api/image-proxy?url=${encodeURIComponent(raw)}`;
}

function main() {
  // Disclosure: mentioning "ai-generated" elsewhere must NOT skip append
  const withMention = applyAiDisclosure({
    caption: 'Our AI-generated polling model found a trend.',
    includeDisclosure: true,
  });
  assert(
    withMention.includes(AI_DISCLOSURE_DEFAULT),
    'must append exact disclosure even if caption says ai-generated elsewhere'
  );
  assert(
    withMention.split(AI_DISCLOSURE_DEFAULT).length === 2,
    'disclosure appears once'
  );

  // Exact text already present → no duplicate
  const already = applyAiDisclosure({
    caption: `Great clip.\n\n${AI_DISCLOSURE_DEFAULT}`,
    includeDisclosure: true,
  });
  assert(
    already.split(AI_DISCLOSURE_DEFAULT).length === 2,
    'exact disclosure not duplicated'
  );

  // Proxied fal URL
  const fal =
    'https://fal.media/files/elephant/abc123.mp4';
  const proxied = resolvePlayableMediaUrl(fal, null);
  assert(
    proxied.startsWith('/api/image-proxy?url='),
    'remote fal URL goes through image-proxy'
  );
  assert(
    resolvePlayableMediaUrl(fal, '/api/media/u/x.mp4') ===
      '/api/media/u/x.mp4',
    'localAssetUrl wins'
  );

  console.log('PASS: H6 social/video guards');
}

main();
