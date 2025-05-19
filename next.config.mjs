/** @type {import('next').NextConfig} */
const nextConfig = {
    env: {
        PINATA_JWT: process.env.PINATA_JWT,
        PINATA_GATEWAY: process.env.PINATA_GATEWAY,
        ESCROW_SOLANA_ADDRESS: process.env.ESCROW_SOLANA_ADDRESS,
        ENV_MODE: process.env.ENVIRONMENT_MODE,
        STRIPE_PUBLIC_KEY: process.env.STRIPE_PUBLIC_KEY,
        CREDIT_BALANCE: process.env.CREDIT_BALANCE,
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'www.thesportsdb.com',
            },
            {
                protocol: 'https',
                hostname: 'gateway.pinata.cloud',
            },
            {
                protocol: 'https',
                hostname: 'api.dicebear.com',
            },
            {
                protocol: 'https',
                hostname: 'oaidalleapiprodscus.blob.core.windows.net',
            }
        ],
        dangerouslyAllowSVG: true,
        contentDispositionType: 'attachment',
        contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    },
};

export default nextConfig;
