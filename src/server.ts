// Standalone server for Cortex memory system
// Provides MCP endpoint at /mcp/memory and web viewer at /memory

import dotenv from 'dotenv';
import { default as findConfig } from 'find-config';
dotenv.config({ path: findConfig('.env')! });

import path from 'path';
import { fileURLToPath } from 'url';
import express, { Request, Response } from 'express';
import cors from 'cors';
import compression from 'compression';
import bodyParser from 'body-parser';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { mcpServer } from './memory.mcp.js';
import { createMemoryWebRouter } from './memory.web.js';
import { getMemoryStore } from './memory.index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default data directory (relative to this file)
const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');

async function main() {
    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json());
    app.use(compression());
    app.use(bodyParser.json({ type: '*/*' }));
    app.set('json spaces', 2);

    // Initialize memory store
    console.log('Starting Cortex memory server...');
    await getMemoryStore(process.env.MEMORY_DATA_DIR || DEFAULT_DATA_DIR);

    // Mount web API router
    const webRouter = createMemoryWebRouter();
    app.use(webRouter);

    // Serve static files for web viewer
    const webDistDir = path.join(__dirname, '..', 'web', 'dist');
    const webIndexHtml = path.join(__dirname, '..', 'web', 'index.html');

    app.use('/memory', express.static(webDistDir));
    app.get('/memory', (_req: Request, res: Response) => {
        res.sendFile(webIndexHtml);
    });
    app.get('/memory/*', (_req: Request, res: Response) => {
        res.sendFile(webIndexHtml);
    });

    // MCP endpoint
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
    });
    mcpServer.connect(transport);

    app.post('/mcp/memory', async (req: Request, res: Response) => {
        console.log('Received MCP request:', req.body);
        try {
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            console.error('Error handling MCP request:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error',
                    },
                    id: null,
                });
            }
        }
    });

    // Start server
    const PORT = process.env.PORT || 8010;
    app.listen(PORT, () => {
        console.log(`Cortex server listening on port ${PORT}`);
        console.log(`  MCP endpoint: http://localhost:${PORT}/mcp/memory`);
        console.log(`  Web viewer:   http://localhost:${PORT}/memory`);
    });
}

main().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
