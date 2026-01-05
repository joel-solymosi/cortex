import type { Chunk } from '../../../src/memory.types';
import { getTypeColor } from './MemoryStyles';

interface SearchResultsProps {
    query: string;
    results: Chunk[];
    loading: boolean;
}

export function SearchResults({
    query,
    results,
    loading,
}: SearchResultsProps) {
    if (loading) {
        return (
            <div class="memory-search-results">
                <div class="memory-search-header">
                    <h2>Searching for "{query}"...</h2>
                </div>
            </div>
        );
    }

    return (
        <div class="memory-search-results">
            <div class="memory-search-header">
                <h2>Search results for "{query}"</h2>
                <span class="memory-result-count">{results.length} results</span>
            </div>
            {results.length === 0 ? (
                <div class="memory-no-results">No chunks found matching your search.</div>
            ) : (
                <div class="memory-results-list">
                    {results.map(chunk => (
                        <a
                            key={chunk.id}
                            href={`/memory/${chunk.id}`}
                            class="memory-result-item"
                        >
                            <div class="memory-result-meta">
                                <span class="memory-chunk-id">{chunk.id}</span>
                                <span
                                    class="memory-chunk-type"
                                    style={{ color: getTypeColor(chunk.type) }}
                                >
                                    {chunk.type}
                                </span>
                                <span class="memory-result-summary">{chunk.summary}</span>
                            </div>
                            <div class="memory-result-content">{chunk.content}</div>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}
