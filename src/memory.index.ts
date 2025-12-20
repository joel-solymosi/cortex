// MemoryStore: orchestrates storage, embedding, and audit logging

import path from 'path';
import chokidar from 'chokidar';
import { Chunk, ChunkMeta, getChunkDefaults, REQUIRED_FIELDS } from './memory.types';
import { ChunkStorage } from './memory.storage';
import { AuditLog } from './memory.audit';
import { SemanticIndex } from './memory.embedding';

export interface MemoryStoreOptions {
    dataDir: string;
}

/**
 * Build embedding text from chunk (summary + tags + content)
 */
function buildEmbeddingText(chunk: Chunk): string {
    return [
        chunk.summary,
        chunk.surface_tags.join(', '),
        chunk.content,
    ].join('\n\n');
}

/**
 * Main memory store class - orchestrates all components
 */
export class MemoryStore {
    private storage: ChunkStorage;
    private audit: AuditLog;
    private index: SemanticIndex;
    private watcher: chokidar.FSWatcher | null = null;
    private dataDir: string;
    private initialized: boolean = false;

    constructor(options: MemoryStoreOptions) {
        this.dataDir = options.dataDir;
        this.storage = new ChunkStorage(this.dataDir);
        this.audit = new AuditLog(this.dataDir);
        this.index = new SemanticIndex({ maxElements: 10000 });
    }

    /**
     * Initialize the memory store
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        console.log('Initializing memory store...');

        // Initialize components
        await this.storage.initialize();
        await this.audit.initialize();
        await this.index.init();

        // Build embedding index from existing chunks
        await this.rebuildIndex();

        // Start file watcher
        this.startWatcher();

        await this.audit.log('INIT', undefined, { chunksLoaded: this.index.getDocumentCount() });

        this.initialized = true;
        console.log(`Memory store initialized with ${this.index.getDocumentCount()} chunks.`);
    }

    /**
     * Rebuild the embedding index from all stored chunks
     */
    private async rebuildIndex(): Promise<void> {
        await this.index.reset();

        const ids = this.storage.getAllIds();
        for (const id of ids) {
            const chunk = await this.storage.read(id);
            if (chunk) {
                const embeddingText = buildEmbeddingText(chunk);
                await this.index.addDocument(id, embeddingText);
            }
        }
    }

    /**
     * Start file watcher for external changes
     */
    private startWatcher(): void {
        const chunksDir = this.storage.getChunksDir();

        this.watcher = chokidar.watch(chunksDir, {
            persistent: true,
            ignoreInitial: true,
            depth: 0, // Only watch top-level files, ignore subdirectories
            ignored: /(^|[\/\\])\../, // Ignore dotfiles/dotfolders like .obsidian
            awaitWriteFinish: {
                stabilityThreshold: 500,
                pollInterval: 100,
            },
        });

        this.watcher.on('add', async (filePath) => {
            console.log(`File added externally: ${path.basename(filePath)}`);
            await this.handleFileChange(filePath);
        });

        this.watcher.on('change', async (filePath) => {
            console.log(`File changed externally: ${path.basename(filePath)}`);
            await this.handleFileChange(filePath);
        });

        this.watcher.on('unlink', async (filePath) => {
            console.log(`File deleted externally: ${path.basename(filePath)}`);
            await this.handleFileDelete(filePath);
        });
    }

    /**
     * Handle external file change/add
     */
    private async handleFileChange(filePath: string): Promise<void> {
        // Reload storage index
        await this.storage.reloadIndex();

        // Extract ID from filename
        const filename = path.basename(filePath);
        const id = filename.split('-')[0];
        if (!id || id.length !== 6) return;

        // Re-read and re-index the chunk
        const chunk = await this.storage.read(id);
        if (chunk) {
            const embeddingText = buildEmbeddingText(chunk);
            await this.index.updateDocument(id, embeddingText);
            await this.audit.log('RELOAD', id);
        }
    }

    /**
     * Handle external file deletion
     */
    private async handleFileDelete(filePath: string): Promise<void> {
        const filename = path.basename(filePath);
        const id = filename.split('-')[0];
        if (!id || id.length !== 6) return;

        await this.storage.reloadIndex();
        await this.index.removeDocument(id);
    }

    /**
     * Store a new chunk
     */
    async storeChunk(content: string, metadata: Partial<Chunk>): Promise<string> {
        // Validate required fields
        for (const field of REQUIRED_FIELDS) {
            if (!(field in metadata)) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        // Generate ID and apply defaults
        const id = this.storage.generateUniqueId();
        const defaults = getChunkDefaults();

        const chunk: Chunk = {
            ...defaults,
            ...metadata,
            id,
            content,
        } as Chunk;

        // Write to storage
        await this.storage.write(chunk);

        // Add to embedding index
        const embeddingText = buildEmbeddingText(chunk);
        await this.index.addDocument(id, embeddingText);

        // Audit log
        await this.audit.logStore(id, {
            summary: chunk.summary,
            type: chunk.type,
            epistemic: chunk.epistemic,
            surface_tags: chunk.surface_tags,
        });

        return id;
    }

    /**
     * Update an existing chunk
     */
    async updateChunk(id: string, metadata: Partial<Chunk>, content?: string): Promise<void> {
        const existing = await this.storage.read(id);
        if (!existing) {
            throw new Error(`Chunk not found: ${id}`);
        }

        // Merge updates
        const updated: Chunk = {
            ...existing,
            ...metadata,
            id, // Ensure ID doesn't change
            updated: new Date().toISOString(),
        };

        if (content !== undefined) {
            updated.content = content;
        }

        // Write to storage
        await this.storage.write(updated);

        // Update embedding index
        const embeddingText = buildEmbeddingText(updated);
        await this.index.updateDocument(id, embeddingText);

        // Audit log
        const changes: Record<string, unknown> = { ...metadata };
        if (content !== undefined) {
            changes.content = content.slice(0, 100) + (content.length > 100 ? '...' : '');
        }
        await this.audit.logUpdate(id, changes);
    }

    /**
     * Get chunks by IDs
     */
    async getChunks(ids: string[]): Promise<Chunk[]> {
        return this.storage.readMany(ids);
    }

    /**
     * Query for similar chunks (returns metadata only, no content)
     * Use getChunks() to retrieve full content for specific IDs
     */
    async query(searchText: string, limit: number = 10): Promise<ChunkMeta[]> {
        // Search in embedding index
        const results = await this.index.query(searchText, limit);
        const ids = results.map(r => r.id);

        if (ids.length === 0) {
            return [];
        }

        // Read full chunks
        const chunks = await this.storage.readMany(ids);

        // Update retrieved_count and accessed for each chunk
        const now = new Date().toISOString();
        for (const chunk of chunks) {
            chunk.retrieved_count++;
            chunk.accessed = now;
            await this.storage.write(chunk);
        }

        // Audit log
        await this.audit.logQuery(searchText, ids);
        await this.audit.logRetrieve(ids);

        // Return metadata only (strip content)
        return chunks.map(({ content, ...meta }) => meta);
    }

    /**
     * Mark chunks as relevant (increment relevant_count)
     */
    async markRelevant(ids: string[]): Promise<void> {
        const now = new Date().toISOString();

        for (const id of ids) {
            const chunk = await this.storage.read(id);
            if (chunk) {
                chunk.relevant_count++;
                chunk.last_relevant_date = now;
                await this.storage.write(chunk);
            }
        }

        await this.audit.logRelevant(ids);
    }

    /**
     * Mark a chunk as obsolete (set status to archived)
     */
    async markObsolete(id: string, reason: string): Promise<void> {
        const chunk = await this.storage.read(id);
        if (!chunk) {
            throw new Error(`Chunk not found: ${id}`);
        }

        chunk.status = 'archived';
        chunk.updated = new Date().toISOString();

        // Add reason to context_notes
        const obsoleteNote = `[Obsoleted: ${reason}]`;
        chunk.context_notes = chunk.context_notes
            ? `${chunk.context_notes}\n${obsoleteNote}`
            : obsoleteNote;

        await this.storage.write(chunk);
        await this.audit.logObsolete(id, reason);
    }

    /**
     * Get audit log
     */
    async getAuditLog(since?: string): Promise<string> {
        return this.audit.readSince(since);
    }

    /**
     * Shutdown the memory store
     */
    async shutdown(): Promise<void> {
        if (this.watcher) {
            await this.watcher.close();
            this.watcher = null;
        }
        this.initialized = false;
    }

    /**
     * Get stats about the memory store
     */
    getStats(): { chunkCount: number; indexedCount: number } {
        return {
            chunkCount: this.storage.getAllIds().length,
            indexedCount: this.index.getDocumentCount(),
        };
    }
}

// Singleton instance
let memoryStore: MemoryStore | null = null;

/**
 * Get or create the memory store instance
 */
export async function getMemoryStore(dataDir?: string): Promise<MemoryStore> {
    if (!memoryStore) {
        if (!dataDir) {
            throw new Error('dataDir required for first initialization');
        }
        console.log('Memory store opened for dataDir:', dataDir);
        memoryStore = new MemoryStore({ dataDir });
        await memoryStore.initialize();
    }
    return memoryStore;
}
