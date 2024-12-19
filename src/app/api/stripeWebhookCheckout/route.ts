import Stripe from 'stripe';
import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { UserRepo } from "@/app/utils/database/user-repo";

type METADATA = {
    userId: string;
};
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const credit_balance = Number(process.env.CREDIT_BALANCE) || 1e6;

export async function POST(request: NextRequest) {
    console.log("stripe checkout confirm");
    const body = await request.text();
    const endpointSecret = process.env.STRIPE_SECRET_WEBHOOK_KEY!;
    const sig = headers().get('stripe-signature') as string;
    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
    } catch (err) {
        return new Response(`Webhook Error: ${err}`, {
            status: 400
        });
    }

    const eventType = event.type;
    if (
        eventType !== 'checkout.session.completed' &&
        eventType !== 'checkout.session.async_payment_succeeded'
    )
        return new Response('checkout not success', {
            status: 500
        });

    try {
        const data = event.data.object;
        const metadata = data.metadata as METADATA;
        const userId = metadata.userId;
        const amount = data.amount_total;
        console.log(userId, amount);
        const agent = await UserRepo.getAgentByUserId(userId);
        await UserRepo.updateAgentBalance(agent.id, Number(amount) * credit_balance / 100);
        // database update here
        return new Response('Virtual Credits added', {
            status: 200
        });
    } catch (error) {
        console.log(error);
        return new Response('Server error', {
            status: 500
        });
    }
}