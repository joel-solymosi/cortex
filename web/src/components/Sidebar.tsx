import type { ChunkListItem } from '../MemoryApp';
import { SearchBar } from './SearchBar';
import { getTypeColor, getStatusColor } from './MemoryStyles';

interface SidebarProps {
    chunks: ChunkListItem[];
    selectedId: string | null;
    onSearch: (query: string) => void;
}

export function Sidebar({
    chunks,
    selectedId,
    onSearch,
}: SidebarProps) {
    return (
        <aside class="memory-sidebar">
            <header class="memory-sidebar-header">
                <h1><a href="/memory">Memory Viewer</a></h1>
                <span class="memory-chunk-count">{chunks.length} chunks</span>
            </header>
            <SearchBar onSearch={onSearch} />
            <div class="memory-chunk-list">
                {chunks.map(chunk => (
                    <a
                        key={chunk.id}
                        href={`/memory/${chunk.id}`}
                        class={`memory-chunk-item ${selectedId === chunk.id ? 'selected' : ''}`}
                    >
                        <div class="memory-chunk-item-header">
                            <span class="memory-chunk-id">{chunk.id}</span>
                            <span
                                class="memory-chunk-type"
                                style={{ color: getTypeColor(chunk.type) }}
                            >
                                {chunk.type}
                            </span>
                        </div>
                        <div class="memory-chunk-summary">{chunk.summary}</div>
                        <span
                            class="memory-chunk-status"
                            style={{ color: getStatusColor(chunk.status) }}
                        >
                            {chunk.status}
                        </span>
                    </a>
                ))}
            </div>
        </aside>
    );
}
