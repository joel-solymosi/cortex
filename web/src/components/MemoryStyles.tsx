// Shared style utilities for memory components

export function getTypeColor(type: string): string {
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
}

export function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
        active: '#6bff9f',
        dormant: '#888',
        review: '#ffff6b',
        archived: '#ff6b6b',
    };
    return colors[status] || '#888';
}

export function getEpistemicColor(epistemic: string): string {
    const colors: Record<string, string> = {
        established: '#6bff9f',
        working: '#6b9fff',
        speculative: '#ffff6b',
        deprecated: '#ff6b6b',
    };
    return colors[epistemic] || '#888';
}

export function formatDate(iso: string): string {
    const date = new Date(iso);
    return date.toLocaleString();
}
