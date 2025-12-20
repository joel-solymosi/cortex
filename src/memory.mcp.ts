// MCP server for memory system

import path from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { isMainEntry } from '@playground/helpers/common';
import { createServer } from '@playground/mcp-core';
import { getMemoryStore } from './memory.index';
import { ChunkType, EpistemicStatus, LifecycleStatus } from './memory.types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default data directory (relative to this file)
const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');

// Zod schemas for validation
const ChunkTypeSchema = z.enum(['framework', 'insight', 'fact', 'log', 'emotional', 'goal', 'question']);
const EpistemicStatusSchema = z.enum(['established', 'working', 'speculative', 'deprecated']);
const LifecycleStatusSchema = z.enum(['active', 'dormant', 'review', 'archived']);

const ChunkRelationSchema = z.object({
    id: z.string(),
    reason: z.string(),
});

const ChunkMetadataSchema = z.object({
    summary: z.string().describe('1-2 sentence summary for quick scanning'),
    type: ChunkTypeSchema.describe('Type of content: framework, insight, fact, log, emotional, goal, question'),
    epistemic: EpistemicStatusSchema.describe('Confidence level: established, working, speculative, deprecated'),
    status: LifecycleStatusSchema.optional().describe('Lifecycle status (defaults to active)'),
    surface_tags: z.array(z.string()).describe('Free-form tags for retrieval - complete the sentence "Surface this when discussing ___"'),
    related: z.array(ChunkRelationSchema).optional().describe('Related chunks with reasons'),
    expires: z.string().optional().describe('ISO date when content expires'),
    context_notes: z.string().optional().describe('Why this was created, from what conversation'),
});

// Create MCP server
export const mcpServer = new McpServer({
    name: 'memory MCP server',
    version: '1.0.0',
});

// Initialize memory store lazily
let storeInitialized = false;
async function ensureStore() {
    if (!storeInitialized) {
        await getMemoryStore(process.env.MEMORY_DATA_DIR || DEFAULT_DATA_DIR);
        storeInitialized = true;
    }
    return getMemoryStore();
}

// Helper to format chunk for response
function formatChunk(chunk: any): string {
    return JSON.stringify(chunk, null, 2);
}

function formatChunks(chunks: any[]): string {
    return JSON.stringify(chunks, null, 2);
}

// ============================================================================
// MCP Tools
// ============================================================================

mcpServer.tool(
    'store_chunk',
    'Store a new memory chunk. Returns the generated chunk ID.',
    {
        content: z.string().describe('The main content of the chunk'),
        metadata: ChunkMetadataSchema.describe('Chunk metadata including summary, type, epistemic status, and surface tags'),
    },
    async ({ content, metadata }): Promise<CallToolResult> => {
        try {
            const store = await ensureStore();
            const id = await store.storeChunk(content, metadata);

            return {
                content: [{
                    type: 'text',
                    text: `Chunk stored successfully with ID: ${id}`,
                }],
                structuredContent: { id, success: true },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: 'text', text: `Error storing chunk: ${message}` }],
                isError: true,
            };
        }
    }
);

mcpServer.tool(
    'update_chunk',
    'Update an existing memory chunk. Can update metadata, content, or both.',
    {
        id: z.string().describe('The 6-character hex ID of the chunk to update'),
        metadata: ChunkMetadataSchema.partial().optional().describe('Metadata fields to update'),
        content: z.string().optional().describe('New content (if updating content)'),
    },
    async ({ id, metadata, content }): Promise<CallToolResult> => {
        try {
            const store = await ensureStore();
            await store.updateChunk(id, metadata || {}, content);

            return {
                content: [{
                    type: 'text',
                    text: `Chunk ${id} updated successfully.`,
                }],
                structuredContent: { id, success: true },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: 'text', text: `Error updating chunk: ${message}` }],
                isError: true,
            };
        }
    }
);

mcpServer.tool(
    'get_chunks',
    'Retrieve full chunks by their IDs.',
    {
        ids: z.array(z.string()).describe('Array of chunk IDs to retrieve'),
    },
    async ({ ids }): Promise<CallToolResult> => {
        try {
            const store = await ensureStore();
            const chunks = await store.getChunks(ids);

            return {
                content: [{
                    type: 'text',
                    text: formatChunks(chunks),
                }],
                structuredContent: { chunks, count: chunks.length },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: 'text', text: `Error retrieving chunks: ${message}` }],
                isError: true,
            };
        }
    }
);

mcpServer.tool(
    'query',
    'Semantic search for relevant chunks. Returns metadata only (no content). Automatically increments retrieved_count.',
    {
        search_text: z.string().describe('The search query text'),
        limit: z.number().optional().default(10).describe('Maximum number of results (default 10)'),
    },
    async ({ search_text, limit }): Promise<CallToolResult> => {
        try {
            const store = await ensureStore();
            const chunks = await store.query(search_text, limit);

            return {
                content: [{
                    type: 'text',
                    text: formatChunks(chunks),
                }],
                structuredContent: { chunks, count: chunks.length, query: search_text },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: 'text', text: `Error querying chunks: ${message}` }],
                isError: true,
            };
        }
    }
);

mcpServer.tool(
    'mark_relevant_chunks',
    'Mark chunks as relevant (cited/used). Increments relevant_count and updates last_relevant_date.',
    {
        ids: z.array(z.string()).describe('Array of chunk IDs that were relevant'),
    },
    async ({ ids }): Promise<CallToolResult> => {
        try {
            const store = await ensureStore();
            await store.markRelevant(ids);

            return {
                content: [{
                    type: 'text',
                    text: `Marked ${ids.length} chunk(s) as relevant: ${ids.join(', ')}`,
                }],
                structuredContent: { ids, success: true },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: 'text', text: `Error marking chunks relevant: ${message}` }],
                isError: true,
            };
        }
    }
);

mcpServer.tool(
    'mark_obsolete',
    'Mark a chunk as obsolete (archived). Sets status to archived and records the reason.',
    {
        id: z.string().describe('The chunk ID to mark as obsolete'),
        reason: z.string().describe('Reason for obsolescence (e.g., "superseded by chunk xyz", "no longer relevant")'),
    },
    async ({ id, reason }): Promise<CallToolResult> => {
        try {
            const store = await ensureStore();
            await store.markObsolete(id, reason);

            return {
                content: [{
                    type: 'text',
                    text: `Chunk ${id} marked as obsolete. Reason: ${reason}`,
                }],
                structuredContent: { id, reason, success: true },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: 'text', text: `Error marking chunk obsolete: ${message}` }],
                isError: true,
            };
        }
    }
);

mcpServer.tool(
    'get_audit_log',
    'Retrieve the audit log of memory operations.',
    {
        since: z.string().optional().describe('ISO timestamp to filter entries from (optional)'),
    },
    async ({ since }): Promise<CallToolResult> => {
        try {
            const store = await ensureStore();
            const log = await store.getAuditLog(since);

            return {
                content: [{
                    type: 'text',
                    text: log || '(no entries)',
                }],
                structuredContent: { log, hasEntries: !!log },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: 'text', text: `Error retrieving audit log: ${message}` }],
                isError: true,
            };
        }
    }
);

mcpServer.tool(
    'memory_stats',
    'Get statistics about the memory store.',
    {},
    async (): Promise<CallToolResult> => {
        try {
            const store = await ensureStore();
            const stats = store.getStats();

            return {
                content: [{
                    type: 'text',
                    text: `Memory store stats:\n- Chunks: ${stats.chunkCount}\n- Indexed: ${stats.indexedCount}`,
                }],
                structuredContent: stats,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: 'text', text: `Error getting stats: ${message}` }],
                isError: true,
            };
        }
    }
);

// ============================================================================
// Main entry point
// ============================================================================

if (isMainEntry(import.meta.url)) {
    (async () => {
        // Pre-initialize the memory store
        console.log('Starting memory MCP server...');
        await ensureStore();
        await createServer({ 'memory': mcpServer });
    })();
}
