import express, { Request, Response } from "express";
import compression from 'compression';
import bodyParser from 'body-parser';
import path from 'path';

import { mcpServer } from './diary';
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { fileURLToPath } from "url";
import { initialize } from "./chunker";


const app = express();
app.use(express.json());
app.use(compression()) // use gzip for all requests
app.use(bodyParser.json({ type: "*/*" }));
app.set('json spaces', 2);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // set to undefined for stateless servers
});


const setupServer = async () => {
    await initialize();
    await mcpServer.connect(transport);
};


app.post('/mcp', async (req: Request, res: Response) => {
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

app.get(['/', '/:a'], (req, res) => {
    console.log(`Unknown route: ${req.path}`);
    res.status(404).send('Not Found');
});

const PORT = process.env.PORT || 8010;


async function main() {
    setupServer().then(() => {
        app.listen(PORT, () => {
            console.log(`MCP Streamable HTTP Server listening on port ${PORT}`);
        });
    }).catch(error => {
        console.error('Failed to set up the server:', error);
        process.exit(1);
    });
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
