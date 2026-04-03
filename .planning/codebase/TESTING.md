# Testing Patterns

**Analysis Date:** 2026-04-03

## Test Framework

**Status:** Not yet implemented

**Framework:**
- No testing framework detected in project dependencies
- Frontend `package.json`: no Jest, Vitest, or Testing Library dependencies
- Backend `package.json`: no testing dependencies

**Current State:**
- Zero test files found in codebase (`find . -name "*.test.*" -o -name "*.spec.*"` returns no results)
- No test configuration files (jest.config.js, vitest.config.ts, etc.)
- No test command in package.json scripts

## Recommendation for Implementation

If tests are to be added, suggested stack:

**Frontend (Next.js 14):**
- Framework: Vitest (lightweight, ESM-native, preferred for modern React)
- Component testing: React Testing Library (@testing-library/react)
- Install: `npm install -D vitest @testing-library/react @testing-library/jest-dom @vitest/ui`
- Config file: `vitest.config.ts` in root

**Backend (Express + TypeScript):**
- Framework: Jest (mature, built-in TypeScript support)
- HTTP testing: Supertest for API route testing
- Install: `npm install -D jest @types/jest ts-jest supertest @types/supertest`
- Config file: `jest.config.js` in `backend/` root

**Shared:**
- Coverage reporting: Built-in to both frameworks
- Test organization: Collocated with source (`*.test.ts` next to implementation)

## Current Testing Approach

**Manual Testing Only:**
- API endpoints tested via direct requests (no automated tests)
- Frontend components rendered manually during development
- Socket.io integration tested through browser console
- Live transcription verified in UI during meetings

## Suggested Testing Structure

### Backend API Routes

If tests are implemented, follow this pattern for `backend/src/routes/__tests__/meetings.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../../index'; // Import Express app
import { getDb } from '../../lib/db';

describe('GET /api/meetings', () => {
  let token: string;

  beforeEach(async () => {
    // Mock Clerk auth token
    token = 'mock-valid-token';
    // Mock database connection
    vi.mock('../../lib/db');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return meetings list for authenticated user', async () => {
    const response = await request(app)
      .get('/api/meetings')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('meetings');
    expect(Array.isArray(response.body.meetings)).toBe(true);
  });

  it('should return 401 without auth token', async () => {
    const response = await request(app)
      .get('/api/meetings');

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error');
  });
});
```

### Frontend Components

If tests are implemented, follow this pattern for `frontend/components/__tests__/MeetingCard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MeetingCard from '../MeetingCard';

describe('MeetingCard', () => {
  const defaultProps = {
    title: 'Team Standup',
    date: '2024-04-03 10:00 AM',
    icon: '/icons/upcoming.svg',
    isPreviousMeeting: false,
    buttonText: 'Start Meeting',
    handleClick: vi.fn(),
    link: 'https://example.com/meeting',
  };

  it('renders meeting title and date', () => {
    render(<MeetingCard {...defaultProps} />);

    expect(screen.getByText('Team Standup')).toBeInTheDocument();
    expect(screen.getByText('2024-04-03 10:00 AM')).toBeInTheDocument();
  });

  it('calls handleClick when button is clicked', async () => {
    const user = userEvent.setup();
    render(<MeetingCard {...defaultProps} />);

    const button = screen.getByText('Start Meeting');
    await user.click(button);

    expect(defaultProps.handleClick).toHaveBeenCalledOnce();
  });

  it('copies link to clipboard when Copy Link is clicked', async () => {
    const user = userEvent.setup();
    const mockClipboard = vi.spyOn(navigator.clipboard, 'writeText');

    render(<MeetingCard {...defaultProps} />);
    await user.click(screen.getByText('Copy Link'));

    expect(mockClipboard).toHaveBeenCalledWith(defaultProps.link);
  });
});
```

### Hooks

If tests are implemented, follow this pattern for `frontend/hooks/__tests__/useGetCalls.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGetCalls } from '../useGetCalls';
import { useUser } from '@clerk/nextjs';
import { useStreamVideoClient } from '@stream-io/video-react-sdk';

vi.mock('@clerk/nextjs');
vi.mock('@stream-io/video-react-sdk');

describe('useGetCalls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty arrays initially', () => {
    vi.mocked(useUser).mockReturnValue({ user: null } as any);
    vi.mocked(useStreamVideoClient).mockReturnValue(null);

    const { result } = renderHook(() => useGetCalls());

    expect(result.current.endedCalls).toBeUndefined();
    expect(result.current.upcomingCalls).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('separates calls into ended and upcoming', async () => {
    const mockUser = { id: 'user-123' };
    const mockClient = {
      queryCalls: vi.fn().mockResolvedValue({
        calls: [
          {
            state: {
              startsAt: new Date(Date.now() - 3600000), // 1 hour ago
              endedAt: new Date(),
            },
          },
          {
            state: {
              startsAt: new Date(Date.now() + 3600000), // 1 hour from now
              endedAt: null,
            },
          },
        ],
      }),
    };

    vi.mocked(useUser).mockReturnValue({ user: mockUser } as any);
    vi.mocked(useStreamVideoClient).mockReturnValue(mockClient as any);

    const { result } = renderHook(() => useGetCalls());

    await waitFor(() => {
      expect(result.current.endedCalls).toHaveLength(1);
      expect(result.current.upcomingCalls).toHaveLength(1);
    });
  });
});
```

### Utilities

If tests are implemented, follow this pattern for `backend/src/lib/__tests__/groq.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGroqClient } from '../groq';

describe('getGroqClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GROQ_API_KEY;
  });

  it('throws error if GROQ_API_KEY not set', () => {
    expect(() => getGroqClient()).toThrow('GROQ_API_KEY environment variable is not set');
  });

  it('returns Groq client instance when API key is set', () => {
    process.env.GROQ_API_KEY = 'test-key';
    const client = getGroqClient();
    expect(client).toBeDefined();
  });

  it('returns same instance on repeated calls (singleton)', () => {
    process.env.GROQ_API_KEY = 'test-key';
    const client1 = getGroqClient();
    const client2 = getGroqClient();
    expect(client1).toBe(client2);
  });
});
```

## Mocking Strategy

**What to Mock:**
- External API calls (Groq, Deepgram, ElevenLabs, Cloudinary, OpenRouter)
- Database operations (TypeORM DataSource, Repository)
- Clerk authentication (tokens, user context)
- Stream.io Video SDK (calls, video client)
- Socket.io events and connections
- File uploads (multer)

**How to Mock:**
- Use `vi.mock()` or `vi.spyOn()` for module-level mocks
- Create fixtures for common test data (e.g., mock Meeting objects, Transcript data)
- Use factory patterns for creating test entities
- Mock environment variables per test

**What NOT to Mock:**
- Utility functions like `cn()` (run actual implementation)
- TypeScript type definitions
- Helper functions in same module (test integration)
- Business logic in utilities (test actual behavior)

## Test Data Fixtures

Suggested location: `backend/src/__tests__/fixtures/` and `frontend/__tests__/fixtures/`

**Example: Meeting fixture** (`backend/src/__tests__/fixtures/meetings.ts`):

```typescript
import { Meeting } from '../../entities/Meeting';

export const mockMeeting: Meeting = {
  id: 'uuid-123',
  meetingId: 'meeting-001',
  userId: 'user-123',
  title: 'Q1 Planning',
  transcriptText: 'This is a sample transcript...',
  status: 'completed',
  summary: 'Meeting summary here',
  actionItems: [
    { text: 'Finalize Q1 roadmap', assignee: 'John', done: false },
  ],
  decisions: [
    { text: 'Ship feature X by end of month', context: 'Discussed in Q1 goals' },
  ],
  timeline: [
    { time: 'Opening', topic: 'Q1 Goals', summary: 'Reviewed goals' },
  ],
  keyTopics: ['Q1 planning', 'roadmap', 'priorities'],
  participants: ['john@example.com', 'jane@example.com'],
  podcastStatus: 'ready',
  podcastUrl: 'https://example.com/podcast.mp3',
  podcastScript: 'Podcast script here...',
  startedAt: new Date('2024-04-01T10:00:00Z'),
  endedAt: new Date('2024-04-01T11:00:00Z'),
  createdAt: new Date('2024-04-01T10:00:00Z'),
  updatedAt: new Date('2024-04-01T11:00:00Z'),
};
```

## Coverage

**Current Status:** Not measured

**Recommended Targets (once tests added):**
- Backend: Minimum 70% for routes, 80% for utilities
- Frontend: Minimum 60% for components, 80% for hooks
- Critical paths (auth, DB writes, AI integrations): 90%

**View Coverage:**
```bash
# Frontend
npm run test -- --coverage

# Backend
npm run test -- --coverage
```

## Test Types

### Unit Tests
- **Scope:** Individual functions, utilities, entities
- **Approach:** Test function behavior in isolation with mocked dependencies
- **Examples:** `getGroqClient()`, `cn()`, `generateSimpleAnswer()`, TypeORM entity methods

### Integration Tests
- **Scope:** Multiple units working together (e.g., route + database + auth)
- **Approach:** Mock external services but test real business logic flow
- **Examples:** POST /api/insights/generate (auth → DB read → Groq call → DB update → response)

### E2E Tests
- **Framework:** Not applicable for hackathon stage
- **When to add:** Post-launch, if end-to-end user flows need validation
- **Tools:** Playwright or Cypress for browser automation

## Known Testing Gaps

1. **API Routes** - No validation tests for request/response contracts
2. **Database Transactions** - No tests for race conditions or concurrent operations
3. **Socket.io Events** - No mock event listener validation
4. **Error Scenarios** - Limited error handling test coverage needed
5. **AI Integration** - No tests for Groq/OpenRouter prompt variations
6. **File Uploads** - No tests for multer edge cases (corrupted files, oversized uploads)
7. **Frontend State Management** - No tests for hook state transitions
8. **Deepgram/ElevenLabs** - No tests for streaming scenarios
9. **Cross-browser Compatibility** - No E2E tests for UI in different browsers

---

*Testing analysis: 2026-04-03*
