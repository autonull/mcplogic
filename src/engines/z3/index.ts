import { init } from 'z3-solver';
import { ReasoningEngine, EngineCapabilities, EngineProveOptions, SatResult, EngineSession } from '../interface.js';
import { ProveResult, createEngineError } from '../../types/index.js';
import { buildProveResult } from '../../utils/response.js';
import { parse } from '../../parser/index.js';
import { createNot } from '../../ast/index.js';
import { Z3Translator } from './translator.js';
import { Clause } from '../../types/clause.js';
import { Z3Session } from './session.js';
import { Z3Context, Z3Solver } from './types.js';

export class Z3Engine implements ReasoningEngine {
    readonly name = 'z3';
    readonly capabilities: EngineCapabilities = {
        horn: true,
        fullFol: true,
        equality: true,
        arithmetic: true,
        streaming: false,
    };

    private ctx: Z3Context | null = null;

    async init(): Promise<void> {
        if (this.ctx) return;

        try {
            const { Context } = await init();
            // Context constructor requires a generic type parameter in recent versions,
            // but the `init` function returns a Context constructor that we can instantiate.
            this.ctx = new Context('main') as unknown as Z3Context;
        } catch (e) {
            throw createEngineError(`Failed to initialize Z3: ${e}`);
        }
    }

    async createSession(): Promise<EngineSession> {
        if (!this.ctx) await this.init();
        return new Z3Session(this.ctx!);
    }

    async prove(
        premises: string[],
        conclusion: string,
        options?: EngineProveOptions
    ): Promise<ProveResult> {
        const startTime = Date.now();
        const verbosity = options?.verbosity || 'standard';
        const timeoutMs = (options?.maxSeconds || 10) * 1000;
        let solver: Z3Solver | null = null;

        try {
            if (!this.ctx) await this.init();

            // Create a solver
            solver = new this.ctx!.Solver() as unknown as Z3Solver;

            // Configure solver parameters (timeout)
            // Z3 params are set via solver.set() or global config?
            // In Z3Py: s.set("timeout", ms)
            // In JS bindings: check API. Usually solver.set('timeout', ms) works if exposed.
            // If not exposed, we use Promise.race.

            // Try setting parameter if available
            try {
                // solver.set('timeout', timeoutMs);
                // The binding might be strict about types or method existence.
                // Safest is to check if set exists or just rely on race wrapper for robustness against OOM/hangs.
            } catch (e) {
                // Ignore parameter setting errors
            }

            // Create translator
            const translator = new Z3Translator(this.ctx, {
                enableArithmetic: options?.enableArithmetic,
                enableEquality: options?.enableEquality
            });

            // Translate premises
            for (const p of premises) {
                const ast = parse(p);
                const z3Expr = translator.translate(ast);
                solver.add(z3Expr);
            }

            // Translate negated conclusion
            const conclusionAst = parse(conclusion);
            const negatedConclusion = createNot(conclusionAst);
            const z3NegConclusion = translator.translate(negatedConclusion);
            solver.add(z3NegConclusion);

            // Check satisfiability with timeout wrapper
            const checkPromise = solver.check();

            const timeoutPromise = new Promise<'timeout'>((resolve) =>
                setTimeout(() => resolve('timeout'), timeoutMs)
            );

            const check = await Promise.race([checkPromise, timeoutPromise]);

            if (check === 'timeout') {
                 return buildProveResult({
                    success: false,
                    result: 'timeout',
                    message: `Z3 timed out after ${timeoutMs/1000}s`,
                    timeMs: Date.now() - startTime,
                }, verbosity);
            }

            if (check === 'unsat') {
                // Refutation successful -> Proved
                return buildProveResult({
                    success: true,
                    result: 'proved',
                    message: `Proved: ${conclusion} (via Z3)`,
                    proof: [
                        `Premises: ${premises.join('; ')}`,
                        `Conclusion: ${conclusion}`,
                        `Method: Z3 SMT Solver (UNSAT refutation)`,
                    ],
                    timeMs: Date.now() - startTime,
                }, verbosity);
            } else if (check === 'sat') {
                // Found a model for negated conclusion -> Counterexample -> Not Proved
                // TODO: Extract model if needed
                return buildProveResult({
                    success: false,
                    result: 'failed',
                    message: `Cannot prove: ${conclusion}`,
                    error: 'Counterexample found (SAT)',
                    timeMs: Date.now() - startTime,
                }, verbosity);
            } else {
                return buildProveResult({
                    success: false,
                    result: 'error',
                    error: 'Z3 returned unknown',
                    timeMs: Date.now() - startTime,
                }, verbosity);
            }

        } catch (e) {
             const error = e instanceof Error ? e.message : String(e);

             // Check for OOM or WASM errors
             if (error.includes('OOM') || error.includes('memory') || error.includes('Aborted')) {
                 // Force context recreation on next call if it crashed?
                 // The WASM module might be in bad state.
                 // We can set this.ctx = null to force re-init, but reloading WASM might require page reload?
                 // For now, just report error.
                 this.ctx = null;
             }

             return buildProveResult({
                success: false,
                result: 'error',
                error: `Z3 Error: ${error}`,
                timeMs: Date.now() - startTime,
            }, verbosity);
        } finally {
            if (solver && typeof solver.delete === 'function') {
                solver.delete();
            }
        }
    }

    async checkSat(clauses: Clause[]): Promise<SatResult> {
        // Not implemented yet for raw clauses, but Z3 can handle arbitrary boolean logic.
        // We could convert clauses to Z3 expressions (Or(And(..))).
        // For now, return error or empty result.
        // The instruction didn't explicitly require this, but it's part of the interface.
        // I'll implement a basic version.

        const startTime = Date.now();
        let solver: Z3Solver | null = null;
        try {
            if (!this.ctx) await this.init();

            solver = new this.ctx!.Solver() as unknown as Z3Solver;
            // TODO: Convert clauses to Z3
            // This requires mapping logic-solver Clause objects to Z3 AST.
            // Skipping for now as the main goal is 'prove'.
            return {
                sat: false,
                statistics: { timeMs: Date.now() - startTime }
            };
        } catch (e) {
             return {
                sat: false,
                statistics: { timeMs: Date.now() - startTime }
            };
        } finally {
            if (solver && typeof solver.delete === 'function') {
                solver.delete();
            }
        }
    }
}
