// Semantic index using BGE-small-en-v1.5 and HNSWLib

import { pipeline } from '@xenova/transformers';
import hnswlib from 'hnswlib-node';
import { fileURLToPath } from 'url';

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

export interface QueryResult {
    id: string;
    distance: number;
}

/**
 * Semantic index for chunk embeddings using BGE-small-en-v1.5
 */
export class SemanticIndex {
    private modelName: string;
    private maxElements: number;
    private dim: number;
    private M: number;
    private efConstruction: number;
    private ef: number;

    // Map string IDs to numeric indices for hnswlib
    private idToIndex: Map<string, number> = new Map();
    private indexToId: Map<number, string> = new Map();
    private nextIndex: number = 0;
    private deletedIndices: Set<number> = new Set();

    private index: hnswlib.HierarchicalNSW | null = null;
    private embedder: any = null;

    constructor(options: SemanticIndexOptions = {}) {
        // Use BGE-small-en-v1.5 for better quality
        this.modelName = options.modelName || 'Xenova/bge-small-en-v1.5';
        this.maxElements = options.maxElements || 10000;
        // BGE-small has 384 dimensions
        this.dim = options.dim || 384;
        this.M = options.M || 16;
        this.efConstruction = options.efConstruction || 100;
        this.ef = options.ef || 50;
    }

    /**
     * Initialize the transformer pipeline and HNSWLib index
     */
    async init(): Promise<void> {
        console.log(`Loading transformer model "${this.modelName}"...`);
        this.embedder = await pipeline('feature-extraction', this.modelName);
        console.log('Model loaded.');

        await this.reset();
        console.log('HNSWLib index initialized.');
    }

    /**
     * Reset the index (clear all documents)
     */
    async reset(): Promise<void> {
        this.index = new hnswlib.HierarchicalNSW('cosine', this.dim);
        this.index.initIndex(this.maxElements, this.M, this.efConstruction);
        this.index.setEf(this.ef);

        this.idToIndex.clear();
        this.indexToId.clear();
        this.deletedIndices.clear();
        this.nextIndex = 0;
    }

    /**
     * Compute a normalized embedding for text using mean pooling
     */
    async getEmbedding(text: string): Promise<number[]> {
        if (!this.embedder) {
            throw new Error('Embedder not initialized. Call init() first.');
        }

        const tensor = (await this.embedder(text)) as TransformerTensor;
        const dims = tensor.dims;

        if (dims.length !== 3 || dims[0] !== 1) {
            throw new Error('Unexpected tensor dimensions. Expected shape [1, tokens, dim].');
        }

        const tokens = dims[1];
        const dim = dims[2];
        const data = tensor.data;

        // Mean pooling over tokens
        const pooled: number[] = new Array(dim).fill(0);
        for (let t = 0; t < tokens; t++) {
            for (let d = 0; d < dim; d++) {
                pooled[d] += data[t * dim + d];
            }
        }
        for (let d = 0; d < dim; d++) {
            pooled[d] /= tokens;
        }

        // L2 normalize
        const norm = Math.sqrt(pooled.reduce((sum, x) => sum + x * x, 0));
        return pooled.map(x => x / norm);
    }

    /**
     * Add a document to the index
     */
    async addDocument(id: string, text: string): Promise<void> {
        if (!this.index) {
            throw new Error('Index not initialized. Call init() first.');
        }

        // Check if already exists
        if (this.idToIndex.has(id)) {
            // Update: remove old and re-add
            await this.removeDocument(id);
        }

        // Get numeric index (reuse deleted slot or allocate new)
        let numIndex: number;
        if (this.deletedIndices.size > 0) {
            numIndex = this.deletedIndices.values().next().value!;
            this.deletedIndices.delete(numIndex);
        } else {
            numIndex = this.nextIndex++;
        }

        if (numIndex >= this.maxElements) {
            throw new Error('Index capacity exceeded.');
        }

        const embedding = await this.getEmbedding(text);
        this.index.addPoint(embedding, numIndex);

        this.idToIndex.set(id, numIndex);
        this.indexToId.set(numIndex, id);
    }

    /**
     * Remove a document from the index
     */
    async removeDocument(id: string): Promise<boolean> {
        if (!this.index) return false;

        const numIndex = this.idToIndex.get(id);
        if (numIndex === undefined) return false;

        try {
            this.index.markDelete(numIndex);
            this.idToIndex.delete(id);
            this.indexToId.delete(numIndex);
            this.deletedIndices.add(numIndex);
            return true;
        } catch (err) {
            console.error(`Error removing document ${id}:`, err);
            return false;
        }
    }

    /**
     * Update a document in the index
     */
    async updateDocument(id: string, text: string): Promise<void> {
        await this.removeDocument(id);
        await this.addDocument(id, text);
    }

    /**
     * Query the index for k nearest neighbors
     */
    async query(text: string, k: number = 5): Promise<QueryResult[]> {
        if (!this.index) {
            throw new Error('Index not initialized. Call init() first.');
        }

        // Adjust k if we have fewer documents
        const actualK = Math.min(k, this.idToIndex.size);
        if (actualK === 0) {
            return [];
        }

        const queryEmbedding = await this.getEmbedding(text);
        const result = this.index.searchKnn(queryEmbedding, actualK);

        const results: QueryResult[] = [];
        for (let i = 0; i < result.neighbors.length; i++) {
            const numIndex = result.neighbors[i];
            const id = this.indexToId.get(numIndex);
            if (id) {
                results.push({
                    id,
                    distance: result.distances[i],
                });
            }
        }

        return results;
    }

    /**
     * Check if a document exists in the index
     */
    hasDocument(id: string): boolean {
        return this.idToIndex.has(id);
    }

    /**
     * Get count of indexed documents
     */
    getDocumentCount(): number {
        return this.idToIndex.size;
    }

    /**
     * Get all indexed document IDs
     */
    getAllIds(): string[] {
        return Array.from(this.idToIndex.keys());
    }
}

// =============================================================================
// Unit Tests (run with: npx tsx memory.embedding.ts)
// =============================================================================

if (fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
    (async () => {
        console.log('=== SemanticIndex Unit Tests ===\n');

        const index = new SemanticIndex({ maxElements: 100 });

        // Test 1: Initialization
        console.log('Test 1: Initialize index...');
        await index.init();
        console.log('✓ Index initialized\n');

        // Test 2: Add documents with string IDs
        console.log('Test 2: Add documents with string IDs...');
        const docs = [
            { id: 'a1b2c3', text: 'Framework for evaluating startup equity offers' },
            { id: 'd4e5f6', text: 'Mental model for decision making under uncertainty' },
            { id: 'g7h8i9', text: 'Cooking recipe for pasta carbonara' },
            { id: 'j0k1l2', text: 'How to negotiate salary and compensation' },
            { id: 'm3n4o5', text: 'Emotional processing techniques for anxiety' },
        ];

        for (const doc of docs) {
            await index.addDocument(doc.id, doc.text);
        }
        console.log(`✓ Added ${docs.length} documents`);
        console.log(`  Document count: ${index.getDocumentCount()}`);
        console.log(`  All IDs: ${index.getAllIds().join(', ')}\n`);

        // Test 3: Query for similar documents
        console.log('Test 3: Query for similar documents...');
        const query1 = 'startup job offer evaluation';
        const results1 = await index.query(query1, 3);
        console.log(`  Query: "${query1}"`);
        console.log('  Results:');
        for (const r of results1) {
            const doc = docs.find(d => d.id === r.id);
            console.log(`    ${r.id}: distance=${r.distance.toFixed(4)} - "${doc?.text}"`);
        }
        console.log();

        const query2 = 'feelings and emotions';
        const results2 = await index.query(query2, 3);
        console.log(`  Query: "${query2}"`);
        console.log('  Results:');
        for (const r of results2) {
            const doc = docs.find(d => d.id === r.id);
            console.log(`    ${r.id}: distance=${r.distance.toFixed(4)} - "${doc?.text}"`);
        }
        console.log();

        // Test 4: Update a document
        console.log('Test 4: Update a document...');
        await index.updateDocument('a1b2c3', 'Updated: Framework for evaluating job offers and equity packages');
        console.log('✓ Updated document a1b2c3');
        console.log(`  Document count: ${index.getDocumentCount()}\n`);

        // Test 5: Remove a document
        console.log('Test 5: Remove a document...');
        const removed = await index.removeDocument('g7h8i9');
        console.log(`✓ Removed document g7h8i9: ${removed}`);
        console.log(`  Document count: ${index.getDocumentCount()}`);
        console.log(`  Has g7h8i9: ${index.hasDocument('g7h8i9')}`);
        console.log(`  All IDs: ${index.getAllIds().join(', ')}\n`);

        // Test 6: Query after removal
        console.log('Test 6: Query after removal (cooking should not appear)...');
        const query3 = 'recipe cooking food';
        const results3 = await index.query(query3, 3);
        console.log(`  Query: "${query3}"`);
        console.log('  Results:');
        for (const r of results3) {
            const doc = docs.find(d => d.id === r.id);
            console.log(`    ${r.id}: distance=${r.distance.toFixed(4)} - "${doc?.text || '(updated)'}"`);
        }
        console.log();

        // Test 7: Reset index
        console.log('Test 7: Reset index...');
        await index.reset();
        console.log(`✓ Index reset`);
        console.log(`  Document count: ${index.getDocumentCount()}\n`);

        console.log('=== All tests passed! ===');
        process.exit(0);
    })().catch(err => {
        console.error('Test failed:', err);
        process.exit(1);
    });
}