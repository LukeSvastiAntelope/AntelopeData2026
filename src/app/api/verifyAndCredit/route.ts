import { UserRepo } from "@/app/utils/database/user-repo";
import { clusterApiUrl, Connection } from "@solana/web3.js";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
    const { paymentId, signature } = await request.json();
    try {
        const paymentIntent = await UserRepo.getPaymentIntent(paymentId);
        if (!paymentIntent || paymentIntent.status != 'pending' || new Date(paymentIntent.expires_at) < new Date()) {
            return Response.json({ status: false, message: "Invalid or expired payment intent" });
        }

        const connection = new Connection(process.env.ENVIRONMENT_MODE == "dev" ? clusterApiUrl("devnet") : clusterApiUrl("mainnet-beta"));

        // Add retry logic for getting the transaction
        let tx = null;
        let attempts = 0;
        const maxAttempts = 10;
        const delayMs = 1000; // 1 second delay between attempts

        while (!tx && attempts < maxAttempts) {
            tx = await connection.getParsedTransaction(signature);

            if (!tx) {
                attempts++;
                if (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            } else {
                break;
            }
        }

        if (!tx) {
            throw new Error('Transaction not found after multiple attempts');
        }

        if (!tx || tx.meta?.err) {
            throw new Error('Invalid transaction');
        }

        const memoLog = tx.meta?.logMessages?.find(log => log.includes('Memo (len 36):'));
        const extractedPaymentId = memoLog?.match(/"([^"]+)"/)?.[1];

        if (!extractedPaymentId || extractedPaymentId !== paymentId) {
            throw new Error('Payment ID mismatch');
        }

        if (tx.transaction.message.accountKeys[0].pubkey.toString() !== paymentIntent.from_address) {
            throw new Error('Sender address mismatch');
        }

        await UserRepo.updateUserBalance(paymentIntent.user_id, paymentIntent.credit_amount);
        await UserRepo.updatePaymentIntent(paymentId, 'completed');
        return Response.json({ status: true, message: "Credits purchased successfully" });
    } catch (error: unknown) {
        console.log(error);
        await UserRepo.updatePaymentIntent(paymentId, 'failed');
        return Response.json({status: false, message: error instanceof Error ? error.message : 'Internal server error'})
    }
}