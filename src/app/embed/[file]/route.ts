import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * GET /embed/<shortCode>.js
 *
 * The "embed for your newsletter" snippet from the Garry's List setup: a
 * <script src="..."> that injects the public survey as an inline iframe
 * wherever it's placed (e.g. inside a website page). Real email clients
 * strip <script> tags, so for actual newsletters the plain /s/<code> link
 * (or its "no thanks" text link) is what actually renders — this embed is
 * for publisher websites/blog posts that host the same story.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const code = file.replace(/\.js$/i, '');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://antelopedata.org';
  const surveyUrl = `${baseUrl}/s/${code}`;

  const js = `(function(){
  var s = document.currentScript;
  var iframe = document.createElement('iframe');
  iframe.src = ${JSON.stringify(surveyUrl)};
  iframe.style.width = '100%';
  iframe.style.maxWidth = '480px';
  iframe.style.border = '1px solid #e5e7eb';
  iframe.style.borderRadius = '8px';
  iframe.style.minHeight = '260px';
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('title', 'Reader survey');
  if (s && s.parentNode) { s.parentNode.insertBefore(iframe, s.nextSibling); }
  else { document.write(iframe.outerHTML); }
})();`;

  return new NextResponse(js, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
