import { useState, useEffect } from 'preact/hooks';
import Router, { route } from 'preact-router';
import type { Chunk } from '../../src/memory.types';
import { Sidebar } from './components/Sidebar';
import { ChunkDetail } from './components/ChunkDetail';
import { SearchResults } from './components/SearchResults';
import './memory.css';

// Minimal chunk info for sidebar listing
export interface ChunkListItem {
    id: string;
    summary: string;
    type: string;
    status: string;
}

// Route component props from preact-router
interface RouteProps {
    path?: string;
    matches?: Record<string, string>;
}

function ListView(_props: RouteProps) {
    return (
        <div class="memory-no-selection">
            <h2>Select a chunk from the sidebar</h2>
            <p>Or navigate to /memory/[chunk-id] directly</p>
        </div>
    );
}

function ChunkView({ id }: RouteProps & { id?: string }) {
    const [chunk, setChunk] = useState<Chunk | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        setChunk(null);
        setError(null);

        fetch(`/api/memory/chunks/${id}`)
            .then(res => {
                if (!res.ok) throw new Error('Chunk not found');
                return res.json();
            })
            .then(data => setChunk(data))
            .catch(() => setError(`Failed to load chunk: ${id}`));
    }, [id]);

    if (error) return <div class="error-message">{error}</div>;
    if (!chunk) return <div class="memory-loading">Loading chunk...</div>;

    return <ChunkDetail chunk={chunk} />;
}

function SearchView({ q }: RouteProps & { q?: string }) {
    const [results, setResults] = useState<Chunk[]>([]);
    const [loading, setLoading] = useState(false);
    const query = q || '';

    useEffect(() => {
        if (query.length < 3) {
            setResults([]);
            return;
        }

        setLoading(true);
        fetch(`/api/memory/search?q=${encodeURIComponent(query)}`)
            .then(res => res.json())
            .then(data => {
                setResults(data);
                setLoading(false);
            })
            .catch(() => {
                setResults([]);
                setLoading(false);
            });
    }, [query]);

    return <SearchResults query={query} results={results} loading={loading} />;
}

export function MemoryApp() {
    const [chunks, setChunks] = useState<ChunkListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentPath, setCurrentPath] = useState(window.location.pathname);

    // Fetch chunk list
    useEffect(() => {
        fetch('/api/memory/chunks')
            .then(res => res.json())
            .then(data => {
                setChunks(data);
                setLoading(false);
            })
            .catch(() => {
                setError('Failed to load chunks');
                setLoading(false);
            });
    }, []);

    // Get selected chunk ID from current path
    const getSelectedId = () => {
        const match = currentPath.match(/\/memory\/([a-f0-9]{6})/);
        return match ? match[1] : null;
    };

    const handleRouteChange = (e: { url: string }) => {
        setCurrentPath(e.url.split('?')[0]);
    };

    const handleSearch = (query: string) => {
        route(`/memory/search?q=${encodeURIComponent(query)}`);
    };

    if (loading) {
        return (
            <div class="app-container">
                <div class="memory-loading">Loading memory chunks...</div>
            </div>
        );
    }

    return (
        <div class="app-container">
            <Sidebar
                chunks={chunks}
                selectedId={getSelectedId()}
                onSearch={handleSearch}
            />
            <main class="memory-main-content">
                {error && <div class="error-message">{error}</div>}
                <Router onChange={handleRouteChange}>
                    <ListView path="/memory" />
                    <SearchView path="/memory/search" />
                    <ChunkView path="/memory/:id" />
                </Router>
            </main>
        </div>
    );
}
