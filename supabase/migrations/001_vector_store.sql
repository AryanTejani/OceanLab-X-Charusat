-- Enable pgvector extension
create extension if not exists vector;

-- Transcript embeddings table for RAG pipeline
create table if not exists transcript_embeddings (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   text not null,
  transcript_id uuid references transcripts(id) on delete cascade,
  chunk_text   text not null,
  speaker_name text,
  start_ms     bigint,
  embedding    vector(384),
  created_at   timestamptz default now()
);

-- IVFFlat index for approximate nearest-neighbor cosine similarity search
create index if not exists transcript_embeddings_embedding_idx
  on transcript_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Index on meeting_id for fast per-meeting filtering
create index if not exists transcript_embeddings_meeting_id_idx
  on transcript_embeddings (meeting_id);

-- RPC function for vector similarity search scoped to a meeting
create or replace function match_transcript_chunks(
  query_embedding vector(384),
  match_meeting_id text,
  match_count int default 6
)
returns table (
  id           uuid,
  chunk_text   text,
  speaker_name text,
  start_ms     bigint,
  similarity   float
)
language sql stable
as $$
  select
    te.id,
    te.chunk_text,
    te.speaker_name,
    te.start_ms,
    1 - (te.embedding <=> query_embedding) as similarity
  from transcript_embeddings te
  where te.meeting_id = match_meeting_id
  order by te.embedding <=> query_embedding
  limit match_count;
$$;
