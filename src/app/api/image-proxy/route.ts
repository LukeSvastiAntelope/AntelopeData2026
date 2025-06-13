import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return new NextResponse('Image URL is required', { status: 400 });
  }

  // Basic URL validation (you might want to make this more robust)
  try {
    const url = new URL(imageUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Invalid protocol');
    }
    // Optional: Add domain whitelisting or blacklisting here if needed for extra security,
    // though the primary goal here is flexibility.
    // const allowedDomains = ['www.aljazeera.com', 'www.thesportsdb.com', 's2.coinmarketcap.com', 'some.other.domain'];
    // if (!allowedDomains.includes(url.hostname)) {
    //   return new NextResponse('Domain not allowed by proxy', { status: 403 });
    // }

  } catch (error) {
    return new NextResponse('Invalid image URL format', { status: 400 });
  }

  try {
    const response = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        // Optional: Forward some headers or set a specific User-Agent
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      // Add a timeout to prevent hanging requests (e.g., 10 seconds)
      // This requires AbortController, which is standard in Node.js 15+ and modern browsers
      // signal: AbortSignal.timeout(10000), // Not directly available in all Edge Runtimes like this
    });

    if (!response.ok) {
      // If the external image server returned an error (e.g., 404, 500)
      // Instead of returning an error, return a placeholder image
      if (response.status === 404) {
        // Return a simple 1x1 transparent PNG as placeholder
        const transparentPng = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU8qAAAAAElFTkSuQmCC',
          'base64'
        );
        
        const headers = new Headers();
        headers.set('Content-Type', 'image/png');
        headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        
        return new NextResponse(transparentPng, {
          status: 200,
          headers: headers,
        });
      }
      
      // For other errors (500, etc.), still return the error
      return new NextResponse(`Failed to fetch image: ${response.status} ${response.statusText}`, {
        status: response.status,
      });
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // Set caching headers: e.g., cache for 1 day in browsers and shared caches (like CDNs)
    // Vercel's Edge Cache might also pick this up.
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600');
    
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: headers,
    });

  } catch (error: any) {
    console.error('[IMAGE PROXY ERROR]', error);
    // Handle potential fetch errors (network issues, timeouts if implemented)
    if (error.name === 'AbortError') {
        return new NextResponse('Image fetch timed out', { status: 504 }); // Gateway Timeout
    }
    return new NextResponse('Error fetching image from source', { status: 500 });
  }
} 