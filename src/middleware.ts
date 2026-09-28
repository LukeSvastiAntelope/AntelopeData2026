import { NextRequest, NextResponse } from 'next/server'
import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'
import {
  isAppHost,
  normalizeHost,
  slugFromPlatformSubdomain,
} from '@/app/utils/site-host'
import { isSuperAdminEmail } from '@/app/utils/auth/super-admin'
import {
  SUPPORT_COOKIE,
  SUPPORT_CTX_COOKIE,
  verifySupportCtx,
} from '@/app/utils/auth/support-ctx-cookie'

/** Paths allowed to mutate while a read-only support session is active. */
function isSupportMutationAllowlisted(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p.startsWith('/api/admin/support')) return true
  if (p === '/api/support/session') return true
  if (p.startsWith('/api/auth')) return true
  if (p === '/api/signin' || p === '/api/signout') return true
  return false
}

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
    '/api/public/site-media/:slug*', // Storage V2 — public site images (local/CDN proxy)
    '/api/public/walk/:slug*', // MiniVAN M2 — canvasser walk pull + sync (token-scoped)
    '/api/public/live/:slug*', // Live L2 — public join + participant actions
    '/api/public/live/linkedin/start',
    '/api/public/live/linkedin/callback',
    '/api/image-proxy',
    '/api/scheduler/init', // Scheduler initialization
    // NOTE: /api/admin/* must NEVER be public — requireSuperAdmin on every handler.
    '/api/agents/query', // Public agent querying
    '/api/digital-twin/:id*/responses', // Twin responses list
    '/api/digital-twin/:id*/update', // Update twin
    '/api/digital-twin/:id*', // Public digital twin profile
    '/api/digital-twin/check-email', // Check for existing digital twin by email
    '/api/digital-twin/magic-link', // Send magic link for digital twin access
    '/api/surveys/cron/close-expired', // Cron job to close expired surveys
    '/api/cron/loop-propose', // H2 loop proposer platform cron
    '/api/cron/autotrigger-poll', // AT1 survey auto-trigger backstop
    '/api/cron/volunteer-reminders', // Volunteer V3 — gated shift reminders + check-in prompts
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
    // Volunteer V1 — passwordless portal auth (magic-link verify is client-side NextAuth)
    '/api/portal/session',
    // Volunteer V2 — public self-signup by org slug
    '/api/public/volunteer-signup/:slug*',
    // Automation for Garry's List — the whole flow is explicitly "no log in required".
    '/api/garrys-list/parse',
    '/api/garrys-list/generate',
    '/api/garrys-list/answer',
    '/api/garrys-list/results',
    '/api/garrys-list/survey',
    // Candidate website public render (Sites S2) — live-on-publish at /s/<slug>
    '/s/:slug*',
    // MiniVAN M2 — canvasser walk PWA (scoped token, no login)
    '/walk/:slug*',
    // Live L2 — audience join on phone (no login)
    '/live/:slug*',
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
    // MiniVAN walk PWA — token in path; no session
    const isPublicWalkRoute = path === '/walk' || path.startsWith('/walk/');
    // Live audience join — code in path; no session
    const isPublicLiveRoute = path === '/live' || path.startsWith('/live/');
    // Volunteer portal auth pages (magic-link verify / join) — no session yet
    const isPortalAuthRoute =
        path === '/portal/auth' ||
        path.startsWith('/portal/auth/') ||
        path === '/portal/join';
    // Volunteer V2 — public self-signup pages
    const isPublicVolunteerJoin =
        path === '/join' || path.startsWith('/join/');

    // Allow public routes
    if (
        isPublicApiRoute ||
        isGetPredictionApiRoute ||
        isPublicSiteRoute ||
        isPublicWalkRoute ||
        isPublicLiveRoute ||
        isPortalAuthRoute ||
        isPublicVolunteerJoin
    ) {
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
        const orgRole = (session.user as any)?.orgRole as string | null;
        if (orgRole === 'volunteer' || orgRole === 'captain') {
            return NextResponse.redirect(new URL('/portal', req.url));
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

        // Platform super-admin APIs — email allowlist at the edge (handlers re-check)
        if (path.startsWith('/api/admin')) {
            if (!isSuperAdminEmail(session.user?.email)) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
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
        // Volunteer V1 — role + org on headers for API routes (also in JWT)
        const orgRole = (session.user as any)?.orgRole;
        const organizationId = (session.user as any)?.organizationId;
        const personRecordId = (session.user as any)?.personRecordId;
        if (orgRole) requestHeaders.set('x-org-role', String(orgRole));
        if (organizationId != null) {
            requestHeaders.set('x-organization-id', String(organizationId));
        }
        if (personRecordId != null) {
            requestHeaders.set('x-person-record-id', String(personRecordId));
        }

        // Admin A4 — support "view as" overlay (signed ctx cookie; DB is source of truth)
        const supportSid = req.cookies.get(SUPPORT_COOKIE)?.value || '';
        const supportCtx = await verifySupportCtx(
          req.cookies.get(SUPPORT_CTX_COOKIE)?.value
        );
        if (
          supportCtx &&
          supportSid &&
          supportCtx.sid === supportSid &&
          isSuperAdminEmail(session.user?.email)
        ) {
          requestHeaders.set('x-support-session-id', supportCtx.sid);
          requestHeaders.set('x-support-org-id', String(supportCtx.orgId));
          requestHeaders.set('x-support-mode', supportCtx.mode);
          if (supportCtx.orgName) {
            requestHeaders.set(
              'x-support-org-name',
              encodeURIComponent(supportCtx.orgName)
            );
          }
          // Prefer support org for downstream org-scoped reads
          requestHeaders.set('x-organization-id', String(supportCtx.orgId));
          requestHeaders.set(
            'x-org-role',
            supportCtx.mode === 'write' ? 'admin' : 'viewer'
          );

          // Read-first: block mutating verbs at the edge (handlers re-check DB)
          const method = req.method.toUpperCase();
          if (
            supportCtx.mode === 'read' &&
            !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
            !isSupportMutationAllowlisted(path)
          ) {
            return NextResponse.json(
              {
                status: false,
                error: 'Forbidden',
                message:
                  'Support session is read-only. End the session or start write mode (audited) to make changes.',
              },
              { status: 403 }
            );
          }
        }

        return NextResponse.next({
            request: {
                headers: requestHeaders,
            },
        });
    }

    const orgRole = (session?.user as any)?.orgRole as string | null | undefined;
    const isPortalUser = orgRole === 'volunteer' || orgRole === 'captain';
    const isStaffUser =
        orgRole === 'owner' ||
        orgRole === 'admin' ||
        orgRole === 'analyst' ||
        orgRole === 'viewer';

    // Volunteer portal — auth required; staff bounced to the heavyweight app
    if (path === '/portal' || path.startsWith('/portal/')) {
        if (!session) {
            return NextResponse.redirect(new URL('/portal/join', req.url));
        }
        if (isStaffUser) {
            return NextResponse.redirect(new URL('/surveys', req.url));
        }
        return NextResponse.next();
    }

    // Platform super-admin UI — email-pinned allowlist (not users.role)
    if (path === '/admin' || path.startsWith('/admin/')) {
        if (!session) {
            return NextResponse.redirect(new URL('/auth/login', req.url));
        }
        if (!isSuperAdminEmail(session.user?.email)) {
            return NextResponse.redirect(new URL('/', req.url));
        }
        return NextResponse.next();
    }

    // Protect pages that require authentication (prefix match)
    const protectedPages = [
        '/cohort-chat',
        '/cohort-chat/chat',
        '/surveys',
        '/create',
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
        '/volunteers',
        '/agents',
        '/spread',
        '/outbound',
        '/targeting',
        '/website',
        '/turf',
        '/assignments',
        '/payroll',
        '/live-sessions',
        // NOTE: '/blog', '/clients', '/about', '/pricing', '/contact' were moved
        // out of the (secure) route group to the public site — they are real
        // marketing pages and must be reachable without a session.
    ];
    if (protectedPages.some(page => path.startsWith(page))) {
        if (!session) {
            return NextResponse.redirect(new URL('/auth/login', req.url));
        }
        // Volunteers stay in the lightweight portal — never the staff app
        if (isPortalUser) {
            return NextResponse.redirect(new URL('/portal', req.url));
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
