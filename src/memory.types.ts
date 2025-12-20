// Memory chunk types for the persistent memory system

export type ChunkType = 'framework' | 'insight' | 'fact' | 'log' | 'emotional' | 'goal' | 'question';
export type EpistemicStatus = 'established' | 'working' | 'speculative' | 'deprecated';
export type LifecycleStatus = 'active' | 'dormant' | 'review' | 'archived';

export interface ChunkRelation {
    id: string;
    reason: string;
}

export interface Chunk {
    // Identity
    id: string;
    content: string;
    summary: string;

    // Classification
    type: ChunkType;
    epistemic: EpistemicStatus;
    status: LifecycleStatus;

    // Retrieval
    surface_tags: string[];
    related: ChunkRelation[];

    // Timestamps (ISO strings)
    created: string;
    updated: string;
    accessed: string;

    // Metrics
    retrieved_count: number;
    relevant_count: number;
    last_relevant_date: string | null;

    // Optional
    expires?: string;
    context_notes?: string;
}

// Chunk metadata without content (for query results)
export type ChunkMeta = Omit<Chunk, 'content'>;

// Fields that are auto-generated on store
export const AUTO_GENERATED_FIELDS = [
    'id', 'created', 'updated', 'accessed',
    'retrieved_count', 'relevant_count', 'last_relevant_date'
] as const;

// Fields required when storing a new chunk
export const REQUIRED_FIELDS = ['summary', 'type', 'epistemic', 'surface_tags'] as const;

// Default values for new chunks
export function getChunkDefaults(): Partial<Chunk> {
    const now = new Date().toISOString();
    return {
        status: 'active',
        related: [],
        created: now,
        updated: now,
        accessed: now,
        retrieved_count: 0,
        relevant_count: 0,
        last_relevant_date: null,
    };
}

