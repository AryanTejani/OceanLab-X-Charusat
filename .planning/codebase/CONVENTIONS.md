# Coding Conventions

**Analysis Date:** 2026-04-03

## Naming Patterns

**Files:**
- Backend routes: camelCase with descriptive names (`meetings.ts`, `insights.ts`, `podcast.ts`, `meetingQa.ts`)
- Backend entities: PascalCase (`Meeting.ts`, `Transcript.ts`)
- Backend lib utilities: camelCase (`groq.ts`, `elevenlabs.ts`, `db.ts`)
- Frontend components: PascalCase (`MeetingCard.tsx`, `Alert.tsx`, `TranscriptionPanel.tsx`, `QnAChatbot.tsx`)
- Frontend hooks: camelCase with `use` prefix (`useGetCalls.ts`, `useDeepgramTranscription.ts`, `useGetCallById.ts`)
- Frontend lib/utilities: camelCase (`api.ts`, `types.ts`, `utils.ts`, `localTranscriptStorageClient.ts`)
- Constants: camelCase (`index.ts` in constants directory)

**Functions:**
- Use camelCase throughout codebase
- Prefix hook functions with `use` (React convention): `useGetCalls()`, `useDeepgramTranscription()`
- Utility functions: camelCase (`getGroqClient()`, `getDb()`, `apiFetch()`, `cn()`)
- Socket.io event handlers: kebab-case strings (e.g., `'join-meeting'`, `'start-transcription'`, `'audio-chunk'`, `'stop-transcription'`)
- Internal helper functions: camelCase (`generateSimpleAnswer()`, `attachIsOpen()`, `createDataSource()`)

**Variables:**
- Use `const` for all variables; never use `var`; use `let` only when reassignment is required
- camelCase for all variable names
- Database repositories: `repo` (Repository<Entity>)
- Data source: `ds` (DataSource)
- Async request variables: clear names before try blocks (e.g., `let meetingId: string | undefined` captured before try)

**Types:**
- Interfaces: PascalCase with `I` prefix in entities (`IActionItem`, `IDecision`, `ITimelineEntry`, `IMeeting`)
- No `I` prefix in frontend types (`apiFetch` function parameter types inferred from usage)
- Type annotations required in function signatures
- Request/Response types from Express: `Request`, `Response` imported from 'express'

## Code Style

**Formatting:**
- Prettier configured with `singleQuote: true` (use single quotes throughout)
- Backend: no explicit prettier config in root, but follows single-quote pattern
- Frontend: `.prettierrc` enforces `singleQuote: true`
- Indentation: 2 spaces (standard Next.js + Express default)
- Line length: no hard limit observed, natural wrapping

**Linting:**
- Frontend: ESLint with Next.js core rules (`.eslintrc.json`)
- Rules disabled in frontend:
  - `no-use-before-define`: off
  - `no-unused-vars`: warn (not error)
  - `tailwindcss/classnames-order`: off
  - `tailwindcss/no-custom-classname`: off
  - `tailwindcss/enforces-shorthand`: off
  - `object-shorthand`: off
- No explicit linting for backend files

## Import Organization

**Order:**
1. Framework/library imports (e.g., `import express from 'express'`)
2. Third-party dependencies (e.g., `import { Router, Request, Response } from 'express'`, `import Groq from 'groq-sdk'`)
3. Relative imports from local modules (e.g., `import { getDb } from '../lib/db'`, `import { Meeting } from '../entities/Meeting'`)
4. Type-only imports not observed as common pattern

**Path Aliases:**
- Frontend uses `@/*` to point to root: configured in `tsconfig.json` paths
- Examples: `@/lib/utils`, `@/constants`, `@/hooks/useGetCalls`, `@/components/ui/button`
- Backend does not use aliases; uses relative paths (`../lib/db`, `../entities/Meeting`)

**Import statement style:**
- Named imports when importing specific items: `import { Router, Request, Response } from 'express'`
- Default imports for modules/functions: `import express from 'express'`
- Namespace imports: `import * as path from 'path'` for utilities
- Unused imports: avoid (linted as warning in frontend)

## Error Handling

**Patterns:**
- Backend routes: always wrap async handlers in try-catch blocks
- Capture identifiers before try block for use in catch blocks:
  ```typescript
  let meetingId: string | undefined;
  let userId: string | undefined;
  try {
    // ... code
  } catch (error) {
    // Use meetingId and userId in error handling
  }
  ```
- All database updates in catch blocks must include both `meetingId` AND `userId` in WHERE clause
- Error responses: always return explicit HTTP status codes (4xx for client errors, 5xx for server errors)
- Console errors: log with descriptive context before responding to client
- Silent failures: catch blocks may suppress errors (e.g., `try { conn.close(); } catch (_) {}` for cleanup)
- Null coalescing: use `??` for null checks, `?.` for optional chaining

## Logging

**Framework:** Native `console` object

**Patterns:**
- `console.log()` for informational messages (Socket.io connections: `console.log('🔌 Client connected...')`)
- `console.error()` for error states (API failures, connection issues)
- Emoji prefixes used in Socket.io messages for visual distinction (🔌, 🫶, 📤, ❌, 🎤, 🔌)
- Emoji NOT used in API error logs or critical paths
- Messages are descriptive and include context (socket id, meetingId, error type)
- Do NOT log stack traces to API responses — only error messages
- Do NOT log sensitive data (API keys, tokens, passwords)

## Comments

**When to Comment:**
- Complex algorithms: limited use observed; code is mostly self-documenting
- Unclear business logic: see JSDoc in `api.ts` for authenticated fetch wrapper
- Integration-specific details: e.g., "Deepgram error handling", "Socket.io keep-alive"
- Warnings about side effects or special cases (e.g., `// @ts-ignore — plain JS module`)
- Rule enforcement in AI prompts: detailed rules for Groq/OpenRouter system messages (inline)

**JSDoc/TSDoc:**
- Minimal usage in codebase
- Example: `apiFetch()` function has JSDoc block explaining Clerk token requirement
- Format: `/** Documented function */`
- Not applied to component props (interfaces used instead, like `MeetingCardProps`)
- Not applied to entity classes or route handlers

## Function Design

**Size:**
- Routes: typically 20-80 lines including logic and error handling
- Utilities: keep helpers small and focused (e.g., `cn()` is 3 lines, `generateSimpleAnswer()` is ~20 lines)
- Controllers/handlers: Extract complex logic to separate functions if exceeds ~50 lines

**Parameters:**
- Routes use Express `Request` and `Response` objects
- Hooks accept specific typed parameters (e.g., `meetingId: string`)
- Utility functions use destructuring for object parameters when possible
- No excessive parameter passing; group related parameters into objects

**Return Values:**
- API routes: JSON responses with consistent structure
  - Success: `{ success: true, ...data }` or flat object with data fields
  - Error: `{ error: 'error message' }`
  - No stack traces in responses
- Async functions: return Promises with typed results
- Hooks: return objects with multiple related values (e.g., `{ endedCalls, upcomingCalls, callRecordings, isLoading }`)
- Helper functions: return transformed data or void for side effects

## Module Design

**Exports:**
- Backend routes: `export default router` (single default export)
- Frontend components: `export default ComponentName` (single default export)
- Utilities/libs: named function exports when multiple exports needed (e.g., `export async function getDb()`)
- Entities: named class exports (e.g., `export class Meeting { }`)
- Types: named interface exports (e.g., `export interface IMeeting { }`)

**Barrel Files:**
- Components in `components/ui/` use implicit barrel files (imported as `from './ui/button'`)
- Constants exported from `constants/index.ts` (imported as `from '@/constants'`)
- Lib utilities exported from individual files (imported as `from '@/lib/api'`)
- No explicit re-exports observed

## Backend-Specific Patterns

**Middleware:**
- Clerk auth: `requireAuth()` middleware for protected routes
- Request body: `express.json({ limit: '10mb' })`
- CORS: configured with `FRONTEND_URL` environment variable
- Error middleware: not explicitly defined; handled inline in routes

**Database Queries:**
- TypeORM repository pattern: `ds.getRepository(Entity)`
- Always scope queries to `userId` for access control: `where: { userId, meetingId }`
- Use `findOneBy()`, `find()`, `update()`, `upsert()` methods
- Always filter by `userId` in WHERE clause to prevent cross-user access

**API Response Format:**
- Routes return consistent JSON structures
- Success responses: `{ success: true, meetingId, ... }` or `{ meeting }`, `{ meetings }`
- Error responses: `{ error: 'message' }` with appropriate HTTP status code
- Status codes: 401 (auth), 400 (validation), 404 (not found), 500 (server error)

## Frontend-Specific Patterns

**Component Directives:**
- Use `'use client'` only when component needs:
  - React hooks (useState, useEffect, useContext)
  - Browser APIs (localStorage, window)
  - Event handlers (onClick, onChange)
- MeetingCard, Alert, TranscriptionPanel use `'use client'` for interactivity
- No explicit server components; most use `'use client'`

**Styling:**
- Tailwind CSS for all styling: use className attribute
- No inline styles (`style={{}}` avoided)
- No CSS modules
- Component library: Radix UI primitives (Button, Card, Dialog, etc. from `./ui/` folder)
- Class name utilities: `cn()` function from `lib/utils.ts` using clsx + tailwind-merge

**API Calls:**
- Use `apiFetch()` wrapper from `lib/api.ts`
- Get Clerk token: `const { getToken } = useAuth(); const token = await getToken()`
- Token endpoints (`/api/deepgram-token`) accept `null` token (no auth required)
- Pass token as second parameter to `apiFetch(path, token, init)`

## TypeScript Configuration

**Backend (`backend/tsconfig.json`):**
- `strict: false` (intentional — allows some flexibility)
- `target: ES2020`
- `module: commonjs`
- Do NOT introduce new `any` types without explicit justification
- Existing code uses minimal `any` (mostly in Socket.io event handlers)

**Frontend (`frontend/tsconfig.json`):**
- `strict: true` (strict type checking)
- `jsx: preserve` (Next.js handles JSX)
- `moduleResolution: bundler`
- Path aliases via `paths` config

---

*Convention analysis: 2026-04-03*
