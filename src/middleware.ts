import { verifyConfirmationToken } from '@/app/utils/api/token';
import { NextRequest, NextResponse } from 'next/server'

const publicRoutes = ['/api/signin', '/api/signup', '/api/verify', '/api/createAgentPrediction', '/api/createAgentBet', '/api/stripeWebhookCheckout']

export default async function middleware(req: NextRequest) {
    const path = req.nextUrl.pathname;
    const isPublicRoute = publicRoutes.includes(path);
    const authHeader = req.headers.get('authorization');
    
    if (isPublicRoute) {
        // If there's an authorization header, we can check if the user is authenticated
        if (authHeader) {
            const token = authHeader.split(' ')[1];
            const isAuthenticated = await verifyConfirmationToken(token);
            if (isAuthenticated) {
                // Redirect authenticated users to /dashboard (or any other desired route)
                return NextResponse.redirect('/dashboard'); // Change to your actual dashboard route
            }
        }
        // Allow access to public routes if no auth header is provided
        return NextResponse.next();
    }
    
    if (!authHeader) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const isAuthenticated = await verifyConfirmationToken(token);

    if (!isAuthenticated) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    return NextResponse.next()
}

// This applies middleware to all routes that start with `/api`
export const config = {
    matcher: ['/api/:path*'],
};