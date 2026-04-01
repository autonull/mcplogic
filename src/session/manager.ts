/**
 * Session Manager for MCPLogic
 * 
 * Provides session-based reasoning with persistent knowledge bases.
 * Sessions auto-expire after TTL and are garbage collected periodically.
 */

import { buildPrologProgram } from '../engines/prolog/translator.js';
import { OntologyManager } from '../ontology/manager.js';
import { OntologyConfig } from '../types/ontology.js';
import {
    createSessionNotFoundError,
    createSessionLimitError,
} from '../types/errors.js';
import { EngineSession } from '../engines/interface.js';
import { EngineManager } from '../engines/manager.js';
import { parse } from '../parser/index.js';
import { containsArithmetic } from '../axioms/arithmetic.js';

// Browser-safe UUID generation
function generateUUID(): string {
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    // Fallback for older environments or minimal JS contexts
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * A reasoning session with accumulated premises
 */
export interface Session {
    id: string;
    premises: string[];          // Original FOL formulas
    prologProgram: string;       // Compiled Prolog program (Legacy/Backup)
    ontology?: OntologyManager;  // Optional ontology manager
    createdAt: number;
    lastAccessedAt: number;
    ttlMs: number;               // Time-to-live in milliseconds

    // Engine State
    engineSession?: EngineSession;
    engineName?: string;
}

/**
 * Session creation options
 */
export interface CreateSessionOptions {
    ttlMs?: number;              // Custom TTL (default: 30 minutes)
    ontology?: OntologyConfig;   // Optional ontology configuration
    engine?: string;             // Preferred engine (optional)
}

/**
 * Session Manager - handles session lifecycle and operations
 */
export class SessionManager {
    private sessions = new Map<string, Session>();
    private gcIntervalId: ReturnType<typeof setInterval> | null = null;
    private engineManager?: EngineManager;

    /** GC runs every minute */
    private readonly gcIntervalMs = 60_000;

    /** Default session TTL: 30 minutes */
    private readonly defaultTtlMs = 30 * 60 * 1000;

    /** Maximum number of concurrent sessions */
    static readonly MAX_SESSIONS = 1000;

    constructor(engineManager?: EngineManager) {
        this.engineManager = engineManager;
        // Start garbage collection
        this.gcIntervalId = setInterval(() => this.gc(), this.gcIntervalMs);
    }

    /**
     * Create a new reasoning session
     */
    create(options?: CreateSessionOptions): Session {
        // Check session limit
        if (this.sessions.size >= SessionManager.MAX_SESSIONS) {
            throw createSessionLimitError(SessionManager.MAX_SESSIONS);
        }

        const now = Date.now();
        const session: Session = {
            id: generateUUID(),
            premises: [],
            prologProgram: '',
            createdAt: now,
            lastAccessedAt: now,
            ttlMs: options?.ttlMs ?? this.defaultTtlMs,
            ontology: options?.ontology ? new OntologyManager(options.ontology) : undefined,
            engineName: options?.engine
        };

        this.sessions.set(session.id, session);
        return session;
    }

    /**
     * Get a session by ID (updates lastAccessedAt)
     */
    get(id: string): Session {
        const session = this.sessions.get(id);
        if (!session) {
            throw createSessionNotFoundError(id);
        }
        session.lastAccessedAt = Date.now();
        return session;
    }

    /**
     * Check if a session exists
     */
    exists(id: string): boolean {
        return this.sessions.has(id);
    }

    /**
     * Delete a session
     */
    delete(id: string): boolean {
        if (!this.sessions.has(id)) {
            throw createSessionNotFoundError(id);
        }
        return this.sessions.delete(id);
    }

    /**
     * Assert a premise into a session's knowledge base
     */
    async assertPremise(id: string, formula: string): Promise<Session> {
        const session = this.get(id);

        let processedFormula = formula;
        if (session.ontology) {
            processedFormula = session.ontology.expandSynonyms(formula);
            session.ontology.validate(processedFormula);
        }

        // Add to premises list (Source of Truth)
        session.premises.push(processedFormula);

        // Legacy support: update prolog program string (cheap)
        // This ensures code relying on session.prologProgram still works if engine session fails
        try {
            session.prologProgram = buildPrologProgram(session.premises);
        } catch (e) {
            // Ignore prolog build errors if we are switching to non-prolog engine
        }

        // Handle Engine Session Logic
        if (this.engineManager) {
            await this.updateEngineSession(session, processedFormula);
        }

        return session;
    }

    private async updateEngineSession(session: Session, newPremise: string) {
        if (!this.engineManager) return;

        // Determine required capabilities based on new premise
        // We do a lightweight check. Full check happens in selectEngine.
        const ast = parse(newPremise);
        const requiresArithmetic = containsArithmetic(ast);

        // If we have an existing session
        if (session.engineSession && session.engineName) {
            // Heuristic: Switch to Z3 for arithmetic if not already using it.
            // Although Prolog supports arithmetic via axioms, Z3 is the preferred engine for SMT tasks.
            // If the session engine was chosen automatically (no explicit preference stored, though currently we don't store that distinction),
            // we should probably upgrade.
            if (requiresArithmetic && session.engineName !== 'z3') {
                 // Trigger rebuild to pick up Z3
                 await this.rebuildSession(session);
                 return;
            }

            try {
                await session.engineSession.assert(newPremise);
            } catch (e) {
                // If assert fails, maybe the engine doesn't support it (e.g. syntax error in translator)
                // Or maybe we need to upgrade.
                // Force a rebuild with auto-selection.
                console.warn(`Assertion failed on ${session.engineName}, trying to re-select engine...`, e);
                await this.rebuildSession(session);
            }
        } else {
            // No active session yet, or lost.
            // Determine best engine for ALL premises.
            await this.rebuildSession(session);
        }
    }

    private async rebuildSession(session: Session) {
        if (!this.engineManager) return;

        // Re-evaluate best engine based on premises
        const hasArithmetic = session.premises.some(p => {
            try { return containsArithmetic(parse(p)); } catch { return false; }
        });

        // Prefer Z3 for arithmetic, otherwise Prolog is lighter
        const engineName = hasArithmetic ? 'z3' : 'prolog';

        try {
            session.engineSession = await this.engineManager.createSession(engineName);
            session.engineName = engineName;

            // Replay all premises
            for (const p of session.premises) {
                await session.engineSession.assert(p);
            }
        } catch (e) {
            console.error('Failed to rebuild session:', e);
            session.engineSession = undefined;
            // Fallback?
        }
    }

    /**
     * Retract a premise from a session's knowledge base
     * Returns true if the premise was found and removed
     */
    async retractPremise(id: string, formula: string): Promise<boolean> {
        const session = this.get(id);
        const index = session.premises.indexOf(formula);
        if (index === -1) {
            return false;
        }
        session.premises.splice(index, 1);

        // Update Prolog legacy
        session.prologProgram = buildPrologProgram(session.premises);

        // Update Engine Session
        if (session.engineSession) {
            try {
                await session.engineSession.retract(formula);
            } catch (e) {
                // If retraction not supported incrementally, rebuild
                await this.rebuildSession(session);
            }
        }

        return true;
    }

    /**
     * List all premises in a session
     */
    listPremises(id: string): string[] {
        const session = this.get(id);
        return [...session.premises];
    }

    /**
     * Clear all premises from a session (keeps session alive)
     */
    async clear(id: string): Promise<Session> {
        const session = this.get(id);
        session.premises = [];
        session.prologProgram = '';
        session.engineSession = undefined; // Will be recreated on next assert
        return session;
    }

    /**
     * Get session info without modifying lastAccessedAt
     */
    getInfo(id: string): {
        id: string;
        premiseCount: number;
        createdAt: number;
        lastAccessedAt: number;
        ttlMs: number;
        expiresAt: number;
        engine?: string;
    } {
        const session = this.sessions.get(id);
        if (!session) {
            throw createSessionNotFoundError(id);
        }
        return {
            id: session.id,
            premiseCount: session.premises.length,
            createdAt: session.createdAt,
            lastAccessedAt: session.lastAccessedAt,
            ttlMs: session.ttlMs,
            expiresAt: session.lastAccessedAt + session.ttlMs,
            engine: session.engineName
        };
    }

    /**
     * Get number of active sessions
     */
    get count(): number {
        return this.sessions.size;
    }

    /**
     * Garbage collect expired sessions
     */
    private gc(): void {
        const now = Date.now();
        for (const [id, session] of this.sessions) {
            if (now - session.lastAccessedAt > session.ttlMs) {
                this.sessions.delete(id);
            }
        }
    }

    /**
     * Stop the garbage collector (for cleanup)
     */
    stop(): void {
        if (this.gcIntervalId) {
            clearInterval(this.gcIntervalId);
            this.gcIntervalId = null;
        }
    }

    /**
     * Clear all sessions (for testing)
     */
    clearAll(): void {
        this.sessions.clear();
    }
}

/**
 * Create a new SessionManager instance
 */
export function createSessionManager(engineManager?: EngineManager): SessionManager {
    return new SessionManager(engineManager);
}
