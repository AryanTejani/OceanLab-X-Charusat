// Type-only import (erased at compile time, safe in CJS)
type Pipeline = Awaited<ReturnType<typeof import('@xenova/transformers')['pipeline']>>;

let _pipeline: Pipeline | null = null;
let _initPromise: Promise<Pipeline> | null = null;

async function getPipeline(): Promise<Pipeline> {
  if (_pipeline) return _pipeline;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const { pipeline, env } = await import('@xenova/transformers');
    env.cacheDir = './.cache';
    env.backends.onnx.wasm.numThreads = 1;
    const p = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    _pipeline = p;
    return p;
  })();

  return _initPromise;
}

export async function embedText(text: string): Promise<number[]> {
  const pipe = await getPipeline();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const output = await (pipe as any)(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map((t) => embedText(t)));
}

export function warmUpEmbedder(): void {
  getPipeline().catch((err) => console.error('Embedder warm-up failed:', err));
}
