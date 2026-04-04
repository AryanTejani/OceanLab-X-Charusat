# Requirements

All packages for the AI Meeting Notetaker project.
Stack: Next.js 14 + Supabase + Attendee.dev + Deepgram + Groq

---

## Frontend & Framework

```
next@14
react@18
react-dom@18
typescript@5
```

---

## Supabase (Auth + DB + Storage)

```
@supabase/supabase-js@2
@supabase/auth-helpers-nextjs@0
@supabase/auth-ui-react@0
@supabase/auth-ui-shared@0
```

---

## Calendar APIs

```
googleapis@140            # Google Calendar API client (Node.js)
@microsoft/microsoft-graph-client@3   # Microsoft Graph API client
@azure/msal-node@2        # Microsoft OAuth (MSAL) for token handling
```

---

## Meeting Bot — Attendee.dev

```
# Attendee uses a REST API — no SDK needed.
# HTTP calls made with native fetch or axios.
axios@1
```

---

## Transcription — Deepgram

```
@deepgram/sdk@3
```

---

## AI Layer — Groq

```
groq-sdk@0
```

---

## Scheduling / Cron (for calendar polling)

```
node-cron@3               # For polling calendar events on Railway/Render
```

---

## Utilities

```
date-fns@3                # Date formatting and comparison
zod@3                     # Schema validation for API inputs and AI outputs
dotenv@16                 # Environment variable management
```

---

## UI / Styling

```
tailwindcss@3
@tailwindcss/typography@0  # For rendering MoM/transcript nicely
lucide-react@0             # Icons
clsx@2                     # Conditional class names
```

---

## Dev Dependencies

```
eslint@8
eslint-config-next@14
prettier@3
@types/node@20
@types/react@18
@types/react-dom@18
```

---

## Environment Variables Required

Create a `.env.local` file in your project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google Calendar OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# Microsoft Graph OAuth
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=
MICROSOFT_TENANT_ID=common

# Attendee.dev
ATTENDEE_API_KEY=
ATTENDEE_API_BASE_URL=https://app.attendee.dev/api/v1

# Deepgram
DEEPGRAM_API_KEY=

# Groq
GROQ_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=                # Random string to secure your cron endpoint
```

---

## Quick Install

```bash
npm install next@14 react@18 react-dom@18 typescript \
  @supabase/supabase-js @supabase/auth-helpers-nextjs \
  @supabase/auth-ui-react @supabase/auth-ui-shared \
  googleapis @microsoft/microsoft-graph-client @azure/msal-node \
  axios @deepgram/sdk groq-sdk node-cron \
  date-fns zod dotenv tailwindcss @tailwindcss/typography \
  lucide-react clsx

npm install -D eslint eslint-config-next prettier \
  @types/node @types/react @types/react-dom
```
