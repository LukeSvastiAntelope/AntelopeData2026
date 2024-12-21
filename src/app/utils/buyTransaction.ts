import { WalletContextState } from "@solana/wallet-adapter-react";
import { Connection, TransactionInstruction } from "@solana/web3.js";
import { Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createTransferInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const buyTransaction = async (
    wallet: WalletContextState,
    connection: Connection,
    amount: number,
    paymentType: string,
    paymentId: string
) => {
    if (!wallet.publicKey) {
        throw new Error("Pls connect wallet");
    }

    const escrowAddress = process.env.ESCROW_SOLANA_ADDRESS || "";
    const escrowPublic = new PublicKey(escrowAddress);
    const solanaUSDT = process.env.ENV_MODE == "dev" ? "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr" : "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
    const memoProgram = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
    const memoInstruction = new TransactionInstruction({
        keys: [],
        programId: memoProgram,
        data: Buffer.from(paymentId)
    });

    const transaction = new Transaction();
    if (paymentType == "sol") {
        transaction.add(
            SystemProgram.transfer({
                fromPubkey: wallet.publicKey,
                toPubkey: escrowPublic,
                lamports: BigInt(Math.round(amount * LAMPORTS_PER_SOL)),
            }),
            memoInstruction
        );
    } else {
        const USDT_pubkey = new PublicKey(solanaUSDT);
        const addSenderToAcct = await getAssociatedTokenAddressSync(
            USDT_pubkey,
            wallet.publicKey,
            false,
            TOKEN_PROGRAM_ID
        );
        const addRecipientToAcct = await getAssociatedTokenAddressSync(
            USDT_pubkey,
            escrowPublic,
            false,
            TOKEN_PROGRAM_ID
        );
        transaction.add(
            createTransferInstruction(
                addSenderToAcct,
                addRecipientToAcct,
                wallet.publicKey,
                BigInt(Math.round(amount * 10e6)), // Adjust for decimals (e.g., 1 token with 6 decimals)
                [],
                TOKEN_PROGRAM_ID
            ),
            memoInstruction
        );
    }

    try {
        const signature = await wallet.sendTransaction(transaction, connection);
        const latestBlockHash = await connection.getLatestBlockhash();

        const confirmation = await connection.confirmTransaction({
            blockhash: latestBlockHash.blockhash,
            lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
            signature: signature,
        });

        if (confirmation.value.err) {
            throw new Error("Transaction failed to confirm");
        }

        return signature;
    } catch (error) {
        console.log(error);
        throw new Error("Transaction failed to confirm");
    }
}