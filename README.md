This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Project structure

- `docs/` – Documentation (plans, setup guides, architecture, database schemas)
- `reference/` – Reference materials (fonts, sample data, media)
- `scripts/` – Build/import scripts; `scripts/legacy/` for one-off maintenance scripts
- `migrations/` – Database migrations

## Setup

### Prerequisites

- **Node.js** 18+
- **MySQL** 8.x — create a database for the app (e.g. `marketmaker`)
- **Yarn** (or use corepack: `corepack enable` then `yarn`)

### 1. Install dependencies

```bash
yarn install
```

### 2. Environment variables

Copy the example env file and set the required variables:

```bash
cp .env.example .env.local
```

Edit `.env.local`. **Required:**

- **`AUTH_SECRET`** — NextAuth secret (e.g. `openssl rand -base64 32`)
- **`JWT_SECRET_KEY`** — JWT secret (e.g. `openssl rand -base64 32`)
- **`MYSQL_HOST`**, **`MYSQL_PORT`**, **`MYSQL_USER`**, **`MYSQL_PASSWORD`**, **`MYSQL_DATABASE`**
- **`NEXT_PUBLIC_APP_URL`** / **`PUBLIC_BASE_URL`** — e.g. `http://localhost:3000`

For predictions and agent features you’ll also need **`OPENAI_API_KEY`** and **`PINECONE_API_KEY`**. See `.env.example` for all optional vars (Stripe, Telegram, SendGrid, etc.).

### 3. Database

Create the MySQL database, then run migrations in date order from `migrations/`. The script loads `dotenv` from the project root (`.env` or `.env.local` if you symlink or copy vars into `.env` for the script):

```bash
node scripts/run-migration.js 20240614_create_cohorts_table.sql
```

Run other migration files in chronological order as needed.

### 4. Run the dev server

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Optional: scheduler

With the app running, to register the daily bet analysis cron:

```bash
yarn run init-scheduler
```

## Getting Started

After setup, run the development server:

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
