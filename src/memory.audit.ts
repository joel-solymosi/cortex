// Append-only audit log for memory operations

import fs from 'fs/promises';
import path from 'path';

export type AuditAction =
    | 'STORE'
    | 'UPDATE'
    | 'QUERY'
    | 'RETRIEVE'
    | 'RELEVANT'
    | 'OBSOLETE'
    | 'INIT'
    | 'RELOAD';

export interface AuditEntry {
    timestamp: string;
    action: AuditAction;
    chunkId?: string;
    details?: string;
}

/**
 * Audit logger for memory operations
 */
export class AuditLog {
    private logPath: string;

    constructor(dataDir: string) {
        this.logPath = path.join(dataDir, 'audit.log');
    }

    async initialize(): Promise<void> {
        // Ensure data directory exists
        await fs.mkdir(path.dirname(this.logPath), { recursive: true });

        // Create log file if it doesn't exist
        try {
            await fs.access(this.logPath);
        } catch {
            await fs.writeFile(this.logPath, '', 'utf-8');
        }
    }

    /**
     * Append an entry to the audit log
     */
    async log(action: AuditAction, chunkId?: string, details?: unknown): Promise<void> {
        const timestamp = new Date().toISOString();
        let line = `${timestamp} ${action}`;

        if (chunkId) {
            line += ` ${chunkId}`;
        }

        if (details !== undefined) {
            const detailStr = typeof details === 'string'
                ? details
                : JSON.stringify(details);
            line += ` ${detailStr}`;
        }

        await fs.appendFile(this.logPath, line + '\n', 'utf-8');
    }

    /**
     * Log a STORE operation
     */
    async logStore(chunkId: string, metadata: Record<string, unknown>): Promise<void> {
        await this.log('STORE', chunkId, metadata);
    }

    /**
     * Log an UPDATE operation
     */
    async logUpdate(chunkId: string, changes: Record<string, unknown>): Promise<void> {
        await this.log('UPDATE', chunkId, changes);
    }

    /**
     * Log a QUERY operation
     */
    async logQuery(searchText: string, resultIds: string[]): Promise<void> {
        await this.log('QUERY', undefined, { query: searchText, results: resultIds });
    }

    /**
     * Log RETRIEVE operations (when chunks are accessed via query)
     */
    async logRetrieve(chunkIds: string[]): Promise<void> {
        await this.log('RETRIEVE', undefined, chunkIds);
    }

    /**
     * Log RELEVANT marking
     */
    async logRelevant(chunkIds: string[]): Promise<void> {
        await this.log('RELEVANT', undefined, chunkIds);
    }

    /**
     * Log OBSOLETE marking
     */
    async logObsolete(chunkId: string, reason: string): Promise<void> {
        await this.log('OBSOLETE', chunkId, reason);
    }

    /**
     * Read audit log entries since a given timestamp
     */
    async readSince(since?: string): Promise<string> {
        const content = await fs.readFile(this.logPath, 'utf-8');

        if (!since) {
            return content;
        }

        const sinceDate = new Date(since);
        const lines = content.split('\n').filter(line => {
            if (!line.trim()) return false;
            const timestamp = line.split(' ')[0];
            return new Date(timestamp) >= sinceDate;
        });

        return lines.join('\n');
    }

    /**
     * Parse audit log into structured entries
     */
    async getEntries(since?: string): Promise<AuditEntry[]> {
        const content = await this.readSince(since);
        const lines = content.split('\n').filter(line => line.trim());

        return lines.map(line => {
            const parts = line.split(' ');
            const timestamp = parts[0];
            const action = parts[1] as AuditAction;

            // Try to determine if there's a chunkId (6 hex chars)
            let chunkId: string | undefined;
            let detailsStart = 2;

            if (parts[2] && /^[a-f0-9]{6}$/.test(parts[2])) {
                chunkId = parts[2];
                detailsStart = 3;
            }

            const details = parts.slice(detailsStart).join(' ') || undefined;

            return { timestamp, action, chunkId, details };
        });
    }
}