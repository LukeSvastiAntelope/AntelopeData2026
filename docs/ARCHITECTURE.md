# Application Architecture

## Overview
This document details how the Market Maker Agent application is organized and how different parts of the system collaborate. The application is built on Next.js (using the latest App Router) and leverages multiple frameworks and libraries for an end-to-end solution:

• React for rendering UI.  
• Tailwind CSS and NextUI for styling and component frameworks.  
• MySQL (and occasionally SQLite) for data persistence.  
• JSON Web Token (JWT) based authentication.

## Main Components

- **Frontend (Next.js + React)**  
  • The code resides in the "app" folder, using Next.js' new file-based routing conventions.  
  • We have grouped folders "(auth)" and "(secure)" within "app" to structure public (unauthenticated) versus protected (authenticated) routes:  
    - (auth): Contains pages like login, register, and account verification.  
    - (secure): Houses pages for profiles, bets, predictions, payments, markets, dashboards, strategies (including edit basic strategy, risk strategy, and principle management), and more; it enforces authentication through a SecureLayout.  
  • New pages in (secure) include: dashboard, predictions, payment, bets, markets, about, strategy (and its subpages like editBasicStrategy, editRiskStrategy, and editPrinciples), and logout.  
  • Global styles are implemented through Tailwind CSS (see globals.css). NextUI and custom components (e.g., from @heroui) are used to provide styled components like Cards, Buttons, Modals, and Skeletons for loading states.

- **Backend (API Routes)**  
  • The "src/app/api" folder defines serverless functions that handle the backend logic for interacting with the database and external APIs.  
  • Examples include:
    - saveAgentProfile: Handles user profile updates.
    - saveNftAddress: Persists minted NFT addresses to the database.
    - verify: Verifies user registration tokens.
    - stripeWebhookCheckout: Manages Stripe webhook events for credits purchase.
    - createAgentBet: Creates a new bet for the agent.
    - createAgentPrediction: Creates a new prediction.
    - updateBettingStatus: Updates an agent's active betting status.
    - **updateAgentStrategy**: Receives updated agent strategy data (including principles and interests) and persists them via a repository.
  • Each API route parses the request input (JSON, form data, etc.), validates tokens, queries or updates the database, and returns appropriate JSON responses.

- **Database**  
  • The code references a UserRepo that is used to read and write user- or agent-related data stored in MySQL.  
  • Connection and repository logic are found under "utils/database".  
  • Additional data structures, such as "predictions", "bets", and agent strategies, are stored similarly.

- **Authentication**  
  • Implements JWT-based authentication.  
  • On the frontend, tokens are stored in localStorage and used to gate access to secure routes.  
  • On the backend, tokens are validated in serverless functions before any sensitive actions occur.

## Component Interaction

• Frontend pages in both the "(auth)" and "(secure)" folders communicate with serverless API routes for data retrieval and updates.  
• Application-level providers (e.g., mainProvider.tsx for theming and solProvider.tsx for Solana wallet integration) wrap the app to offer shared functionality and state management.  
• Components for editing agent profiles, strategies (basic and risk-related), and principles allow users to customize their agent's behavior and then trigger related API routes (like updateAgentStrategy) to update the database.

## Technology Stack

- Next.js 14+ with the App Router  
- React 18  
- Tailwind CSS for utility-first styling  
- NextUI and @heroui component libraries for UI components  
- MySQL / SQLite for persistent storage  
- Stripe for payment and credit management  
- Solana's wallet-adapter + Metaplex libraries for NFTs  
- JWT for authentication  
- Node.js environment for serverless functions

## Design Patterns

- **File-based Routing and Folder-based Organization**: Each domain segment (auth, secure, etc.) is organized into dedicated folders, making it easier to manage public and protected routes.
- **Provider Pattern**: Custom providers (e.g., NextUIProvider, mainProvider.tsx, solProvider.tsx) handle theming, state management, and Solana integration.
- **Repository Pattern**: The UserRepo abstracts database interactions to enhance code maintainability and enable easier testing.
- **Component Composition**: New pages like editBasicStrategy, editRiskStrategy, and editPrinciples leverage modular components (such as EditablePrincipleCard) to provide a consistent design and functionality across the platform.

## Future Updates

- Continue updating sub-sections to include any new pages and routes (for example, if an "(admin)" folder is introduced).  
- Expand on system diagrams to illustrate detailed data flows around payment, NFT minting, and external API integrations.  
- Keep this document synchronized with backend changes (both database schema and new endpoints).

## New Components and Routes

- **Frontend**:  
  - Added new pages under the "(secure)" folder such as dashboard, predictions, payment, bets, markets, about, strategy (with edit pages), and logout.  
  - Integrated new components for editing agent profiles, strategies (basic and risk), and betting principles to enhance agent customization.
  
- **Backend**:  
  - Introduced additional API routes such as createAgentBet, createAgentPrediction, stripeWebhookCheckout, stripeCheckout, and updateAgentStrategy, which together enable a full-featured agent management system.

## Updated Technology Stack

- New dependencies and upgrades have been added in package.json (for example, upgraded React, NextUI, and additional libraries for NFT integration and enhanced API handling).

## Utilities

- Updated utility functions (e.g., in api/predictionGenerator.ts and api/automaticBetting.ts) have been optimized for improved prediction and betting capabilities.

This architecture overview should serve as a reference for how the pieces of the application fit together and how best to navigate the code to extend or modify features. 