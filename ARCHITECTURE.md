# Application Architecture

## Overview
This document details how the Market Maker Agent application is organized and how different parts of the system collaborate. The application is built on Next.js (using the latest App Router) and leverages multiple frameworks and libraries for an end-to-end solution:
• React for rendering UI.
• Tailwind CSS and NextUI for styling and component frameworks.
• MySQL (and occasionally SQLite) for data persistence.
• JSON Web Token (JWT) based authentication.

## Main Components

- **Frontend (Next.js + React)**  
  • The code resides in the "app" folder, using Next.js’ new file-based routing conventions.  
  • We have grouped folders "(auth)" and "(secure)" within "app" to structure public (unauthenticated) versus protected (authenticated) routes:
    - (auth): Contains pages like login, register, and account verification.  
    - (secure): Houses pages for profiles, bets, predictions, and payments, enforcing authentication through a SecureLayout.  
  • Global styles are implemented through Tailwind CSS (see globals.css). NextUI is used to provide common styled components like Cards, Buttons, and Modals.

- **Backend (API Routes)**  
  • The "src/app/api" folder defines serverless functions, handling all backend logic for interacting with the database and external APIs.  
  • Examples include:
    - saveAgentProfile: Handles user profile updates.  
    - saveNftAddress: Persists minted NFT addresses to the database.  
    - verify: Verifies user registration tokens.  
    - stripeWebhookCheckout: Manages Stripe webhook events for credits purchase.  
  • Each API route can read data from request or form data, authenticate token usage, query or update the database, and return JSON responses.

- **Database**  
  • The code references a UserRepo that is used to read and write user- or agent-related data against MySQL.  
  • The connection and user-repo logic are found under "utils/database".  
  • Additional data structures, such as “predictions” and “bets,” are stored in a similar manner (not fully shown here).

- **Authentication**  
  • Implements JWT-based authentication.  
  • On the frontend, tokens are stored in localStorage. If no token is found, secure routes redirect to the login page.  
  • On the backend, tokens are validated in serverless functions (using “verifyConfirmationToken”).

## Component Interaction
• The UI (in the “(auth)” subfolders for public pages, “(secure)” subfolders for protected pages, plus shared layouts) communicates with serverless API routes for data retrieval and updates.  
• Providers (see “mainProvider.tsx”) wrap the application and handle theming, while “solProvider.tsx” helps with Solana wallet functionality for NFT minting.  
• The application is effectively separated into these distinct sets of concerns: storing data (DB + repo), serving data (API routes), and presenting data (frontend pages).

## Technology Stack
- Next.js 14+ with the App Router  
- React 18  
- Tailwind CSS for utility-first styling  
- NextUI for component library  
- MySQL / SQLite for persistent storage  
- Stripe for payment and credit management  
- Solana’s wallet-adapter + Metaplex libraries for NFTs  
- JWT for authentication  
- Node.js environment for running Next.js serverless functions

## Design Patterns
- **File-based Routing and Folder-based Organization**: Each domain segment (auth, secure, etc.) is separated into folders.  
- **Provider Pattern**: NextUI’s NextUIProvider and custom providers handle theming and Solana integration.  
- **Repository Pattern**: A “UserRepo” abstracts database interactions, improving code maintainability and testability.

## Future Updates
- Continue updating sub-sections with any new pages and routes (e.g., if a new “(admin)” folder is introduced).  
- Expand on system diagrams for a more visual understanding, especially around payment flows, NFT minting, and external APIs.  
- Keep this document in sync with backend changes (both database schema and new endpoints).  

This architecture overview should serve as a reference for how the pieces of the application fit together and how best to navigate the code to extend or modify features. 

## New Components and Routes

- **Frontend**: Added new pages in the `(secure)` folder such as `dashboard`, `predictions`, `payment`, `bets`, `markets`, `about`, `strategy`, and `logout`.
- **Backend**: Introduced new API routes like `createAgentBet`, `createAgentPrediction`, `stripeWebhookCheckout`, and `stripeCheckout`.

## Updated Technology Stack

- Added new dependencies in `package.json` for enhanced functionality and integration.

## Utilities

- Updated utility functions in `api/predictionGenerator.ts` and `api/automaticBetting.ts` for improved prediction and betting capabilities. 