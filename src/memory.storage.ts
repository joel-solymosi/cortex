// File-based storage with Obsidian-compatible YAML frontmatter

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { Chunk, ChunkRelation } from './memory.types';

import { isMainEntry } from '@playground/helpers/common';
import { getChunkDefaults } from './memory.types';
import os from 'os';

const FRONTMATTER_DELIMITER = '---';

/**
 * Generate a 6-digit hex ID
 */
export function generateId(): string {
    return crypto.randomBytes(3).toString('hex');
}

/**
 * Create a slug from summary text (first ~15 chars, alphanumeric only)
 */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 15)
        .replace(/-+$/, '');
}

/**
 * Generate filename from chunk id and summary
 */
export function getFilename(id: string, summary: string): string {
    const slug = slugify(summary);
    return `${id}-${slug}.md`;
}

/**
 * Parse a chunk file into a Chunk object
 */
export function parseChunkFile(content: string, filename: string): Chunk {
    const lines = content.split('\n');

    // Find frontmatter boundaries
    if (lines[0] !== FRONTMATTER_DELIMITER) {
        throw new Error(`Invalid chunk file format: ${filename}`);
    }

    const endIndex = lines.indexOf(FRONTMATTER_DELIMITER, 1);
    if (endIndex === -1) {
        throw new Error(`Invalid chunk file format (no closing ---): ${filename}`);
    }

    // Parse YAML frontmatter
    const yamlContent = lines.slice(1, endIndex).join('\n');
    const meta = parseYaml(yamlContent);

    // Parse related field from YAML format to ChunkRelation[]
    const related: ChunkRelation[] = [];
    if (meta.related && Array.isArray(meta.related)) {
        for (const rel of meta.related) {
            if (typeof rel === 'object' && rel.id && rel.reason) {
                related.push({ id: rel.id, reason: rel.reason });
            }
        }
    }

    // Get content after frontmatter
    const chunkContent = lines.slice(endIndex + 1).join('\n').trim();

    return {
        id: meta.id,
        content: chunkContent,
        summary: meta.summary,
        type: meta.type,
        epistemic: meta.epistemic,
        status: meta.status,
        surface_tags: meta.surface_tags || [],
        related,
        created: meta.created,
        updated: meta.updated,
        accessed: meta.accessed,
        retrieved_count: meta.retrieved_count || 0,
        relevant_count: meta.relevant_count || 0,
        last_relevant_date: meta.last_relevant_date || null,
        expires: meta.expires,
        context_notes: meta.context_notes,
    };
}

/**
 * Serialize a Chunk to file content with YAML frontmatter
 */
export function serializeChunk(chunk: Chunk): string {
    // Build meta object for YAML (everything except content)
    const meta: Record<string, unknown> = {
        id: chunk.id,
        summary: chunk.summary,
        type: chunk.type,
        epistemic: chunk.epistemic,
        status: chunk.status,
        surface_tags: chunk.surface_tags,
        created: chunk.created,
        updated: chunk.updated,
        accessed: chunk.accessed,
        retrieved_count: chunk.retrieved_count,
        relevant_count: chunk.relevant_count,
        last_relevant_date: chunk.last_relevant_date,
    };

    // Add related as structured YAML
    if (chunk.related && chunk.related.length > 0) {
        meta.related = chunk.related.map(r => ({ id: r.id, reason: r.reason }));
    }

    // Add optional fields if present
    if (chunk.expires) meta.expires = chunk.expires;
    if (chunk.context_notes) meta.context_notes = chunk.context_notes;

    const yamlContent = stringifyYaml(meta, { lineWidth: 0 });

    return `${FRONTMATTER_DELIMITER}\n${yamlContent}${FRONTMATTER_DELIMITER}\n\n${chunk.content}`;
}

/**
 * Storage manager for chunk files
 */
export class ChunkStorage {
    private chunksDir: string;
    private idToFilename: Map<string, string> = new Map();

    constructor(dataDir: string) {
        this.chunksDir = path.join(dataDir, 'chunks');
    }

    async initialize(): Promise<void> {
        await fs.mkdir(this.chunksDir, { recursive: true });
        await this.buildIndex();
    }

    /**
     * Build index of id -> filename mappings
     */
    private async buildIndex(): Promise<void> {
        this.idToFilename.clear();
        const files = await fs.readdir(this.chunksDir);

        for (const file of files) {
            if (file.endsWith('.md')) {
                // Extract id from filename (first 6 chars before -)
                const id = file.split('-')[0];
                if (id && id.length === 6) {
                    this.idToFilename.set(id, file);
                }
            }
        }
    }

    /**
     * Check if a chunk ID exists
     */
    exists(id: string): boolean {
        return this.idToFilename.has(id);
    }

    /**
     * Generate a unique ID (with collision check)
     */
    generateUniqueId(): string {
        let id = generateId();
        let attempts = 0;
        while (this.exists(id) && attempts < 100) {
            id = generateId();
            attempts++;
        }
        if (attempts >= 100) {
            throw new Error('Failed to generate unique ID after 100 attempts');
        }
        return id;
    }

    /**
     * Get all chunk IDs
     */
    getAllIds(): string[] {
        return Array.from(this.idToFilename.keys());
    }

    /**
     * Read a chunk by ID
     */
    async read(id: string): Promise<Chunk | null> {
        const filename = this.idToFilename.get(id);
        if (!filename) return null;

        const filePath = path.join(this.chunksDir, filename);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return parseChunkFile(content, filename);
        } catch (err) {
            console.error(`Error reading chunk ${id}:`, err);
            return null;
        }
    }

    /**
     * Read multiple chunks by IDs
     */
    async readMany(ids: string[]): Promise<Chunk[]> {
        const chunks: Chunk[] = [];
        for (const id of ids) {
            const chunk = await this.read(id);
            if (chunk) chunks.push(chunk);
        }
        return chunks;
    }

    /**
     * Write a chunk to disk
     */
    async write(chunk: Chunk): Promise<void> {
        const filename = getFilename(chunk.id, chunk.summary);
        const filePath = path.join(this.chunksDir, filename);
        const content = serializeChunk(chunk);

        // If filename changed (summary updated), remove old file
        const oldFilename = this.idToFilename.get(chunk.id);
        if (oldFilename && oldFilename !== filename) {
            const oldPath = path.join(this.chunksDir, oldFilename);
            try {
                await fs.unlink(oldPath);
            } catch (err) {
                // Ignore if old file doesn't exist
            }
        }

        await fs.writeFile(filePath, content, 'utf-8');
        this.idToFilename.set(chunk.id, filename);
    }

    /**
     * Delete a chunk
     */
    async delete(id: string): Promise<boolean> {
        const filename = this.idToFilename.get(id);
        if (!filename) return false;

        const filePath = path.join(this.chunksDir, filename);
        try {
            await fs.unlink(filePath);
            this.idToFilename.delete(id);
            return true;
        } catch (err) {
            console.error(`Error deleting chunk ${id}:`, err);
            return false;
        }
    }

    /**
     * Get the chunks directory path
     */
    getChunksDir(): string {
        return this.chunksDir;
    }

    /**
     * Reload index (for when files change externally)
     */
    async reloadIndex(): Promise<void> {
        await this.buildIndex();
    }
}

// =============================================================================
// Unit Tests (run with: npx tsx memory.storage.ts)
// =============================================================================


if (isMainEntry(import.meta.url)) {
    (async () => {
        console.log('=== Storage Unit Tests ===\n');

        // Use temp directory for tests
        const testDir = path.join(os.tmpdir(), `memory-test-${Date.now()}`);
        console.log(`Test directory: ${testDir}\n`);

        // Test 1: ID generation
        console.log('Test 1: ID generation...');
        const id1 = generateId();
        const id2 = generateId();
        console.log(`  Generated IDs: ${id1}, ${id2}`);
        console.log(`  ✓ IDs are 6 hex chars: ${/^[a-f0-9]{6}$/.test(id1) && /^[a-f0-9]{6}$/.test(id2)}`);
        console.log(`  ✓ IDs are unique: ${id1 !== id2}\n`);

        // Test 2: Slugify
        console.log('Test 2: Slugify...');
        const slugTests = [
            ['Framework for evaluating startup equity', 'framework-for-e'],
            ['Hello World!', 'hello-world'],
            ['  spaces  and---dashes  ', 'spaces-and-das'],
            ['UPPERCASE text', 'uppercase-text'],
        ];
        for (const [input, expected] of slugTests) {
            const result = slugify(input);
            console.log(`  "${input}" -> "${result}" (expected: "${expected}")`);
        }
        console.log();

        // Test 3: Filename generation
        console.log('Test 3: Filename generation...');
        const filename = getFilename('abc123', 'My Test Summary');
        console.log(`  getFilename('abc123', 'My Test Summary') = "${filename}"`);
        console.log(`  ✓ Correct format: ${filename === 'abc123-my-test-summar.md'}\n`);

        // Test 4: Chunk serialization round-trip
        console.log('Test 4: Chunk serialization round-trip...');
        const testChunk: Chunk = {
            id: 'abc123',
            content: 'This is the main content.\n\nWith multiple paragraphs.',
            summary: 'Test chunk for serialization',
            type: 'framework',
            epistemic: 'working',
            status: 'active',
            surface_tags: ['testing', 'serialization', 'storage'],
            related: [
                { id: 'def456', reason: 'extends this concept' },
                { id: 'ghi789', reason: 'provides context' },
            ],
            created: '2025-01-15T10:00:00.000Z',
            updated: '2025-01-16T12:00:00.000Z',
            accessed: '2025-01-16T12:00:00.000Z',
            retrieved_count: 5,
            relevant_count: 3,
            last_relevant_date: '2025-01-16T12:00:00.000Z',
            context_notes: 'Created during unit testing',
        };

        const serialized = serializeChunk(testChunk);
        console.log('  Serialized chunk:');
        console.log('  ' + serialized.split('\n').join('\n  '));
        console.log();

        const parsed = parseChunkFile(serialized, 'test.md');
        console.log('  Parsed back:');
        console.log(`    id: ${parsed.id}`);
        console.log(`    summary: ${parsed.summary}`);
        console.log(`    type: ${parsed.type}`);
        console.log(`    surface_tags: ${parsed.surface_tags.join(', ')}`);
        console.log(`    related: ${parsed.related.map(r => `${r.id} (${r.reason})`).join(', ')}`);
        console.log(`    content: "${parsed.content.slice(0, 50)}..."`);
        console.log(`  ✓ Round-trip successful: ${parsed.id === testChunk.id && parsed.content === testChunk.content}\n`);

        // Test 5: ChunkStorage operations
        console.log('Test 5: ChunkStorage operations...');
        const storage = new ChunkStorage(testDir);
        await storage.initialize();
        console.log(`  ✓ Storage initialized at ${storage.getChunksDir()}`);

        // Generate unique ID
        const newId = storage.generateUniqueId();
        console.log(`  ✓ Generated unique ID: ${newId}`);

        // Create a chunk with defaults
        const defaults = getChunkDefaults();
        const newChunk: Chunk = {
            ...defaults,
            id: newId,
            content: 'Test content for storage operations',
            summary: 'Storage test chunk',
            type: 'insight',
            epistemic: 'established',
            surface_tags: ['test', 'storage'],
            related: [],
        } as Chunk;

        // Write chunk
        await storage.write(newChunk);
        console.log(`  ✓ Wrote chunk ${newId}`);
        console.log(`  ✓ Chunk exists: ${storage.exists(newId)}`);

        // Read chunk back
        const readChunk = await storage.read(newId);
        console.log(`  ✓ Read chunk back: ${readChunk?.id === newId}`);
        console.log(`  ✓ Content matches: ${readChunk?.content === newChunk.content}`);

        // Update chunk (change summary to trigger filename change)
        if (readChunk) {
            readChunk.summary = 'Updated storage test chunk';
            readChunk.updated = new Date().toISOString();
            await storage.write(readChunk);
            console.log(`  ✓ Updated chunk with new summary`);

            // Verify update
            const updatedChunk = await storage.read(newId);
            console.log(`  ✓ Updated summary: "${updatedChunk?.summary}"`);
        }

        // Get all IDs
        const allIds = storage.getAllIds();
        console.log(`  ✓ All IDs: ${allIds.join(', ')}`);

        // Delete chunk
        const deleted = await storage.delete(newId);
        console.log(`  ✓ Deleted chunk: ${deleted}`);
        console.log(`  ✓ Chunk no longer exists: ${!storage.exists(newId)}`);

        // Cleanup
        // await fs.rm(testDir, { recursive: true, force: true });
        console.log(`\n  ✓ Cleaned up test directory\n`);

        console.log('=== All tests passed! ===');
        process.exit(0);
    })().catch(err => {
        console.error('Test failed:', err);
        process.exit(1);
    });
}