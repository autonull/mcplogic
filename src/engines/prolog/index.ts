/**
 * Prolog Engine Adapter
 * 
 * Wraps the existing LogicEngine to implement the ReasoningEngine interface.
 * Provides the Tau-Prolog backend for Horn clause reasoning.
 */

import { LogicEngine, ProveOptions } from './engine.js';
import { ProveResult } from '../../types/index.js';
import { Clause } from '../../types/clause.js';
import { isHornFormula } from '../../logic/clausifier.js';
import { clausesToProlog } from './translator.js';
import {
    ReasoningEngine,
    EngineCapabilities,
    EngineProveOptions,
    SatResult,
    EngineSession
} from '../interface.js';
import { PrologSession } from './session.js';

export { LogicEngine, createLogicEngine } from './engine.js';

/**
 * Prolog-based reasoning engine using Tau-Prolog.
 * Optimal for Horn clauses; supports equality and arithmetic via axioms.
 */
export class PrologEngine implements ReasoningEngine {
    readonly name = 'prolog/tau-prolog';
    readonly capabilities: EngineCapabilities = {
        horn: true,
        fullFol: false,  // Limited to Horn clauses
        equality: true,  // Via equality axioms
        arithmetic: true, // Via arithmetic axioms
        streaming: false,
    };

    private engine: LogicEngine;
    private inferenceLimit: number;

    /**
     * @param timeout Timeout in milliseconds
     * @param inferenceLimit Maximum inference steps
     */
    constructor(timeout: number = 5000, inferenceLimit: number = 1000) {
        this.inferenceLimit = inferenceLimit;
        // LogicEngine no longer accepts timeout in constructor
        this.engine = new LogicEngine(inferenceLimit);
    }

    async init(): Promise<void> {
        // No-op for Prolog engine (initialized in constructor/sync)
        return Promise.resolve();
    }

    async createSession(): Promise<EngineSession> {
        return new PrologSession(this.inferenceLimit);
    }

    async close(): Promise<void> {
        // No cleanup needed for Prolog engine
        return Promise.resolve();
    }

    /**
     * Prove a conclusion from premises using Prolog resolution.
     */
    async prove(
        premises: string[],
        conclusion: string,
        options?: EngineProveOptions
    ): Promise<ProveResult> {
        const proveOptions: ProveOptions = {
            verbosity: options?.verbosity,
            enableArithmetic: options?.enableArithmetic,
            enableEquality: options?.enableEquality,
            strategy: options?.strategy,
            maxInferences: options?.maxInferences,
            maxSeconds: options?.maxSeconds,
            includeTrace: options?.includeTrace,
        };
        return this.engine.prove(premises, conclusion, proveOptions);
    }

    /**
     * Check satisfiability of clauses by converting to Prolog.
     * Only works for Horn clauses.
     */
    async checkSat(clauses: Clause[]): Promise<SatResult> {
        const startTime = Date.now();

        // Prolog can only handle Horn clauses
        if (!isHornFormula(clauses)) {
            return {
                sat: false,
                statistics: {
                    timeMs: Date.now() - startTime,
                    clauses: clauses.length,
                },
            };
        }

        try {
            // Convert clauses to Prolog format
            const prologClauses = clausesToProlog(clauses);

            // Create a simple satisfiability check
            // If the program consults without error, it's "satisfiable"
            const isSat = await this.engine.checkPrologSatisfiability(prologClauses);

            return {
                sat: isSat,
                statistics: {
                    timeMs: Date.now() - startTime,
                    clauses: clauses.length,
                },
            };
        } catch {
            return {
                sat: false,
                statistics: {
                    timeMs: Date.now() - startTime,
                    clauses: clauses.length,
                },
            };
        }
    }
}

/**
 * Create a new Prolog engine instance.
 */
export function createPrologEngine(
    timeout?: number,
    inferenceLimit?: number
): PrologEngine {
    return new PrologEngine(timeout, inferenceLimit);
}
