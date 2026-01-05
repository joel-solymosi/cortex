import type { Chunk } from '../../../src/memory.types';
import { getTypeColor, getStatusColor, getEpistemicColor, formatDate } from './MemoryStyles';

interface ChunkDetailProps {
    chunk: Chunk;
}

export function ChunkDetail({ chunk }: ChunkDetailProps) {
    return (
        <article class="memory-chunk-detail">
            <header class="memory-chunk-detail-header">
                <h2>{chunk.summary}</h2>
                <span class="memory-chunk-id-large">{chunk.id}</span>
            </header>

            <section class="memory-meta-section">
                <h3>Classification</h3>
                <div class="memory-meta-grid">
                    <div class="memory-meta-item">
                        <span class="memory-meta-label">Type</span>
                        <span
                            class="memory-meta-value memory-badge"
                            style={{ backgroundColor: getTypeColor(chunk.type) + '33', color: getTypeColor(chunk.type) }}
                        >
                            {chunk.type}
                        </span>
                    </div>
                    <div class="memory-meta-item">
                        <span class="memory-meta-label">Epistemic</span>
                        <span
                            class="memory-meta-value memory-badge"
                            style={{ backgroundColor: getEpistemicColor(chunk.epistemic) + '33', color: getEpistemicColor(chunk.epistemic) }}
                        >
                            {chunk.epistemic}
                        </span>
                    </div>
                    <div class="memory-meta-item">
                        <span class="memory-meta-label">Status</span>
                        <span
                            class="memory-meta-value memory-badge"
                            style={{ backgroundColor: getStatusColor(chunk.status) + '33', color: getStatusColor(chunk.status) }}
                        >
                            {chunk.status}
                        </span>
                    </div>
                </div>
            </section>

            <section class="memory-meta-section">
                <h3>Tags</h3>
                <div class="memory-tags">
                    {chunk.surface_tags.map(tag => (
                        <span key={tag} class="memory-tag">{tag}</span>
                    ))}
                    {chunk.surface_tags.length === 0 && (
                        <span class="memory-no-tags">No tags</span>
                    )}
                </div>
            </section>

            {chunk.related.length > 0 && (
                <section class="memory-meta-section">
                    <h3>Related Chunks</h3>
                    <div class="memory-related-list">
                        {chunk.related.map(rel => (
                            <a
                                key={rel.id}
                                href={`/memory/${rel.id}`}
                                class="memory-related-item"
                            >
                                <span class="memory-related-id">{rel.id}</span>
                                <span class="memory-related-reason">{rel.reason}</span>
                            </a>
                        ))}
                    </div>
                </section>
            )}

            <section class="memory-meta-section">
                <h3>Timestamps</h3>
                <div class="memory-meta-grid">
                    <div class="memory-meta-item">
                        <span class="memory-meta-label">Created</span>
                        <span class="memory-meta-value">{formatDate(chunk.created)}</span>
                    </div>
                    <div class="memory-meta-item">
                        <span class="memory-meta-label">Updated</span>
                        <span class="memory-meta-value">{formatDate(chunk.updated)}</span>
                    </div>
                    <div class="memory-meta-item">
                        <span class="memory-meta-label">Accessed</span>
                        <span class="memory-meta-value">{formatDate(chunk.accessed)}</span>
                    </div>
                    {chunk.expires && (
                        <div class="memory-meta-item">
                            <span class="memory-meta-label">Expires</span>
                            <span class="memory-meta-value">{formatDate(chunk.expires)}</span>
                        </div>
                    )}
                </div>
            </section>

            <section class="memory-meta-section">
                <h3>Metrics</h3>
                <div class="memory-meta-grid">
                    <div class="memory-meta-item">
                        <span class="memory-meta-label">Retrieved</span>
                        <span class="memory-meta-value">{chunk.retrieved_count} times</span>
                    </div>
                    <div class="memory-meta-item">
                        <span class="memory-meta-label">Marked Relevant</span>
                        <span class="memory-meta-value">{chunk.relevant_count} times</span>
                    </div>
                    {chunk.last_relevant_date && (
                        <div class="memory-meta-item">
                            <span class="memory-meta-label">Last Relevant</span>
                            <span class="memory-meta-value">{formatDate(chunk.last_relevant_date)}</span>
                        </div>
                    )}
                </div>
            </section>

            {chunk.context_notes && (
                <section class="memory-meta-section">
                    <h3>Context Notes</h3>
                    <div class="memory-context-notes">{chunk.context_notes}</div>
                </section>
            )}

            <section class="memory-content-section">
                <h3>Content</h3>
                <div class="memory-chunk-content">{chunk.content}</div>
            </section>
        </article>
    );
}
