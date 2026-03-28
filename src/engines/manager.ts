/**
 * Engine Manager
 * 
 * Orchestrates multiple reasoning engines with automatic selection.
 * Provides a unified interface for theorem proving with intelligent fallback.
 */

import { Clause } from '../types/clause.js';
import { ProveResult } from '../types/index.js';
import { clausify, isHornFormula } from '../logic/clausifier.js';
import { parse } from '../parser/index.js';
import { createAnd, createNot } from '../ast/index.js';
import {
    EngineCapabilities,
    EngineProveOptions,
    SatResult,
    ReasoningEngine,
    EngineSession
} from './interface.js';
import { containsArithmetic } from '../axioms/arithmetic.js';
import { EngineRegistry } from './registry.js';

// Import types only to avoid eager loading
import type { PrologEngine } from './prolog/index.js';
import type { SATEngine } from './sat/index.js';
import type { Z3Engine } from './z3/index.js';
import type { ClingoEngine } from './clingo/index.js';

/**
 * Engine selection mode
 */
export type EngineSelection = 'prolog' | 'sat' | 'z3' | 'clingo' | 'auto' | 'race';

/**
 * Extended prove options with engine selection
 */
export interface ManagerProveOptions extends EngineProveOptions {
    /** Which engine to use (default: 'auto') */
    engine?: EngineSelection;
}

/**
 * Engine Manager - orchestrates multiple reasoning engines.
 * 
 * In 'auto' mode:
 * - Analyzes formula structure
 * - Uses Prolog for Horn clauses (fast, proven)
 * - Uses Z3 for arithmetic, equality, and complex FOL (SMT)
 * - Falls back to SAT for non-Horn clauses if Z3 unavailable/unsuitable
 */
export class EngineManager {
    private registry: EngineRegistry;

    constructor(
        timeout: number = 5000, // kept for compatibility signature
        inferenceLimit: number = 1000
    ) {
        this.registry = new EngineRegistry(inferenceLimit);
    }

    /**
     * Get an engine instance by name, initializing it if necessary.
     */
    async getEngine(name: string): Promise<ReasoningEngine> {
        return this.registry.getEngine(name);
    }

    /**
     * Create a new persistent session with the specified engine.
     */
    async createSession(engineName: string): Promise<EngineSession> {
        const engine = await this.getEngine(engineName);
        if (engine.createSession) {
            return engine.createSession();
        }
        throw new Error(`Engine ${engineName} does not support sessions.`);
    }

    /**
     * Get the Prolog engine instance.
     */
    async getPrologEngine(): Promise<PrologEngine> {
        return (await this.getEngine('prolog')) as PrologEngine;
    }

    /**
     * Get the SAT engine instance.
     */
    async getSATEngine(): Promise<SATEngine> {
        return (await this.getEngine('sat')) as SATEngine;
    }

    async getZ3Engine(): Promise<Z3Engine> {
        return (await this.getEngine('z3')) as Z3Engine;
    }

    async getClingoEngine(): Promise<ClingoEngine> {
        return (await this.getEngine('clingo')) as ClingoEngine;
    }

    /**
     * Prove a conclusion from premises with automatic engine selection.
     */
    async prove(
        premises: string[],
        conclusion: string,
        options?: ManagerProveOptions
    ): Promise<ProveResult & { engineUsed?: string }> {
        try {
            if (options?.engine === 'race') {
                return await this.proveRace(premises, conclusion, options);
            }

            const engine = await this.selectEngine(premises, conclusion, options);
            const res = await engine.prove(premises, conclusion, options);
            return { ...res, engineUsed: engine.name };
        } catch (e) {
            // If selection fails or engine fails, we might want to try fallback?
            // For now, return error
            return {
                success: false,
                result: 'error',
                error: e instanceof Error ? e.message : String(e),
                engineUsed: 'unknown',
                found: false
            };
        }
    }

    /**
     * Race all capable engines in parallel
     */
    private async proveRace(
        premises: string[],
        conclusion: string,
        options?: ManagerProveOptions
    ): Promise<ProveResult & { engineUsed?: string }> {
        const engines = [
            this.getEngine('z3'),
            this.getEngine('prolog'),
            this.getEngine('sat')
        ];

        // Add clingo if not explicitly excluded or unavailable (it's always available via WASM but might be slow to init)
        // For race, we just try all standard ones.

        const promises = engines.map(async (enginePromise) => {
            try {
                const engine = await enginePromise;
                // Basic capability check (skip SAT if arithmetic needed, though SAT handles it poorly rather than crashing)
                // Actually, just let them fail.
                const res = await engine.prove(premises, conclusion, options);
                return { ...res, engineUsed: engine.name };
            } catch (e) {
                // If an engine fails, we return a failed result but don't reject,
                // so Promise.any/race can ignore it unless all fail.
                // However, Promise.race returns the *first* settled, even rejection.
                // We want Promise.any behavior (first success), but Promise.any waits for all rejections if none succeed.

                // Let's implement a custom race where we ignore failures unless all fail.
                throw e;
            }
        });

        // We want the first *successful* result (proved or disproved/counterexample), ignoring errors/timeouts.
        // If all timeout/error, return one of the errors.

        try {
            return await Promise.any(promises);
        } catch (e) {
            // Aggregate errors
            return {
                success: false,
                result: 'error',
                error: 'All engines failed in race mode',
                engineUsed: 'race',
                found: false
            };
        }
    }

    /**
     * Select the best engine for the given problem.
     */
    private async selectEngine(
        premises: string[],
        conclusion: string,
        options?: ManagerProveOptions
    ): Promise<ReasoningEngine> {
        const preferred = options?.engine;

        if (preferred && preferred !== 'auto') {
            return this.getEngine(preferred);
        }

        // Auto selection
        // Analyze formula
        const premiseNodes = premises.map(p => parse(p));
        const conclusionNode = parse(conclusion);

        const hasArithmetic = premiseNodes.some(containsArithmetic) || containsArithmetic(conclusionNode);

        // Check Horn structure
        let isHorn = false;

        try {
             const negatedConclusion = createNot(conclusionNode);
             const allNodes = [...premiseNodes, negatedConclusion];
             const refutationAST = allNodes.length > 0
                ? allNodes.reduce((acc, node) => createAnd(acc, node))
                : negatedConclusion;

             const clausifyResult = clausify(refutationAST);
             if (clausifyResult.success && clausifyResult.clauses && isHornFormula(clausifyResult.clauses)) {
                 isHorn = true;
             }
        } catch (e) {
            // ignore parsing/clausify errors for analysis
        }

        // Score engines
        const scores = this.registry.getEntries().map(([name, entry]) => {
            let score = 0;
            const caps = entry.capabilities;

            if (hasArithmetic) {
                if (caps.arithmetic) score += 100;
                else score = -1000; // Cannot handle arithmetic
            }

            if (isHorn && !hasArithmetic) {
                if (caps.horn) score += 50;
                // Prefer Prolog for Horn clauses as it is lightweight and fast
                if (name === 'prolog') score += 20;
            } else {
                // Non-Horn
                if (caps.fullFol) score += 50;
                else score = -1000; // Cannot handle full FOL
            }

            // General preference for stronger engines for complex tasks
            if (name === 'z3') score += 10;
            if (name === 'clingo') score += 5;

            return { name, score };
        });

        // Sort by score descending
        scores.sort((a, b) => b.score - a.score);

        const best = scores[0];

        // If even the best engine has a negative score, we might have a problem,
        // but we return it anyway as a best effort.
        return this.getEngine(best.name);
    }

    /**
     * Check satisfiability of clauses.
     * Automatically selects the appropriate engine.
     */
    async checkSat(clauses: Clause[], engine?: EngineSelection): Promise<SatResult> {
        // For checkSat, we usually use SAT or Z3.
        // If engine is specified, use it.
        if (engine && engine !== 'auto') {
            const e = await this.getEngine(engine);
            return e.checkSat(clauses);
        }

        // Auto: Prefer SAT engine for raw CNF clauses as it is specialized and optimized for this format.
        // Z3 is powerful but converting CNF to Z3 AST adds overhead, and the SAT engine (MiniSat) is sufficient.
        try {
            const sat = await this.getEngine('sat');
            return sat.checkSat(clauses);
        } catch (e) {
            // Fallback to Z3 if SAT engine fails
            const z3 = await this.getEngine('z3');
            return z3.checkSat(clauses);
        }
    }

    /**
     * Get available engines and their capabilities.
     */
    getEngines(): { name: string; capabilities: EngineCapabilities }[] {
        // Return static capabilities from registry
        return this.registry.getEntries().map(([name, entry]) => ({
            name: entry.actualName,
            capabilities: entry.capabilities
        }));
    }
}

/**
 * Create a new engine manager instance.
 */
export function createEngineManager(
    timeout?: number,
    inferenceLimit?: number
): EngineManager {
    return new EngineManager(timeout, inferenceLimit);
}
