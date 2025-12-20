import fs from 'fs/promises';
import path from 'path';
import SemanticIndex from './embedding';
import { fileURLToPath } from "url";
import { watchFile, unwatchFile } from 'fs';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const exclude = ['c', 'h']; // horny & control tags
// const exclude = []; // horny & control tags

let semanticIndex = new SemanticIndex({ maxElements: 10000 }); // increase 

const filename = path.join(path.basename(__filename), '..', '..', 'diary', 'memories.md');
let content: string[] = [];

async function loadFromFile(filePath: string) {
    content = [];
    const data = await fs.readFile(filePath, 'utf-8');
    const lines = data.split('\n').filter(line => line);
    for (const line of lines) {
        // if it starts with [1-3 letters] + ',' read as tag and exclude if in exclude list
        const tagMatch = line.match(/^([a-z]{1,3}),/);
        if (tagMatch && exclude.includes(tagMatch[1])) {
            continue;
        }

        await semanticIndex.addDocument(content.length, line);
        content.push(line);
    }
    console.log(`Loaded ${content.length} memories from file.`);
}

export async function writeMemory(memory: string) {
    const line = (new Date()).toISOString().substring(0,10) + '\t ' + memory;
    await fs.appendFile(filename, '\n' + line + '\n');
    await semanticIndex.addDocument(content.length, line);
    content.push(line);
}

export async function searchMemories(query: string) {
    const result = await semanticIndex.query(query, 5);
    return result;
}

export async function getLatestMemories(count: number = 5) {
    const lines = content.slice(-count);
    return lines;
}

export async function sampleMemories(count: number = 5) {
    const sampled: string[] = [];
    for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * content.length);
        sampled.push(content[idx]);
    }
    return sampled;
}

function startFileWatcher(filePath: string) {
    watchFile(filePath, { interval: 1000 }, async (curr, prev) => {
        if (curr.size === prev.size) return;
            console.log('Watcher: file truncated, reloading index.');
                await semanticIndex.reset();
                await loadFromFile(filePath);
            });
}

export async function initialize() {
    try {
        await semanticIndex.init();
        // Process the vault into chunks.
        await loadFromFile(filename);
        await startFileWatcher(filename);
    } catch (error) {
        console.error('Error processing vault:', error);
    }
}


if (
    fileURLToPath(import.meta.url).toLowerCase() ===
    path.resolve(process.argv[1]).toLowerCase()
) {
    (async () => {
        try {
            console.log('--- Chunker Test Case ---');
            await initialize();
            if (process.argv[2] === 'sample') {
                const result = await sampleMemories(10);
                console.log('Sampled memories:', result);
                process.exit(0);
            } else if (process.argv[2] === 'latest') {
                const result = await getLatestMemories(5);
                console.log('Latest memories:', result);
                process.exit(0);
            } else if (process.argv[2] === 'search' && process.argv[3]) {
                const query = process.argv.slice(3).join(' ');
                const result = await searchMemories(query);
                console.log(`Search result for "${query}":`, result);
                process.exit(0);
            }
            const result = await semanticIndex.query("compersion");
            console.log('Query result for "happy":', result);
            // const result = await sampleMemories(5);
            // console.log('Query result:', result);
            process.exit(0);
        } catch (error) {
            console.error('Error in Chunker test case:', error);
        }
    })();
}

