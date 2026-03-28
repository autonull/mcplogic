/**
 * Session Persistence Interface
 */

import { Session } from './manager.js';

export interface SavedSession {
    id: string;
    premises: string[];
    createdAt: number;
    lastAccessedAt: number;
    ttlMs: number;
    engineName?: string;
    ontologyConfig?: any; // To store ontology configuration
}

export interface SessionStorage {
    save(session: SavedSession): Promise<void>;
    load(id: string): Promise<SavedSession | null>;
    delete(id: string): Promise<void>;
    list(): Promise<string[]>;
    clear(): Promise<void>;
}
