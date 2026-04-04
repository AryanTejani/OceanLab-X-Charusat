// @xenova/transformers is ESM-only internally — must use dynamic import() in CJS backend
// Pipeline type is complex union; use a callable interface to avoid overload resolution issues
interface FeaturePipeline {
  (text: string, options: { pooling: string; normalize: boolean }): Promise<{ data: Float32Array }>;
}

let _pipeline: FeaturePipeline | null = null;
let _initPromise: Promise<FeaturePipeline> | null = null;

async function getPipeline(): Promise<FeaturePipeline> {
  if (_pipeline) return _pipeline;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const { pipeline, env } = await import('@xenova/transformers');
    env.cacheDir = './.cache';
    env.backends.onnx.wasm.numThreads = 1;
    const p = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    _pipeline = p as unknown as FeaturePipeline;
    return _pipeline;
  })();

  return _initPromise;
}

export async function embedText(text: string): Promise<number[]> {
  const pipe = await getPipeline();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map((t) => embedText(t)));
}

export function warmUpEmbedder(): void {
  getPipeline().catch((err) => console.error('Embedder warm-up failed:', err));
}
