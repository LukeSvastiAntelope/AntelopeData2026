import { NextRequest, NextResponse } from 'next/server'
import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'

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
    '/api/channels/telegram/webhook', // Telegram webhook must be public
    // Local testing: allow direct access to Google Sheets import endpoints;
    // the handlers themselves still require 'x-user-id' header.
    '/api/surveys/import/google-sheets',
    // '/api/cohorts',           // (was public during early dev; now requires auth)
    // '/api/cohort/query',      // (was public during v1 testing; now requires auth)
    '/api/public/surveys', // List surveys
    '/api/public/district-brief', // Public district snapshot for campaign action kit
]

// Use an edge-safe config to create an auth middleware wrapper.
// Ensure providers is always an array (middleware cannot load Node-only providers).
const { auth } = NextAuth({
    ...authConfig,
    providers: authConfig.providers || [],
})

export default auth((req) => {
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

    // Allow public routes
    if (isPublicApiRoute || isGetPredictionApiRoute) {
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

    // Protect API routes that require authentication
    if (path.startsWith('/api/') && !isPublicApiRoute && !isGetPredictionApiRoute) {
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
        '/auth',
        '/team',
        '/reports',
        '/python-analysis',
        '/channels',
        '/voter-file',
        '/dashboard',
        '/fundraising',
        '/blog',
        '/clients',
        '/compliance',
        '/volunteer-staff',
        '/about',
        '/pricing',
        '/contact',
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
        // Match all API routes and protected pages (must cover every path in protectedPages)
        '/api/:path*',
        '/cohort-chat/:path*',
        '/surveys/:path*',
        '/create/:path*',
        '/admin/:path*',
        '/digital-twins/:path*',
        '/profile/:path*',
        '/auth/:path*',
        '/voter-file/:path*',
        '/team/:path*',
        '/reports/:path*',
        '/python-analysis/:path*',
        '/channels/:path*',
        '/dashboard/:path*',
        '/fundraising/:path*',
        '/blog/:path*',
        '/clients/:path*',
        '/compliance/:path*',
        '/volunteer-staff/:path*',
        '/about/:path*',
        '/pricing/:path*',
        '/contact/:path*',
        '/logout'
    ],
};