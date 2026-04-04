import type { CompiledStateGraph } from '@langchain/langgraph';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGraph = CompiledStateGraph<any, any, any, any, any, any>;

let _graph: AnyGraph | null = null;
let _graphPromise: Promise<AnyGraph> | null = null;

async function getRagGraph(): Promise<AnyGraph> {
  if (_graph) return _graph;
  if (_graphPromise) return _graphPromise;

  _graphPromise = (async () => {
    const { StateGraph, Annotation, START, END } = await import('@langchain/langgraph');
    const { ChatGroq } = await import('@langchain/groq');
    const { HumanMessage } = await import('@langchain/core/messages');
    const { getSupabaseAdmin } = await import('./supabaseAdmin');
    const { embedText } = await import('./embeddings');

    const GraphState = Annotation.Root({
      question: Annotation<string>,
      meetingId: Annotation<string>,
      chunks: Annotation<Array<{ chunk_text: string; speaker_name: string | null; start_ms: number | null; similarity: number }>>({
        reducer: (_prev: Array<{ chunk_text: string; speaker_name: string | null; start_ms: number | null; similarity: number }>, next: Array<{ chunk_text: string; speaker_name: string | null; start_ms: number | null; similarity: number }>) => next,
        default: () => [],
      }),
      answer: Annotation<string>({
        reducer: (_prev: string, next: string) => next,
        default: () => '',
      }),
    });

    const llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: 'llama-3.1-8b-instant',
      temperature: 0.3,
    });

    // Node: retrieve — embed question and run pgvector cosine search
    async function retrieve(state: typeof GraphState.State) {
      const queryEmbedding = await embedText(state.question);
      const supabase = getSupabaseAdmin();
      const { data } = await supabase.rpc('match_transcript_chunks', {
        query_embedding: queryEmbedding,
        match_meeting_id: state.meetingId,
        match_count: 6,
      });
      return { chunks: data || [] };
    }

    // Conditional routing — grade retrieval relevance
    function gradeRoute(state: typeof GraphState.State): string {
      if (!state.chunks || state.chunks.length === 0) return 'retrieve_recent';
      const topScore = state.chunks[0]?.similarity ?? 0;
      return topScore >= 0.35 ? 'generate' : 'retrieve_recent';
    }

    // Node: retrieve_recent — fallback to last 8 transcript chunks ordered by time
    async function retrieveRecent(state: typeof GraphState.State) {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from('transcript_embeddings')
        .select('chunk_text, speaker_name, start_ms')
        .eq('meeting_id', state.meetingId)
        .order('created_at', { ascending: false })
        .limit(8);
      const chunks = (data || []).map((row: { chunk_text: string; speaker_name: string | null; start_ms: number | null }) => ({
        chunk_text: row.chunk_text,
        speaker_name: row.speaker_name,
        start_ms: row.start_ms,
        similarity: 0,
      }));
      return { chunks };
    }

    // Node: generate — build context from chunks and invoke LLM
    async function generate(state: typeof GraphState.State) {
      const context = state.chunks
        .map((c) => `[${c.speaker_name || 'Speaker'}] ${c.chunk_text}`)
        .join('\n');

      const prompt = `You are a meeting assistant. Answer questions using ONLY the provided transcript context. If the answer is not in the context, say so directly. Be concise. Cite speaker names when relevant.

Context:
${context}

Question: ${state.question}`;

      const response = await llm.invoke([new HumanMessage(prompt)]);
      return { answer: response.content as string };
    }

    const graph = new StateGraph(GraphState)
      .addNode('retrieve', retrieve)
      .addNode('grade_relevance', (state: typeof GraphState.State) => state)
      .addNode('retrieve_recent', retrieveRecent)
      .addNode('generate', generate)
      .addEdge(START, 'retrieve')
      .addEdge('retrieve', 'grade_relevance')
      .addConditionalEdges('grade_relevance', gradeRoute, {
        generate: 'generate',
        retrieve_recent: 'retrieve_recent',
      })
      .addEdge('retrieve_recent', 'generate')
      .addEdge('generate', END);

    _graph = graph.compile();
    return _graph;
  })();

  return _graphPromise;
}

export async function* streamAnswer(meetingId: string, question: string): AsyncGenerator<string> {
  const graph = await getRagGraph();
  const stream = await graph.stream(
    { question, meetingId },
    { streamMode: 'messages' }
  );
  for await (const item of stream) {
    const [messageChunk, metadata] = item as unknown as [{ content?: string }, { langgraph_node?: string }];
    if (metadata.langgraph_node === 'generate' && messageChunk.content) {
      yield messageChunk.content as string;
    }
  }
}

export function warmUpGraph(): void {
  getRagGraph().catch((err) => console.error('RAG graph warm-up failed:', err));
}
