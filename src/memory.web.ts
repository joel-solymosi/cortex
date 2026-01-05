// Web API router for Memory Viewer

import express, { Router, Request, Response } from 'express';
import { getMemoryStore } from './memory.index';

export function createMemoryWebRouter(): Router {
    const router = express.Router();

    // API: List all chunks (minimal info for sidebar)
    router.get('/api/memory/chunks', async (_req: Request, res: Response) => {
        try {
            const store = await getMemoryStore();
            const chunks = await store.getAllChunks();

            // Return minimal info for sidebar listing
            const list = chunks.map(chunk => ({
                id: chunk.id,
                summary: chunk.summary,
                type: chunk.type,
                status: chunk.status,
            }));

            res.json(list);
        } catch (err) {
            console.error('Error listing chunks:', err);
            res.status(500).json({ error: 'Failed to list chunks' });
        }
    });

    // API: Get single chunk by ID
    router.get('/api/memory/chunks/:id', async (req: Request, res: Response) => {
        try {
            const store = await getMemoryStore();
            const chunks = await store.getChunks([req.params.id]);

            if (chunks.length === 0) {
                res.status(404).json({ error: 'Chunk not found' });
                return;
            }

            res.json(chunks[0]);
        } catch (err) {
            console.error('Error getting chunk:', err);
            res.status(500).json({ error: 'Failed to get chunk' });
        }
    });

    // API: Search chunks
    router.get('/api/memory/search', async (req: Request, res: Response) => {
        try {
            const query = req.query.q as string;
            if (!query || query.length < 3) {
                res.json([]);
                return;
            }

            const store = await getMemoryStore();
            // Query returns ChunkMeta (no content), so we need to get full chunks
            const metas = await store.query(query, 32, false);
            const ids = metas.map(m => m.id);
            const chunks = await store.getChunks(ids);

            res.json(chunks);
        } catch (err) {
            console.error('Error searching chunks:', err);
            res.status(500).json({ error: 'Failed to search chunks' });
        }
    });

    // Static file serving and SPA routes are now handled by packages/app

    return router;
}
