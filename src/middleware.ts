import { verifyConfirmationToken } from '@/app/utils/api/token';
import { NextRequest, NextResponse } from 'next/server'

const publicRoutes = [
    '/api/signin',
    '/api/signup',
    '/api/verify',
    '/api/createAgentBet',
    '/api/stripeWebhookCheckout',
    '/api/forgotPassword',
    '/api/resetPassword',
    '/api/resetLink',
    '/api/resetPassword',
    '/api/auth/providers',
    '/api/auth/callback/discord',
    '/api/auth/session',
    '/api/auth/signin',
    '/api/auth/signin/discord',
    '/api/auth/csrf',
    '/api/auth/providers',
    '/api/generateAgentProfile',
    '/api/generateAgentAvatar',
    '/api/getRecentActivity',
    '/api/public/bet/:id*',
    '/api/public/prediction/:id*',
    '/api/getPublicMarketStats',
]

export default async function middleware(req: NextRequest) {
    const path = req.nextUrl.pathname;
    console.log(`[Middleware] Received request for path: ${path}`);

    const isPublicApiRoute = publicRoutes.some(route => {
        if (route.endsWith(':id*')) {
            const baseRoute = route.substring(0, route.length - ':id*'.length);
            const regex = new RegExp(`^${baseRoute}[^/]+/?$`);
            const match = regex.test(path);
            // console.log(`[Middleware] Wildcard test: Path="${path}", Route="${route}", Regex="${regex.source}", Match=${match}`);
            return match;
        }
        const match = path === route;
        // console.log(`[Middleware] Exact test: Path="${path}", Route="${route}", Match=${match}`);
        return match;
    });
    console.log(`[Middleware] Path: "${path}", isPublicApiRoute: ${isPublicApiRoute}`);

    // This route is for fetching prediction details by ID, also public (though potentially an older pattern)
    const isGetPredictionApiRoute = path.startsWith('/api/getPrediction/');
    console.log(`[Middleware] Path: "${path}", isGetPredictionApiRoute: ${isGetPredictionApiRoute}`);


    if (isPublicApiRoute) {
        console.log(`[Middleware] Path: "${path}" - Matched publicRoutes. Bypassing auth.`);
        return NextResponse.next();
    }
    if (isGetPredictionApiRoute) {
        console.log(`[Middleware] Path: "${path}" - Matched isGetPredictionApiRoute. Bypassing auth.`);
        return NextResponse.next();
    }

    console.log(`[Middleware] Path: "${path}" - Not a public API route by initial checks. Proceeding to auth logic.`);
    const authHeader = req.headers.get('authorization');

    // If it's a public API route (like /api/getRecentActivity or /api/getPrediction/*), let it pass.
    if (isPublicApiRoute || isGetPredictionApiRoute) {
        return NextResponse.next();
    }

    // For other routes (non-API pages or protected API routes)
    // If there's an authorization header and the user is trying to access a non-API public page (e.g. /login page itself while logged in)
    // this part of the logic might need refinement based on exact UX requirements for page navigations.
    // The current primary goal is to fix API calls for logged-in users.

    // If it's not a public API route and user is authenticated trying to access a generic public page (e.g. /login), redirect them.
    // This check should ideally be more specific to page routes, not API routes.
    // For now, the critical part is that public API routes are handled above.
    if (authHeader && !path.startsWith('/api/')) { // A simple check if it's not an API path
        const token = authHeader.split(' ')[1];
        if (token) {
            const isAuthenticated = await verifyConfirmationToken(token);
            if (isAuthenticated) {
                // Only redirect if it's not an API call and the user is authenticated
                // and trying to access a route that should trigger a redirect (e.g. /login, /register when already logged in)
                // This part may need to be more granular based on which non-API public pages should redirect.
                if (path === '/login' || path === '/register') { // Example: redirect from login/register if already logged in
                    const dashboardUrl = new URL('/dashboard', req.url);
                    return NextResponse.redirect(dashboardUrl);
                }
            }
        }
    }

    // For secure API routes (not in publicRoutes and starts with /api)
    if (path.startsWith('/api/') && !isPublicApiRoute && !isGetPredictionApiRoute) {
        console.log(`[Middleware] Path: "${path}" - Entering secure API route authentication.`);
        if (!authHeader) {
            console.log(`[Middleware] Path: "${path}" - No Authorization header. Returning 401.`);
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const tokenParts = authHeader.split(' ');
        if (tokenParts.length !== 2 || tokenParts[0].toLowerCase() !== 'bearer') {
            console.error(`[Middleware] Path: "${path}" - Invalid Authorization header format. Header: "${authHeader}"`);
            return NextResponse.json({ error: 'Invalid Authorization header format' }, { status: 401 });
        }
        const token = tokenParts[1];

        if (!token || typeof token !== 'string' || token === 'undefined' || token === 'null' || token.trim() === '') {
            console.error(`[Middleware] Path: "${path}" - Invalid or malformed token in Authorization header. Token: '${token}'`);
            return NextResponse.json({ error: 'Malformed token' }, { status: 401 });
        }
        
        console.log(`[Middleware] Path: "${path}" - Attempting to verify token.`);
        const isAuthenticated = await verifyConfirmationToken(token);
        if (!isAuthenticated) {
            console.log(`[Middleware] Path: "${path}" - Token verification failed. Returning 401.`);
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }
        console.log(`[Middleware] Path: "${path}" - Token verified successfully.`);

        if (path.startsWith('/api/admin')) {
            const userData = isAuthenticated; // Assuming verifyConfirmationToken returns user data object with role
            if (!userData || typeof userData === 'boolean' || !userData.role || userData.role !== 'admin') {
                console.log(`[Middleware] Path: "${path}" - Admin route, but user is not admin or userData is invalid. UserData:`, userData);
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
            console.log(`[Middleware] Path: "${path}" - Admin route, user is admin.`);
        }
    }
    
    console.log(`[Middleware] Path: "${path}" - Defaulting to NextResponse.next().`);
    return NextResponse.next();
}

// This applies middleware to all routes that start with `/api`
export const config = {
    matcher: ['/api/:path*'],
};