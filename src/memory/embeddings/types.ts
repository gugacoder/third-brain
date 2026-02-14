export type EmbeddingProvider = {
  id: string;
  model: string;
  dimensions: number;
  embedQuery: (text: string) => Promise<number[]>;
  embedBatch: (texts: string[]) => Promise<number[][]>;
};
