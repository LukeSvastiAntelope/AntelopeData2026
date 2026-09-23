import { NextRequest, NextResponse } from 'next/server'
import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'
import {
  isAppHost,
  normalizeHost,
  slugFromPlatformSubdomain,
} from '@/app/utils/site-host'

const publicRoutes = [
    '/api/signin',
    '/api/signup',
    '/api/verify',
    '/api/stripeWebhookCheckout',
    '/api/forgotPassword',
    '/api/resetPassword',
    '/api/resetLink',
    '/api/resetPassword',
    '/api/auth/providers',
    '/api/auth/callback/discord',
    '/api/auth/callback/credentials',
    // '/api/auth/callback/google', // Commented out until Google OAuth is properly configured
    '/api/auth/session',
    '/api/auth/signin',
    '/api/auth/signout',
    '/api/auth/signin/discord',
    '/api/auth/signin/credentials',
    // '/api/auth/signin/google', // Commented out until Google OAuth is properly configured
    '/api/auth/csrf',
    '/api/generateAgentProfile',
    '/api/generateAgentAvatar',
    '/api/public/surveys/:slug*',
    '/api/public/site-domain', // Sites S6 — middleware custom-domain resolve
    '/api/image-proxy',
    '/api/scheduler/init', // Scheduler initialization
    '/api/admin/scheduler/stats', // Admin scheduler stats
    '/api/admin/scheduler/config', // Admin scheduler config
    '/api/admin/scheduler/trigger', // Admin manual trigger
    '/api/agents/query', // Public agent querying
    '/api/digital-twin/:id*/responses', // Twin responses list
    '/api/digital-twin/:id*/update', // Update twin
    '/api/digital-twin/:id*', // Public digital twin profile
    '/api/digital-twin/check-email', // Check for existing digital twin by email
    '/api/digital-twin/magic-link', // Send magic link for digital twin access
    '/api/surveys/cron/close-expired', // Cron job to close expired surveys
    '/api/cron/loop-propose', // H2 loop proposer platform cron
    '/api/cron/autotrigger-poll', // AT1 survey auto-trigger backstop
    '/api/channels/telegram/webhook', // Telegram webhook must be public
    '/api/webhooks/resend', // Resend delivery / bounce / complaint webhook
    '/api/email/unsubscribe', // CAN-SPAM one-click unsubscribe (public)
    // Local testing: allow direct access to Google Sheets import endpoints;
    // the handlers themselves still require 'x-user-id' header.
    '/api/surveys/import/google-sheets',
    // '/api/cohorts',           // (was public during early dev; now requires auth)
    // '/api/cohort/query',      // (was public during v1 testing; now requires auth)
    '/api/public/surveys', // List surveys
    '/api/public/district-brief', // Public district snapshot for campaign action kit
    '/api/optin', // Public SMS follow-up opt-in recording (reached from /optin page)
    '/api/contact', // Public contact form (works logged out; has its own rate limiting)
    '/api/volunteer', // Sites S5 — thin public volunteer capture (tenant via siteSlug)
    '/api/donate', // Sites S5 — fundraising intent capture (tenant via siteSlug)
    // Automation for Garry's List — the whole flow is explicitly "no log in required".
    '/api/garrys-list/parse',
    '/api/garrys-list/generate',
    '/api/garrys-list/answer',
    '/api/garrys-list/results',
    '/api/garrys-list/survey',
    // Candidate website public render (Sites S2) — live-on-publish at /s/<slug>
    '/s/:slug*',
]

// Use an edge-safe config to create an auth middleware wrapper.
// Ensure providers is always an array (middleware cannot load Node-only providers).
const { auth } = NextAuth({
    ...authConfig,
    providers: authConfig.providers || [],
})

/**
 * Sites S6 — rewrite tenant hosts to /s/<slug> without touching the dashboard host.
 * - Platform: {slug}.antelopedata.org → /s/{slug}/…
 * - Custom: verified host → lookup slug via /api/public/site-domain
 */
async function rewriteTenantHost(req: NextRequest): Promise<NextResponse | null> {
    const host = normalizeHost(req.headers.get('host'));
    if (!host || isAppHost(host)) return null;

    const path = req.nextUrl.pathname;

    // Pass through app infrastructure on tenant hosts (forms, assets, resolve API)
    if (
        path.startsWith('/api/') ||
        path.startsWith('/_next/') ||
        path.startsWith('/uploads/') ||
        path === '/favicon.ico'
    ) {
        return null;
    }

    // Already on the canonical path — don't double-prefix
    if (path === '/s' || path.startsWith('/s/')) {
        return null;
    }

    let slug = slugFromPlatformSubdomain(host);

    if (!slug) {
        // Custom domain — resolve via apex (never call tenant host → loop)
        try {
            const appBase =
                process.env.NEXT_PUBLIC_APP_URL ||
                process.env.AUTH_URL ||
                process.env.NEXTAUTH_URL ||
                '';
            if (!appBase) return null;
            const lookup = new URL('/api/public/site-domain', appBase);
            lookup.searchParams.set('host', host);
            const res = await fetch(lookup.toString(), {
                headers: { Accept: 'application/json' },
                next: { revalidate: 30 },
            } as RequestInit);
            if (!res.ok) return null;
            const data = (await res.json()) as { status?: boolean; slug?: string };
            if (!data?.status || !data.slug) return null;
            slug = data.slug;
        } catch {
            return null;
        }
    }

    if (!slug) return null;

    const url = req.nextUrl.clone();
    const suffix = path === '/' ? '' : path;
    url.pathname = `/s/${slug}${suffix}`;
    const rewrite = NextResponse.rewrite(url);
    rewrite.headers.set('x-site-slug', slug);
    rewrite.headers.set('x-site-host', host);
    return rewrite;
}

export default auth(async (req) => {
    const tenant = await rewriteTenantHost(req);
    if (tenant) return tenant;

    const path = req.nextUrl.pathname;
    const session = req.auth;

    const isPublicApiRoute = publicRoutes.some(route => {
        if (route.endsWith(':id*') || route.endsWith(':slug*')) {
            const baseRoute = route.substring(0, route.length - (route.endsWith(':id*') ? ':id*'.length : ':slug*'.length));
            const regex = new RegExp(`^${baseRoute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.+`);
            return regex.test(path);
        }
        return path === route;
    });

    const isGetPredictionApiRoute = path.startsWith('/api/getPrediction/');
    // Candidate campaign sites — always public (live-on-publish)
    const isPublicSiteRoute = path === '/s' || path.startsWith('/s/');

    // Allow public routes
    if (isPublicApiRoute || isGetPredictionApiRoute || isPublicSiteRoute) {
        return NextResponse.next();
    }

    // Allow logout page for all users (authenticated or not)
    if (path === '/logout') {
        return NextResponse.next();
    }

    // Redirect authenticated users away from login page (but not register page)
    if (session && path === '/auth/login') {
        // Check if this is a redirect from logout by looking at the referer
        const referer = req.headers.get('referer');
        if (referer && referer.includes('/logout')) {
            // Allow access to login if coming from logout
            return NextResponse.next();
        }
        return NextResponse.redirect(new URL('/surveys', req.url));
    }

    // Allow access to register page for all users (logged in or not)
    if (path === '/auth/register') {
        return NextResponse.next();
    }

    // Protect API routes + legacy /uploads compat (must inject x-user-id)
    if (
      (path.startsWith('/api/') || path.startsWith('/uploads/')) &&
      !isPublicApiRoute &&
      !isGetPredictionApiRoute
    ) {
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Add user info to headers for API routes
        const requestHeaders = new Headers(req.headers);
        console.log('Middleware session user:', {
            id: session.user?.id,
            email: session.user?.email,
            name: session.user?.name
        });
        requestHeaders.set('x-user-id', session.user?.id || '');
        requestHeaders.set('x-user-email', session.user?.email || '');
        // Note: User role is stored in the database, not in the session
        // For now, we'll let the API endpoints fetch the role from the database if needed
        
        return NextResponse.next({
            request: {
                headers: requestHeaders,
            },
        });
    }

    // Protect pages that require authentication (prefix match)
    const protectedPages = [
        '/cohort-chat',
        '/cohort-chat/chat',
        '/surveys',
        '/create',
        '/admin',
        '/digital-twins',
        '/profile',
        // NOTE: '/auth' is intentionally NOT protected — login/register/reset/verify
        // must be reachable without a session. Authenticated users are still
        // redirected away from /auth/login above. Adding '/auth' here causes an
        // infinite redirect loop (/auth/login -> /auth/login) for logged-out users.
        '/team',
        '/reports',
        '/python-analysis',
        '/channels',
        '/voter-file',
        '/dashboard',
        '/fundraising',
        '/compliance',
        '/volunteer-staff',
        '/agents',
        '/spread',
        '/outbound',
        '/targeting',
        '/website',
        // NOTE: '/blog', '/clients', '/about', '/pricing', '/contact' were moved
        // out of the (secure) route group to the public site — they are real
        // marketing pages and must be reachable without a session.
    ];
    if (protectedPages.some(page => path.startsWith(page))) {
        if (!session) {
            return NextResponse.redirect(new URL('/auth/login', req.url));
        }
    }

    return NextResponse.next();
})

export const config = {
    matcher: [
        /*
         * Match all request paths except static assets.
         * Sites S6 needs `/` on tenant hosts (subdomain / custom domain).
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
    ],
};
