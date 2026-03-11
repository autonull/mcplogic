import { init } from 'z3-solver';
import { ReasoningEngine, EngineCapabilities, EngineProveOptions, SatResult, EngineSession } from '../interface.js';
import { ProveResult, createEngineError } from '../../types/index.js';
import { buildProveResult } from '../../utils/response.js';
import { parse } from '../../parser/index.js';
import { createNot } from '../../ast/index.js';
import { Z3Translator } from './translator.js';
import { Clause, Literal } from '../../types/clause.js';
import { Z3Session } from './session.js';
import { Z3Context, Z3Solver, Z3Bool } from './types.js';
import { ASTNode } from '../../types/ast.js';

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

    async close(): Promise<void> {
        this.ctx = null;
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

            // Create translator
            const translator = new Z3Translator(this.ctx!, {
                enableArithmetic: options?.enableArithmetic,
                enableEquality: options?.enableEquality
            });

            // Translate premises
            for (const p of premises) {
                const ast = parse(p);
                const z3Expr = translator.translate(ast);
                solver.add(z3Expr as unknown as Z3Bool);
            }

            // Translate negated conclusion
            const conclusionAst = parse(conclusion);
            const negatedConclusion = createNot(conclusionAst);
            const z3NegConclusion = translator.translate(negatedConclusion);
            solver.add(z3NegConclusion as unknown as Z3Bool);

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
                 this.ctx = null;
             }

             return buildProveResult({
                success: false,
                result: 'error',
                error: `Z3 Error: ${error}`,
                timeMs: Date.now() - startTime,
            }, verbosity);
        } finally {
            // Context handles cleanup
        }
    }

    async checkSat(clauses: Clause[]): Promise<SatResult> {
        const startTime = Date.now();
        let solver: Z3Solver | null = null;
        try {
            if (!this.ctx) await this.init();

            solver = new this.ctx!.Solver() as unknown as Z3Solver;
            const translator = new Z3Translator(this.ctx!, {
                // Assume basic capabilities for clauses, or infer from clause content?
                // Clauses usually come from CNF which might have arithmetic if skolemized/tseitined?
                // For now enable both as Z3 handles them.
                enableArithmetic: true,
                enableEquality: true
            });

            for (const clause of clauses) {
                // Convert literals to Z3 Exprs
                const litExprs = clause.literals.map(lit => {
                    const ast = this.literalToAST(lit);
                    return translator.translate(ast) as unknown as Z3Bool;
                });

                if (litExprs.length === 0) {
                    // Empty clause is false
                    solver.add(this.ctx!.Bool.val(false));
                } else if (litExprs.length === 1) {
                    solver.add(litExprs[0]);
                } else {
                    solver.add(this.ctx!.Or(...litExprs));
                }
            }

            const check = await solver.check();

            if (check === 'sat') {
                // We could extract model here
                return {
                    sat: true,
                    statistics: { timeMs: Date.now() - startTime }
                };
            } else {
                return {
                    sat: false,
                    statistics: { timeMs: Date.now() - startTime }
                };
            }
        } catch (e) {
            return {
                sat: false,
                error: e instanceof Error ? e.message : String(e),
                statistics: { timeMs: Date.now() - startTime }
            };
        } finally {
            // Context handles cleanup
        }
    }

    private literalToAST(lit: Literal): ASTNode {
        let atom: ASTNode;
        if (lit.predicate === '=') {
            atom = {
                type: 'equals',
                left: lit.args![0],
                right: lit.args![1]
            };
        } else {
            atom = {
                type: 'predicate',
                name: lit.predicate,
                args: lit.args
            };
        }

        if (lit.negated) {
            return { type: 'not', operand: atom };
        }
        return atom;
    }
}
