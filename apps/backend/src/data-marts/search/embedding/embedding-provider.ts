export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

// Model + dtype define the index: changing either invalidates stored embeddings (doc_hash mixes in modelId).
export const EMBEDDING_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
// transformers.js v3 defaults to fp32; pin q8 to pull the ~4x smaller quantized ONNX.
export const EMBEDDING_DTYPE = 'q8';
export const EMBEDDING_DIMENSIONS = 384;

export type EmbeddingInputType = 'search_query' | 'search_document';

export interface EmbeddingOptions {
  inputType?: EmbeddingInputType;
}

export interface EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number | null;
  embed(texts: string[], options?: EmbeddingOptions): Promise<(Float32Array | null)[]>;
}
