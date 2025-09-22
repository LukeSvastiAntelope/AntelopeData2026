/** @type {import('next').NextConfig} */
import path from 'path';
const nextConfig = {
    eslint: {
        // Prevent ESLint warnings from failing CI builds
        ignoreDuringBuilds: true,
    },
    env: {
        PINATA_JWT: process.env.PINATA_JWT,
        PINATA_GATEWAY: process.env.PINATA_GATEWAY,
        ESCROW_SOLANA_ADDRESS: process.env.ESCROW_SOLANA_ADDRESS,
        ENV_MODE: process.env.ENVIRONMENT_MODE,
        STRIPE_PUBLIC_KEY: process.env.STRIPE_PUBLIC_KEY,
        CREDIT_BALANCE: process.env.CREDIT_BALANCE,
    },
    allowedDevOrigins: [
        '*.ngrok.app',
        '*.ngrok.io',
        '*.ngrok-free.app'
    ],
    experimental: {
        optimizePackageImports: ['@heroui/react', '@nextui-org/react'],
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
            },
            {
                protocol: 'https',
                hostname: 'www.aljazeera.com',
            }
        ],
        dangerouslyAllowSVG: true,
        contentDispositionType: 'attachment',
        contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    },
    webpack: (config, { dev }) => {
        // Existing rule for Wallet Adapter CSS
        config.module.rules.push({
            test: /node_modules\/@solana\/wallet-adapter-react-ui\/styles\.css$/,
            type: 'asset/source',
        });

        // Provide default export shim for csv-parse to satisfy @irys/sdk
        config.resolve = config.resolve || {};
        config.resolve.alias = {
            ...(config.resolve.alias || {}),
            // Using process.cwd() because __dirname is not available in ESM config
            'csv-parse': path.resolve(process.cwd(), 'src/patches/csv-parse-default.js'),
        };

        // Minimal dev optimizations - too much breaks file discovery
        if (dev) {
            // Basic file watching without breaking Next.js file discovery
            config.watchOptions = {
                poll: 1000,
                aggregateTimeout: 300,
                ignored: [
                    '**/node_modules/**',
                    '**/.git/**',
                    '**/*.mp4',
                    '**/*.zip',
                    '**/*.pkg'
                ]
            }
        }

        return config;
    },
};

export default nextConfig;
