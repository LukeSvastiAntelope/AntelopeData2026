/** @type {import('next').NextConfig} */
const nextConfig = {
    env: {
        PINATA_JWT: process.env.PINATA_JWT,
        PINATA_GATEWAY: process.env.PINATA_GATEWAY,
        ESCROW_SOLANA_ADDRESS: process.env.ESCROW_SOLANA_ADDRESS,
        ESCROW_PRIVATE: process.env.ESCROW_SOLANA_PRIVATE,
        ENV_MODE: process.env.ENVIRONMENT_MODE,
        STRIPE_PUBLIC_KEY: process.env.STRIPE_PUBLIC_KEY,
        CREDIT_BALANCE: process.env.CREDIT_BALANCE,
        SPORTS_DB_API_KEY: process.env.SPORTS_DB_API_KEY
    },
    images: {
        domains: ['www.thesportsdb.com'],
    },
};

export default nextConfig;
