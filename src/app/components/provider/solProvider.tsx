"use client";

import { useMemo, useEffect } from "react";
import {
    ConnectionProvider,
    WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { clusterApiUrl } from "@solana/web3.js";
import {
    // LedgerWalletAdapter,
    SolflareWalletAdapter,
    MathWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { applySolanaWalletStyles } from "./solana-wallet-styles";

export function SolProvider({ children }: { children: React.ReactNode }) {
    const network = WalletAdapterNetwork.Devnet;
    const endpoint = useMemo(() => clusterApiUrl(network), [network]);

    const wallets = useMemo(
        () => [
            new SolflareWalletAdapter(),
            // new LedgerWalletAdapter(),
            new MathWalletAdapter(),
        ],
        []
    );

    useEffect(() => {
        applySolanaWalletStyles();
    }, []);

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    {children}
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}