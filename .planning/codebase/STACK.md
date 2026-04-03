# Technology Stack

**Analysis Date:** 2026-04-03

## Languages

**Primary:**
- TypeScript 5.x - Both frontend and backend; strict mode enabled in frontend (`tsconfig.json`), relaxed mode in backend (`strict: false`)
- JavaScript (JSX/TSX) - React components, Next.js App Router pages

**Secondary:**
- JavaScript (CommonJS) - Backend output compiled from TypeScript

## Runtime

**Environment:**
- Node.js (backend); version unspecified in `.nvmrc` or `package.json`
- Browser (frontend) - ES2020 target

**Package Manager:**
- npm (inferred from `package.json` files)
- Lockfile: Not visible in repo (likely `package-lock.json` in each subdirectory)

## Frameworks

**Core Frontend:**
- Next.js 14.1.3 - App Router (not Pages Router); React 18; runs on port 3000

**Core Backend:**
- Express.js 4.21.2 - HTTP API server; port 3001
- TypeORM 0.3.28 - PostgreSQL ORM; entities in `backend/src/entities/`

**Real-time Communication:**
- Socket.IO 4.8.1 (both frontend and backend) - WebSocket events for live transcription and meeting updates
  - Frontend: `socket.io-client` v4.8.1 for client connections
  - Backend: `socket.io` v4.8.1 for server handling
- Stream.io Video React SDK 0.5.1 (frontend) - Video conferencing UI components
- Stream.io Node SDK 0.1.12 (backend) - Server-side token generation for Stream authentication

**UI & Styling:**
- Tailwind CSS 3.3.0 - Utility-first CSS framework
- PostCSS 8.x - CSS processing with Tailwind
- Autoprefixer 10.x - Vendor prefix handling
- class-variance-authority 0.7.0 - Component variant management
- clsx 2.1.0 - Conditional classname utility
- tailwind-merge 2.2.1 - Merge Tailwind classes
- tailwindcss-animate 1.0.7 - Tailwind animation utilities
- Radix UI - Headless UI components:
  - @radix-ui/react-dialog 1.0.5 - Modal dialogs
  - @radix-ui/react-dropdown-menu 2.0.6 - Dropdown menus
  - @radix-ui/react-popover 1.0.7 - Popover tooltips
  - @radix-ui/react-slot 1.0.2 - Component composition utility
  - @radix-ui/react-toast 1.1.5 - Toast notifications
- lucide-react 0.350.0 - Icon library

**Date/Time:**
- date-fns 3.4.0 - Date formatting utilities
- react-datepicker 6.3.0 - Date picker component

**Testing & Build:**
- ts-node-dev 2.0.0 - Development server with TypeScript compilation
- TypeScript 5.8.3 (backend dev), 5.x (frontend dev) - Compiler
- ESLint 8.x - Linting (frontend uses `eslint-config-next`)
- Next.js built-in linting - `next lint`

**Development Utilities:**
- reflect-metadata 0.2.2 - Enables decorators for TypeORM

## Key Dependencies

**Critical - Backend Only:**
- groq-sdk 1.1.2 - AI insights generation (summary, action items, decisions, timeline)
- elevenlabs 1.59.0 - Text-to-speech for podcast audio generation
- assemblyai 4.15.0 - Speech-to-text SDK (currently unused in active routes, but imported; real-time transcription via Socket.IO)
- @openrouter/sdk 0.9.11 - LLM routing (Q&A over meeting transcripts); **Note**: Used via raw fetch, not SDK, due to ESM-only limitation
- cloudinary 2.6.1 - Podcast MP3 file storage and CDN
- pg 8.20.0 - PostgreSQL database driver (required by TypeORM)
- uuid 9.0.1 - Meeting ID generation
- multer 1.4.5-lts.1 - File upload handling (100MB limit, memory storage)

**Critical - Auth:**
- @clerk/nextjs 5.0.0-beta.35 (frontend) - Next.js authentication provider
- @clerk/express 1.3.8 (backend) - Express middleware for Clerk JWT verification

**Critical - Database:**
- typeorm 0.3.28 - ORM with PostgreSQL support
- pg 8.20.0 - Native PostgreSQL driver

**Utility - Shared:**
- cors 2.8.5 - Cross-Origin Resource Sharing middleware
- dotenv 16.4.7 - Environment variable loading from `.env` file
- uuid 9.0.1 - UUID generation for meeting IDs

**Type Definitions:**
- @types/node 20.x - Node.js types
- @types/express 4.17.21 - Express types
- @types/cors 2.8.17 - CORS types
- @types/multer 1.4.12 - Multer types
- @types/uuid 9.0.8 - UUID types
- @types/react 18.x - React types
- @types/react-dom 18.x - React DOM types
- @types/react-datepicker 6.2.0 - React DatePicker types

## Configuration

**Environment:**
- Shared root `.env` file read by both frontend and backend
- Frontend loads: `NEXT_PUBLIC_*` vars (visible in build)
- Backend loads: All vars including secret keys
- Key loader: `backend/src/lib/db.ts` loads from root `../.env`
- Clerk special case: Backend aliases `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to `CLERK_PUBLISHABLE_KEY` at startup

**Build:**
- Frontend: `next build` compiles to `.next/`
- Backend: `tsc` compiles to `dist/`
- Development: `ts-node-dev` watches and restarts backend on changes

## Platform Requirements

**Development:**
- Node.js (backend requires `@types/node` v20)
- npm for package management
- Postgres connection string (local or Supabase)

**Production:**
- Node.js (ES2020 compatible)
- PostgreSQL database (Supabase recommended; config includes IPv4 forcing)
- Supabase or self-hosted Postgres

**External Service Dependencies:**
- Clerk authentication API
- Deepgram speech-to-text API
- AssemblyAI real-time transcription API (Socket.IO)
- Groq LLM API (insights generation)
- ElevenLabs TTS API (podcast generation)
- OpenRouter LLM API (Q&A endpoint)
- Stream.io video conferencing API
- Cloudinary CDN for podcast storage

---

*Stack analysis: 2026-04-03*
