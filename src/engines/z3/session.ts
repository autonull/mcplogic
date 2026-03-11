import { EngineSession, EngineProveOptions } from '../interface.js';
import { ProveResult, createEngineError } from '../../types/index.js';
import { buildProveResult } from '../../utils/response.js';
import { parse } from '../../parser/index.js';
import { createNot } from '../../ast/index.js';
import { Z3Translator } from './translator.js';
import { Z3Context, Z3Solver, Z3Bool } from './types.js';

export class Z3Session implements EngineSession {
    private ctx: Z3Context;
    private solver: Z3Solver | null;
    private translator: Z3Translator;
    private initialized = false;

    constructor(ctx: Z3Context, enableArithmetic: boolean = true, enableEquality: boolean = true) {
        this.ctx = ctx;
        // Create a persistent solver
        this.solver = new this.ctx.Solver() as unknown as Z3Solver;
        // Create a persistent translator to maintain symbol tables
        this.translator = new Z3Translator(this.ctx, {
            enableArithmetic,
            enableEquality
        });
        this.initialized = true;
    }

    async assert(formula: string): Promise<void> {
        if (!this.solver) throw createEngineError("Session closed");
        try {
            const node = parse(formula);
            const z3Expr = this.translator.translate(node);
            this.solver.add(z3Expr as unknown as Z3Bool);
        } catch (e) {
            throw createEngineError(`Z3 Assert Error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    async retract(formula: string): Promise<void> {
        // Z3 Solver does not support removing specific constraints easily without push/pop frames
        // matching the insertion order.
        // For arbitrary retraction, we would need to rebuild the solver.
        // Since the interface allows throwing if not supported, we warn or throw.
        // However, the SessionManager handles retraction by rebuilding if needed.
        // So we can throw "NotSupported" or similar.
        throw createEngineError("Z3Session does not support arbitrary retraction. Please rebuild the session.");
    }

    async prove(
        conclusion: string,
        options?: EngineProveOptions
    ): Promise<ProveResult> {
        const startTime = Date.now();
        const verbosity = options?.verbosity || 'standard';

        if (!this.solver) {
             return buildProveResult({
                success: false,
                result: 'error',
                error: 'Session closed',
                timeMs: Date.now() - startTime,
            }, verbosity);
        }

        try {
            // Use push/pop to avoid polluting the session with the negated goal
            this.solver.push();

            const conclusionNode = parse(conclusion);
            const negatedConclusion = createNot(conclusionNode);
            const z3NegConclusion = this.translator.translate(negatedConclusion);

            this.solver.add(z3NegConclusion as unknown as Z3Bool);

            const check = await this.solver.check();

            // Restore solver state (remove negated conclusion)
            this.solver.pop();

            if (check === 'unsat') {
                return buildProveResult({
                    success: true,
                    result: 'proved',
                    message: `Proved: ${conclusion} (via Z3 Session)`,
                    proof: [
                        `Conclusion: ${conclusion}`,
                        `Method: Z3 SMT Solver (Session)`,
                    ],
                    timeMs: Date.now() - startTime,
                }, verbosity);
            } else if (check === 'sat') {
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
            return buildProveResult({
                success: false,
                result: 'error',
                error: `Z3 Session Error: ${error}`,
                timeMs: Date.now() - startTime,
            }, verbosity);
        }
    }

    async close(): Promise<void> {
        if (this.solver) {
            // Context handles cleanup
            this.solver = null;
        }
    }
}
