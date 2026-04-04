import { ReasoningEngine, EngineCapabilities, EngineProveOptions, SatResult, EngineSession } from '../interface.js';

// Note: z3-solver is optional at runtime in test environments. Use dynamic import inside init().
import { ProveResult, createEngineError } from '../../types/index.js';
import { buildProveResult } from '../../utils/response.js';
import { parse } from '../../parser/index.js';
import { createNot, createEquals, createPredicate } from '../../ast/index.js';
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
    private available = true; // whether z3-solver is available at runtime

    async init(): Promise<void> {
        if (this.ctx) return;

        try {
            // Dynamically import z3-solver so tests and environments without the native
            // package installed won't fail at module resolution time.
            const z3 = await import('z3-solver').catch((err) => {
                throw new Error('z3-solver not available');
            });

            if (!z3 || typeof z3.init !== 'function') {
                throw new Error('z3-solver init not found');
            }

            const { Context } = await z3.init();
            this.ctx = new Context('main') as unknown as Z3Context;
        } catch (e) {
            // If z3 isn't present at runtime, mark unavailable and continue so the manager can
            // fall back to other engines or the engine's fallback behavior.
            this.available = false;
            return;
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

            // If z3 isn't available at runtime, use a lightweight fallback prover for simple cases.
            if (!this.available) {
                // Simple fallbacks when Z3 isn't installed.
                const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
                // If conclusion is present verbatim in premises -> trivially proved
                if (premises.some(p => norm(p) === norm(conclusion))) {
                    return buildProveResult({
                        success: true,
                        result: 'proved',
                        message: `Proved: ${conclusion} (trivial premise)`,
                        proof: [`Premises: ${premises.join('; ')}`, `Conclusion: ${conclusion}`, 'Method: trivial'],
                        timeMs: Date.now() - startTime
                    }, verbosity);
                }

                // Very small heuristic: handle universal instantiation + fact -> derived atom
                const joined = premises.join(' ');
                const uniMatch = /all\s+([a-zA-Z0-9_]+)\s*\(([^)]+)->([^)]+)\)/i.exec(joined);
                if (uniMatch) {
                    const varName = uniMatch[1];
                    const antecedent = uniMatch[2].trim();
                    const consequent = uniMatch[3].trim();

                    // naive substitution of variable to constant from premises
                    for (const p of premises) {
                        const m = new RegExp(antecedent.replace(varName, '(\\w+)')).exec(p);
                        if (m) {
                            const constName = m[1];
                            const expected = consequent.replace(new RegExp(varName, 'g'), constName);
                            if (norm(expected) === norm(conclusion)) {
                                return buildProveResult({
                                    success: true,
                                    result: 'proved',
                                    message: `Proved: ${conclusion} (fallback)`,
                                    proof: [`Premises: ${premises.join('; ')}`, `Conclusion: ${conclusion}`, 'Method: fallback'],
                                    timeMs: Date.now() - startTime
                                }, verbosity);
                            }
                        }
                    }
                }

                return buildProveResult({ success: false, result: 'failed', message: 'Fallback prover could not prove the goal', timeMs: Date.now() - startTime }, verbosity);
            }

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
                    message: `The argument is invalid. A counterexample exists showing the conclusion does not follow from the premises.`,
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
        try {
            if (!this.ctx) await this.init();

            // If z3 isn't available, do a tiny brute-force Boolean search over ground atoms.
            if (!this.available) {
                // Collect ground atom keys like 'P(a)'
                const atoms = new Set<string>();
                for (const c of clauses) {
                    for (const lit of c.literals) {
                        const args = (lit.args || []).map(a => (a as any).name || String(a));
                        atoms.add(`${lit.predicate}(${args.join(',')})`);
                    }
                }
                const atomList = Array.from(atoms);
                const n = atomList.length;
                // For each possible assignment of truth values, check if all clauses satisfied
                const total = 1 << n;
                for (let mask = 0; mask < total; mask++) {
                    const assignment = new Set<string>();
                    for (let i = 0; i < n; i++) {
                        if (mask & (1 << i)) assignment.add(atomList[i]);
                    }
                    let allClausesSat = true;
                    for (const c of clauses) {
                        let clauseSat = false;
                        for (const lit of c.literals) {
                            const args = (lit.args || []).map(a => (a as any).name || String(a));
                            const key = `${lit.predicate}(${args.join(',')})`;
                            const val = assignment.has(key);
                            const litVal = lit.negated ? !val : val;
                            if (litVal) {
                                clauseSat = true;
                                break;
                            }
                        }
                        if (!clauseSat) { allClausesSat = false; break; }
                    }
                    if (allClausesSat) {
                        return { sat: true, statistics: { timeMs: Date.now() - startTime } };
                    }
                }
                return { sat: false, statistics: { timeMs: Date.now() - startTime } };
            }

            let solver: Z3Solver | null = null;
            solver = new this.ctx!.Solver() as unknown as Z3Solver;
            const translator = new Z3Translator(this.ctx!, {
                enableArithmetic: true,
                enableEquality: true
            });

            for (const clause of clauses) {
                const litExprs = clause.literals.map(lit => {
                    const ast = this.literalToAST(lit);
                    return translator.translate(ast) as unknown as Z3Bool;
                });

                if (litExprs.length === 0) {
                    solver.add(this.ctx!.Bool.val(false));
                } else if (litExprs.length === 1) {
                    solver.add(litExprs[0]);
                } else {
                    solver.add(this.ctx!.Or(...litExprs));
                }
            }

            const check = await solver.check();

            if (check === 'sat') {
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
        }
    }

    private literalToAST(lit: Literal): ASTNode {
        let atom: ASTNode;
        if (lit.predicate === '=') {
            atom = createEquals(lit.args![0], lit.args![1]);
        } else {
            atom = createPredicate(lit.predicate, lit.args || []);
        }

        if (lit.negated) {
            return createNot(atom);
        }
        return atom;
    }
}
