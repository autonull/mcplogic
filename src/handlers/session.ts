import {
    Verbosity,
} from '../types/index.js';
import { validateFormulas } from '../validation/syntax.js';
import { SessionManager } from '../session/manager.js';
import { EngineManager } from '../engines/manager.js';
import { buildProveResponse } from '../utils/response.js';

export function createSessionHandler(
    args: {
        ttl_minutes?: number;
        ontology?: {
            types?: string[];
            relationships?: string[];
            constraints?: string[];
            synonyms?: Record<string, string>;
        };
    },
    sessionManager: SessionManager
): object {
    const { ttl_minutes, ontology } = args;
    const ttlMs = ttl_minutes
        ? Math.min(ttl_minutes, 1440) * 60 * 1000  // Max 24 hours
        : undefined;

    const session = sessionManager.create({ ttlMs, ontology });
    const info = sessionManager.getInfo(session.id);

    return {
        session_id: session.id,
        created_at: new Date(info.createdAt).toISOString(),
        expires_at: new Date(info.expiresAt).toISOString(),
        ttl_minutes: Math.round(info.ttlMs / 60000),
        active_sessions: sessionManager.count,
        has_ontology: !!session.ontology,
    };
}

export async function assertPremiseHandler(
    args: {
        session_id: string;
        formula: string;
    },
    sessionManager: SessionManager
): Promise<object> {
    const { session_id, formula } = args;

    // Validate formula syntax first
    const validation = validateFormulas([formula]);
    if (!validation.valid) {
        return {
            success: false,
            result: 'syntax_error',
            validation,
        };
    }

    const session = await sessionManager.assertPremise(session_id, formula);
    return {
        success: true,
        session_id: session.id,
        premise_count: session.premises.length,
        formula_added: formula,
    };
}

export async function querySessionHandler(
    args: {
        session_id: string;
        goal: string;
        inference_limit?: number;
    },
    sessionManager: SessionManager,
    engineManager: EngineManager,
    verbosity: Verbosity
): Promise<object> {
    const { session_id, goal } = args;

    // Validate goal syntax
    const validation = validateFormulas([goal]);
    if (!validation.valid) {
        return { result: 'syntax_error', validation };
    }

    const session = sessionManager.get(session_id);

    // If session has an active engine session, prefer it?
    // But engineManager.prove is stateless/creates new session.
    // If we want to use the session's incremental state, we should use session.engineSession.prove().
    // However, engineManager.prove handles engine selection logic.
    // Given the architecture, maybe we should stick to engineManager.prove for now,
    // BUT pass the session's engine preference if available?

    // Wait, if we use engineManager.prove(session.premises, goal), we are ignoring the incremental state
    // built in session.engineSession.
    // If Z3/Clingo session is active, we SHOULD use it.

    if (session.engineSession) {
        try {
            const proveResult = await session.engineSession.prove(goal, { verbosity });
            return {
                session_id: session.id,
                premise_count: session.premises.length,
                ...buildProveResponse(proveResult, verbosity),
            };
        } catch (e) {
             // Fallback to stateless prove if session prove fails?
             console.warn(`Session prove failed on ${session.engineName}, falling back to stateless...`, e);
        }
    }

    // Fallback or if no session engine active
    const proveResult = await engineManager.prove(session.premises, goal, { verbosity });
    return {
        session_id: session.id,
        premise_count: session.premises.length,
        ...buildProveResponse(proveResult, verbosity),
    };
}

export async function retractPremiseHandler(
    args: {
        session_id: string;
        formula: string;
    },
    sessionManager: SessionManager
): Promise<object> {
    const { session_id, formula } = args;

    const removed = await sessionManager.retractPremise(session_id, formula);
    const session = sessionManager.get(session_id);

    return {
        success: removed,
        session_id: session.id,
        premise_count: session.premises.length,
        message: removed
            ? `Removed: ${formula}`
            : `Formula not found in session: ${formula}`,
    };
}

export function listPremisesHandler(
    args: { session_id: string },
    sessionManager: SessionManager,
    verbosity: Verbosity
): object {
    const { session_id } = args;

    const premises = sessionManager.listPremises(session_id);
    const info = sessionManager.getInfo(session_id);

    return {
        session_id,
        premise_count: premises.length,
        premises,
        ...(verbosity === 'detailed' && {
            created_at: new Date(info.createdAt).toISOString(),
            expires_at: new Date(info.expiresAt).toISOString(),
        }),
    };
}

export async function clearSessionHandler(
    args: { session_id: string },
    sessionManager: SessionManager
): Promise<object> {
    const { session_id } = args;

    const session = await sessionManager.clear(session_id);

    return {
        success: true,
        session_id: session.id,
        message: 'Session cleared',
        premise_count: 0,
    };
}

export async function deleteSessionHandler(
    args: { session_id: string },
    sessionManager: SessionManager
): Promise<object> {
    const { session_id } = args;

    await sessionManager.delete(session_id);

    return {
        success: true,
        message: `Session ${session_id} deleted`,
        active_sessions: sessionManager.count,
    };
}
