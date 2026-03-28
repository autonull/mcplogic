/**
 * Reasoning Engine Interface
 * 
 * Abstract interface for pluggable reasoning backends.
 * All engine implementations (Prolog, SAT, etc.) implement this interface.
 */

import { Clause } from '../types/clause.js';
import { ProveResult, Verbosity } from '../types/index.js';

/**
 * Capabilities of a reasoning engine
 */
export interface EngineCapabilities {
    /** Can handle Horn clauses efficiently */
    horn: boolean;
    /** Can handle arbitrary first-order logic (non-Horn) */
    fullFol: boolean;
    /** Has built-in equality reasoning */
    equality: boolean;
    /** Has arithmetic support */
    arithmetic: boolean;
    /** Supports progress callbacks/streaming */
    streaming: boolean;
}

/**
 * Options for prove operations
 */
export interface EngineProveOptions {
    verbosity?: Verbosity;
    /** Enable arithmetic support */
    enableArithmetic?: boolean;
    /** Enable equality axioms */
    enableEquality?: boolean;
    /** Force clausification for SAT fallback */
    enableClausify?: boolean;
    /** Search strategy (e.g., iterative deepening) */
    strategy?: 'auto' | 'breadth' | 'depth' | 'iterative';
    /** Maximum inference steps */
    maxInferences?: number;
    /** Maximum time in seconds */
    maxSeconds?: number;
    /** Include step-by-step inference trace */
    includeTrace?: boolean;
    /**
     * Callback for progress updates.
     * @param progress A number between 0 and 1 (if known) or undefined.
     * @param message A descriptive message about the current step.
     */
    onProgress?: (progress: number | undefined, message: string) => void;
}

/**
 * Result of a satisfiability check
 */
export interface SatResult {
    /** Whether the formula is satisfiable */
    sat: boolean;
    /** Model (variable assignments) if satisfiable */
    model?: Map<string, boolean>;
    /** Statistics about the computation */
    statistics?: {
        timeMs: number;
        variables?: number;
        clauses?: number;
    };
}

/**
 * A persistent session with a reasoning engine.
 * Allows incremental assertion of premises and efficient querying.
 */
export interface EngineSession {
    /**
     * Assert a formula into the session context.
     * @param formula - The FOL formula to add
     */
    assert(formula: string): Promise<void>;

    /**
     * Retract a formula from the session context.
     * If the engine does not support retraction, it may throw or require a rebuild.
     * @param formula - The FOL formula to remove
     */
    retract(formula: string): Promise<void>;

    /**
     * Prove a conclusion based on asserted premises.
     * @param conclusion - The goal formula
     * @param options - Engine-specific options
     */
    prove(conclusion: string, options?: EngineProveOptions): Promise<ProveResult>;

    /**
     * Clean up resources associated with this session.
     * Should be called when the session is no longer needed.
     */
    close(): Promise<void>;
}

/**
 * Abstract reasoning engine interface.
 * All engine backends must implement this interface.
 */
export interface ReasoningEngine {
    /** Unique name of the engine */
    readonly name: string;
    /** Capabilities of this engine */
    readonly capabilities: EngineCapabilities;

    /**
     * Prove a conclusion from premises.
     * @param premises - Array of FOL formula strings
     * @param conclusion - The goal formula to prove
     * @param options - Engine-specific options
     * @returns ProveResult indicating success/failure
     */
    prove(
        premises: string[],
        conclusion: string,
        options?: EngineProveOptions
    ): Promise<ProveResult>;

    /**
     * Check satisfiability of clauses (direct CNF input).
     * @param clauses - Array of clauses in CNF
     * @returns SatResult indicating sat/unsat and model
     */
    checkSat(clauses: Clause[]): Promise<SatResult>;

    /**
     * Create a new persistent session.
     * @returns A new EngineSession instance
     */
    createSession?(): Promise<EngineSession>;

    /**
     * Optional initialization for lazy-loaded engines (e.g., WASM modules).
     */
    init?(): Promise<void>;
}
