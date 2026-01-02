// Web API router for Memory Viewer

import express, { Router, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getMemoryStore } from './memory.index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

    // Serve static files from web/dist (JS, CSS)
    const distPath = path.join(__dirname, '..', 'web', 'dist');
    router.use('/memory', express.static(distPath));

    // Serve index.html for SPA routing
    const indexPath = path.join(__dirname, '..', 'web', 'index.html');

    // Main memory viewer page
    router.get('/memory', (_req: Request, res: Response) => {
        res.sendFile(indexPath);
    });

    // SPA catch-all for chunk IDs (validate 6-char hex in handler)
    router.get('/memory/:id', (req: Request, res: Response, next) => {
        const id = req.params.id;
        // Only serve index.html for valid 6-char hex chunk IDs
        if (/^[a-f0-9]{6}$/.test(id)) {
            res.sendFile(indexPath);
        } else {
            next();
        }
    });

    return router;
}
