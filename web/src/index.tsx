import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import './index.css';

interface ChunkRelation {
    id: string;
    reason: string;
}

interface Chunk {
    id: string;
    content: string;
    summary: string;
    type: string;
    epistemic: string;
    status: string;
    surface_tags: string[];
    related: ChunkRelation[];
    created: string;
    updated: string;
    accessed: string;
    retrieved_count: number;
    relevant_count: number;
    last_relevant_date: string | null;
    expires?: string;
    context_notes?: string;
}

interface ChunkListItem {
    id: string;
    summary: string;
    type: string;
    status: string;
}

function App() {
    const [chunks, setChunks] = useState<ChunkListItem[]>([]);
    const [selectedChunk, setSelectedChunk] = useState<Chunk | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Parse URL on mount and handle browser navigation
    useEffect(() => {
        const handleUrl = () => {
            const path = window.location.pathname;
            const match = path.match(/\/memory\/([a-f0-9]{6})/);
            if (match) {
                setSelectedId(match[1]);
            } else {
                setSelectedId(null);
                setSelectedChunk(null);
            }
        };

        handleUrl();
        window.addEventListener('popstate', handleUrl);
        return () => window.removeEventListener('popstate', handleUrl);
    }, []);

    // Fetch chunk list
    useEffect(() => {
        fetch('/api/memory/chunks')
            .then(res => res.json())
            .then(data => {
                setChunks(data);
                setLoading(false);
            })
            .catch(err => {
                setError('Failed to load chunks');
                setLoading(false);
            });
    }, []);

    // Fetch selected chunk details
    useEffect(() => {
        if (!selectedId) return;

        fetch(`/api/memory/chunks/${selectedId}`)
            .then(res => {
                if (!res.ok) throw new Error('Chunk not found');
                return res.json();
            })
            .then(data => setSelectedChunk(data))
            .catch(err => {
                setError(`Failed to load chunk: ${selectedId}`);
                setSelectedChunk(null);
            });
    }, [selectedId]);

    const navigateToChunk = (id: string) => {
        setSelectedId(id);
        window.history.pushState({}, '', `/memory/${id}`);
    };

    const navigateToList = () => {
        setSelectedId(null);
        setSelectedChunk(null);
        window.history.pushState({}, '', '/memory');
    };

    const formatDate = (iso: string) => {
        const date = new Date(iso);
        return date.toLocaleString();
    };

    const getTypeColor = (type: string) => {
        const colors: Record<string, string> = {
            framework: '#9b6bff',
            insight: '#6b9fff',
            fact: '#6bff9f',
            log: '#888',
            emotional: '#ff9b6b',
            goal: '#ff6b9b',
            question: '#ffff6b',
        };
        return colors[type] || '#888';
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            active: '#6bff9f',
            dormant: '#888',
            review: '#ffff6b',
            archived: '#ff6b6b',
        };
        return colors[status] || '#888';
    };

    const getEpistemicColor = (epistemic: string) => {
        const colors: Record<string, string> = {
            established: '#6bff9f',
            working: '#6b9fff',
            speculative: '#ffff6b',
            deprecated: '#ff6b6b',
        };
        return colors[epistemic] || '#888';
    };

    if (loading) {
        return (
            <div class="app-container">
                <div class="loading">Loading memory chunks...</div>
            </div>
        );
    }

    return (
        <div class="app-container">
            <aside class="sidebar">
                <header class="sidebar-header">
                    <h1 onClick={navigateToList} style={{ cursor: 'pointer' }}>Memory Viewer</h1>
                    <span class="chunk-count">{chunks.length} chunks</span>
                </header>
                <div class="chunk-list">
                    {chunks.map(chunk => (
                        <div
                            key={chunk.id}
                            class={`chunk-item ${selectedId === chunk.id ? 'selected' : ''}`}
                            onClick={() => navigateToChunk(chunk.id)}
                        >
                            <div class="chunk-item-header">
                                <span class="chunk-id">{chunk.id}</span>
                                <span
                                    class="chunk-type"
                                    style={{ color: getTypeColor(chunk.type) }}
                                >
                                    {chunk.type}
                                </span>
                            </div>
                            <div class="chunk-summary">{chunk.summary}</div>
                            <span
                                class="chunk-status"
                                style={{ color: getStatusColor(chunk.status) }}
                            >
                                {chunk.status}
                            </span>
                        </div>
                    ))}
                </div>
            </aside>
            <main class="main-content">
                {error && <div class="error-message">{error}</div>}
                {!selectedChunk && !error && (
                    <div class="no-selection">
                        <h2>Select a chunk from the sidebar</h2>
                        <p>Or navigate to /memory/[chunk-id] directly</p>
                    </div>
                )}
                {selectedChunk && (
                    <article class="chunk-detail">
                        <header class="chunk-detail-header">
                            <h2>{selectedChunk.summary}</h2>
                            <span class="chunk-id-large">{selectedChunk.id}</span>
                        </header>

                        <section class="meta-section">
                            <h3>Classification</h3>
                            <div class="meta-grid">
                                <div class="meta-item">
                                    <span class="meta-label">Type</span>
                                    <span
                                        class="meta-value badge"
                                        style={{ backgroundColor: getTypeColor(selectedChunk.type) + '33', color: getTypeColor(selectedChunk.type) }}
                                    >
                                        {selectedChunk.type}
                                    </span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">Epistemic</span>
                                    <span
                                        class="meta-value badge"
                                        style={{ backgroundColor: getEpistemicColor(selectedChunk.epistemic) + '33', color: getEpistemicColor(selectedChunk.epistemic) }}
                                    >
                                        {selectedChunk.epistemic}
                                    </span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">Status</span>
                                    <span
                                        class="meta-value badge"
                                        style={{ backgroundColor: getStatusColor(selectedChunk.status) + '33', color: getStatusColor(selectedChunk.status) }}
                                    >
                                        {selectedChunk.status}
                                    </span>
                                </div>
                            </div>
                        </section>

                        <section class="meta-section">
                            <h3>Tags</h3>
                            <div class="tags">
                                {selectedChunk.surface_tags.map(tag => (
                                    <span key={tag} class="tag">{tag}</span>
                                ))}
                                {selectedChunk.surface_tags.length === 0 && (
                                    <span class="no-tags">No tags</span>
                                )}
                            </div>
                        </section>

                        {selectedChunk.related.length > 0 && (
                            <section class="meta-section">
                                <h3>Related Chunks</h3>
                                <div class="related-list">
                                    {selectedChunk.related.map(rel => (
                                        <div
                                            key={rel.id}
                                            class="related-item"
                                            onClick={() => navigateToChunk(rel.id)}
                                        >
                                            <span class="related-id">{rel.id}</span>
                                            <span class="related-reason">{rel.reason}</span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        <section class="meta-section">
                            <h3>Timestamps</h3>
                            <div class="meta-grid">
                                <div class="meta-item">
                                    <span class="meta-label">Created</span>
                                    <span class="meta-value">{formatDate(selectedChunk.created)}</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">Updated</span>
                                    <span class="meta-value">{formatDate(selectedChunk.updated)}</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">Accessed</span>
                                    <span class="meta-value">{formatDate(selectedChunk.accessed)}</span>
                                </div>
                                {selectedChunk.expires && (
                                    <div class="meta-item">
                                        <span class="meta-label">Expires</span>
                                        <span class="meta-value">{formatDate(selectedChunk.expires)}</span>
                                    </div>
                                )}
                            </div>
                        </section>

                        <section class="meta-section">
                            <h3>Metrics</h3>
                            <div class="meta-grid">
                                <div class="meta-item">
                                    <span class="meta-label">Retrieved</span>
                                    <span class="meta-value">{selectedChunk.retrieved_count} times</span>
                                </div>
                                <div class="meta-item">
                                    <span class="meta-label">Marked Relevant</span>
                                    <span class="meta-value">{selectedChunk.relevant_count} times</span>
                                </div>
                                {selectedChunk.last_relevant_date && (
                                    <div class="meta-item">
                                        <span class="meta-label">Last Relevant</span>
                                        <span class="meta-value">{formatDate(selectedChunk.last_relevant_date)}</span>
                                    </div>
                                )}
                            </div>
                        </section>

                        {selectedChunk.context_notes && (
                            <section class="meta-section">
                                <h3>Context Notes</h3>
                                <div class="context-notes">{selectedChunk.context_notes}</div>
                            </section>
                        )}

                        <section class="content-section">
                            <h3>Content</h3>
                            <div class="chunk-content">{selectedChunk.content}</div>
                        </section>
                    </article>
                )}
            </main>
        </div>
    );
}

render(<App />, document.getElementById('root')!);
