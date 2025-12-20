import { pipeline } from '@xenova/transformers';
import hnswlib from 'hnswlib-node';
import { fileURLToPath } from 'url';
import path from 'path';

interface TransformerTensor {
  dims: number[];
  type: string;
  data: Float32Array;
}

interface SemanticIndexOptions {
  modelName?: string;
  maxElements?: number;
  dim?: number;
  M?: number;
  efConstruction?: number;
  ef?: number;
}

interface QueryResult {
  neighbors: { id: number; text: string }[];
  distances: number[];
}

class SemanticIndex {
  private modelName: string;
  private maxElements: number;
  private dim: number;
  private M: number;
  private efConstruction: number;
  private ef: number;
  // Instead of using a sequential currentCount, we now use provided document IDs.
  private documents: Record<number, string> = {};
  private index: hnswlib.HierarchicalNSW | null = null;
  private embedder: any = null;

  constructor(options: SemanticIndexOptions = {}) {
    this.modelName = options.modelName || 'Xenova/all-MiniLM-L6-v2';
    this.maxElements = options.maxElements || 1000;
    // For all-MiniLM-L6-v2, the embedding dimension is 384.
    this.dim = options.dim || 384;
    this.M = options.M || 16;
    this.efConstruction = options.efConstruction || 100;
    this.ef = options.ef || 50;
  }

  /**
   * Initializes the transformer pipeline and the HNSWLib index.
   */
  public async init(): Promise<void> {
    console.log(`Loading transformer model "${this.modelName}"...`);
    this.embedder = await pipeline('feature-extraction', this.modelName);
    console.log('Model loaded.');

    await this.reset();
    console.log('HNSWLib index initialized.');
  }

   public async reset(): Promise<void> {
    this.index = new hnswlib.HierarchicalNSW('cosine', this.dim);
    this.index.initIndex(this.maxElements, this.M, this.efConstruction);
    this.index.setEf(this.ef);

   }

  /**
   * Computes a normalized embedding for the given text using mean pooling.
   * Assumes the returned tensor has shape [1, tokens, dim].
   * @param text The input text.
   * @returns A promise that resolves to a normalized embedding vector.
   */
  public async getEmbedding(text: string): Promise<number[]> {
    const tensor = (await this.embedder(text)) as TransformerTensor;
    const dims = tensor.dims;
    if (dims.length !== 3 || dims[0] !== 1) {
      throw new Error('Unexpected tensor dimensions. Expected shape [1, tokens, dim].');
    }
    const tokens = dims[1];
    const dim = dims[2];
    const data = tensor.data;

    // Mean pooling over the tokens.
    let pooled: number[] = new Array(dim).fill(0);
    for (let t = 0; t < tokens; t++) {
      for (let d = 0; d < dim; d++) {
        pooled[d] += data[t * dim + d];
      }
    }
    pooled = pooled.map((x) => x / tokens);

    // L2-normalize the pooled embedding.
    const norm = Math.sqrt(pooled.reduce((sum, x) => sum + x * x, 0));
    const normalized = pooled.map((x) => x / norm);
    return normalized;
  }

  /**
   * Adds a document to the index with a provided document ID.
   * @param id Document ID to use.
   * @param text The document text.
   */
  public async addDocument(id: number, text: string): Promise<void> {
    if (id >= this.maxElements) {
      throw new Error('Document ID exceeds the capacity of the index.');
    }
    const embedding = await this.getEmbedding(text);
    this.index!.addPoint(embedding, id);
    this.documents[id] = text;
  }

  /**
   * Removes a document from the index using its document ID.
   * This uses the hnswlib-node method markDelete to remove the point.
   * @param id The document ID to remove.
   */
  public async removeDocument(id: number): Promise<void> {
    // hnswlib-node supports marking a point as deleted.
    try {
      this.index!.markDelete(id);
      delete this.documents[id];
    } catch (err) {
      console.error(`Error removing document with id ${id} from the index:`, err);
      throw err;
    }
  }

  /**
   * Queries the index for the k nearest neighbors of the given text.
   * @param text The query text.
   * @param k Number of nearest neighbors to retrieve (default is 3).
   * @returns A promise that resolves to the query result.
   */
  public async query(text: string, k: number = 3): Promise<QueryResult> {
    const queryEmbedding = await this.getEmbedding(text);
    const result = this.index!.searchKnn(queryEmbedding, k);
    const neighbors = result.neighbors.map((label: number) => ({
      id: label,
      text: this.documents[label],
    }));
    return { neighbors, distances: result.distances };
  }
}

export default SemanticIndex;

// ---------------------------
// Main entry point for testing
// ---------------------------
if (
  fileURLToPath(import.meta.url).toLowerCase() ===
  path.resolve(process.argv[1]).toLowerCase()
) {
  (async () => {
    try {
      console.log('--- SemanticIndex Test Case ---');
      // Initialize the semantic index with a capacity for 100 documents.
      const semanticIndex = new SemanticIndex({ maxElements: 100 });
      await semanticIndex.init();

      // Sample documents to index.
      const docs: string[] = [
        "This is a bullet point.",
        "Here is a paragraph of text that describes something in more detail.",
        "Another piece of text that could be semantically similar.",
        "This document is about machine learning and data science.",
        "A completely different topic: cooking recipes and ingredients."
      ];
      console.log('Adding documents...');
      for (let i = 0; i < docs.length; i++) {
        await semanticIndex.addDocument(i, docs[i]);
      }
      console.log(`Added ${docs.length} documents.`);

      // Define a query text.
      const queryText = "Tell me about points.";
      console.log(`\nQuerying for: "${queryText}"`);
      const result = await semanticIndex.query(queryText, 3);

      // Print the query results.
      console.log('Query Results:');
      result.neighbors.forEach((neighbor, idx) => {
        console.log(
          `Rank ${idx + 1}: ID=${neighbor.id}, Text="${neighbor.text}", Distance=${result.distances[idx]}`
        );
      });
    } catch (error) {
      console.error('Error during test case execution:', error);
    }
  })();
}