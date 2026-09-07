import { verifyConfirmationToken } from "@/app/utils/api/token";
import { NextRequest } from "next/server";
import Stripe from 'stripe';

function getStripeClient() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
        throw new Error('STRIPE_SECRET_KEY is missing');
    }
    return new Stripe(key);
}

export async function POST(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    try {
        const stripe = getStripeClient();
        const jwtPayload = await verifyConfirmationToken(token as string);
        if (!jwtPayload) {
            return Response.json({ error: 'Invalid token' }, { status: 401 });
        }
        const host = req.headers.get('origin');
        const userId = jwtPayload.email as string;
        const { amount } = await req.json();
        const checkoutSession: Stripe.Checkout.Session =
            await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: 'Virtual Credits',
                            },
                            unit_amount: amount * 100, // Assuming each credit is $1
                        },
                        quantity: 1
                    }
                ],
                mode: 'payment',
                success_url: `${host}/payment?success=true`,
                cancel_url: `${host}/payment?canceled=false`,
                metadata: {
                    userId
                }
            });
        return Response.json({ result: checkoutSession, status: true });
    } catch (error: unknown) {
        console.log(error);
        return Response.json({ status: false, message: error instanceof Error ? error.message : 'Unknown error occurred' });
    }
};