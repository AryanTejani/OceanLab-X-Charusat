# Database Patterns — MeetMind AI

## Stack

TypeORM 0.3.x + PostgreSQL via Supabase. Connection managed via `backend/src/lib/db.ts`.

## DataSource Configuration

```ts
new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : undefined,
  entities: [Meeting, Transcript],
  synchronize: true,   // auto-creates/updates tables — dev only
  logging: false,
  extra: { family: 4 }, // force IPv4 — Supabase resolves to IPv6 on some networks
});
```

**`extra: { family: 4 }` is mandatory.** Without it, connections fail with `ENETUNREACH` on IPv6.

## Connection Pattern

Singleton via global variable — never create a new DataSource per request:
```ts
export async function getDb(): Promise<DataSource> {
  if (!global._typeormDs) global._typeormDs = createDataSource();
  if (!global._typeormDs.isInitialized) await global._typeormDs.initialize();
  return global._typeormDs;
}
```

Usage in routes:
```ts
const ds = await getDb();
const repo = ds.getRepository(Meeting);
```

## Entities

### Meeting (`meetings` table)
Key columns: `meetingId` (unique, indexed), `userId` (indexed), `title`, `transcriptText`, `status`, `summary`, `actionItems` (JSONB), `decisions` (JSONB), `timeline` (JSONB), `keyTopics` (simple-array), `participants` (simple-array), `podcastStatus`, `podcastUrl`, `podcastScript`.

### Transcript (`transcripts` table)
Key columns: `meetingId` (indexed), `userId`, `userName`, `text`, `confidence`, `startMs`, `endMs`, `isFinal`.

## Query Patterns

### Fetch all meetings for a user
```ts
await repo.find({
  where: { userId },
  select: { meetingId: true, title: true, status: true, createdAt: true, keyTopics: true },
  order: { createdAt: 'DESC' },
});
```

Always use `select` on list queries — never fetch `transcriptText` or `podcastUrl` in list views (they're large).

### Upsert (meeting save)
```ts
await repo.upsert(
  { meetingId, userId, title, transcriptText, status: 'processing', endedAt: new Date() },
  { conflictPaths: ['meetingId'] }
);
```

### Update with user scope
```ts
// Always include userId — prevents cross-user writes
await repo.update({ meetingId, userId }, { status: 'completed', summary: '...' });
```

### Assemble transcript from real-time saves
```ts
const lines = await transcriptRepo.find({
  where: { meetingId, isFinal: true },
  order: { createdAt: 'ASC' },
});
const fullText = lines.map(l => l.text).filter(Boolean).join(' ');
```

## Media Storage Rule

**Never store audio, video, or large binary data in PostgreSQL.**

- Podcast MP3 → Cloudinary (`secure_url` stored in `meetings.podcastUrl`)
- Audio uploads → Supabase Storage via signed URLs (bypasses server entirely)
- Transcripts → text stored in `meetings.transcriptText` (acceptable — text is small)

## JSONB Columns

`actionItems`, `decisions`, `timeline` are JSONB. TypeORM maps them as JS objects. Always type them explicitly when reading:

```ts
const items = meeting.actionItems as IActionItem[];
```

## Indexing (Existing)

- `@Index(['userId'])` on Meeting
- `@Index()` on `meetingId`
- `@Index(['meetingId'])` on Transcript

Do not add indexes without a query justification.

## Supabase Notes

- Use the **pooler connection string** (port 5432, not 6543) for TypeORM — session mode, not transaction mode
- Password with `@` must be URL-encoded as `%40` in `DATABASE_URL`
- `synchronize: true` auto-creates tables on first connection — if tables are missing, DB connection failed

## Frontend Types

`frontend/lib/types.ts` mirrors entity interfaces without TypeORM decorators. Keep in sync when adding entity columns:

```ts
// backend/src/entities/Meeting.ts — TypeORM entity
@Column({ type: 'text', nullable: true })
podcastUrl!: string | null;

// frontend/lib/types.ts — plain interface
podcastUrl?: string | null;
```
