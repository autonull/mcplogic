/**
 * SAT Engine
 * 
 * SAT solver backend using the logic-solver package (MiniSat compiled to JS).
 * Handles arbitrary propositional CNF formulas.
 */

import Logic from 'logic-solver';
import { Clause, Literal } from '../../types/clause.js';
import { ProveResult } from '../../types/index.js';
import { buildProveResult } from '../../utils/response.js';
import { clausify } from '../../logic/clausifier.js';
import { parse } from '../../parser/index.js';
import { createAnd, createNot, astToString } from '../../ast/index.js';
import {
    ReasoningEngine,
    EngineCapabilities,
    EngineProveOptions,
    SatResult,
    EngineSession
} from '../interface.js';
import { instantiateClauses } from '../../logic/herbrand/index.js';
import { generateEqualityAxiomsForSAT } from '../../axioms/equality.js';
import { literalToKey } from './serialization.js';
import { SATSession } from './session.js';

/**
 * SAT solver-based reasoning engine.
 * Uses the logic-solver package (MiniSat in JS).
 * 
 * Handles arbitrary CNF formulas including non-Horn clauses.
 * For theorem proving, uses refutation: premises ∧ ¬conclusion is UNSAT → theorem holds.
 */
export class SATEngine implements ReasoningEngine {
    readonly name = 'sat/minisat';
    readonly capabilities: EngineCapabilities = {
        horn: true,
        fullFol: true,  // Handles arbitrary CNF (via instantiation)
        equality: false, // No built-in equality
        arithmetic: false, // No built-in arithmetic
        streaming: false,
    };

    async init(): Promise<void> {
        // No-op for SAT engine (initialized in constructor/sync)
        return Promise.resolve();
    }

    async createSession(): Promise<EngineSession> {
        return new SATSession();
    }

    /**
     * Check satisfiability of clauses using the SAT solver.
     */
    async checkSat(clauses: Clause[]): Promise<SatResult> {
        const startTime = Date.now();

        if (clauses.length === 0) {
            return {
                sat: true,
                model: new Map(),
                statistics: {
                    timeMs: Date.now() - startTime,
                    variables: 0,
                    clauses: 0,
                },
            };
        }

        try {
            const solver = new Logic.Solver();
            const variables = new Set<string>();

            // Convert each clause to logic-solver format
            for (const clause of clauses) {
                if (clause.literals.length === 0) {
                    // Empty clause = unsatisfiable
                    return {
                        sat: false,
                        statistics: {
                            timeMs: Date.now() - startTime,
                            variables: variables.size,
                            clauses: clauses.length,
                        },
                    };
                }

                const disjuncts = clause.literals.map(lit => {
                    const key = literalToKey(lit);
                    variables.add(key);
                    return lit.negated ? Logic.not(key) : key;
                });

                // Add the clause as a disjunction
                solver.require(Logic.or(...disjuncts));
            }

            // Solve
            const solution = solver.solve();

            if (solution) {
                // Extract model
                const model = new Map<string, boolean>();
                for (const v of variables) {
                    model.set(v, solution.getTrueVars().includes(v));
                }

                return {
                    sat: true,
                    model,
                    statistics: {
                        timeMs: Date.now() - startTime,
                        variables: variables.size,
                        clauses: clauses.length,
                    },
                };
            } else {
                return {
                    sat: false,
                    statistics: {
                        timeMs: Date.now() - startTime,
                        variables: variables.size,
                        clauses: clauses.length,
                    },
                };
            }
        } catch (e) {
            return {
                sat: false,
                statistics: {
                    timeMs: Date.now() - startTime,
                    clauses: clauses.length,
                },
            };
        }
    }

    /**
     * Prove a conclusion from premises using refutation.
     * 
     * Method: Clausify (premises ∧ ¬conclusion) and check for UNSAT.
     * If UNSAT, the conclusion follows from the premises.
     */
    async prove(
        premises: string[],
        conclusion: string,
        options?: EngineProveOptions
    ): Promise<ProveResult> {
        const startTime = Date.now();
        const verbosity = options?.verbosity || 'standard';

        try {
            // Build the refutation formula: premises & -conclusion
            // Use AST construction to avoid string parsing issues
            const premiseNodes = premises.map(p => parse(p));
            const conclusionNode = parse(conclusion);
            const negatedConclusion = createNot(conclusionNode);

            // Combine all formulas with AND
            const allNodes = [...premiseNodes, negatedConclusion];
            // If only one node (no premises), just use it. If multiple, reduce with AND.
            // Note: createAnd takes 2 args.
            const refutationAST = allNodes.length > 0
                ? allNodes.reduce((acc, node) => createAnd(acc, node))
                : negatedConclusion; // Should not happen given premises+conclusion

            // Clausify 
            // Use Tseitin strategy for SAT to avoid exponential blowup
            const clausifyResult = clausify(refutationAST, { strategy: 'tseitin' });

            if (!clausifyResult.success || !clausifyResult.clauses) {
                return buildProveResult({
                    success: false,
                    result: 'error',
                    error: clausifyResult.error?.message || 'Clausification failed',
                    timeMs: Date.now() - startTime,
                }, verbosity);
            }

            let allClauses = clausifyResult.clauses;

            // Inject equality axioms if enabled
            if (options?.enableEquality) {
                const axiomsResult = generateEqualityAxiomsForSAT(allClauses);
                if (axiomsResult.success && axiomsResult.clauses) {
                    allClauses = [...allClauses, ...axiomsResult.clauses];
                }
            }

            // Instantiate variables (Grounding)
            const groundClauses = instantiateClauses(allClauses);

            // Check satisfiability
            const satResult = await this.checkSat(groundClauses);

            if (!satResult.sat) {
                return buildProveResult({
                    success: true,
                    result: 'proved',
                    message: `Proved: ${conclusion} (via refutation)`,
                    proof: [
                        `Premises: ${premises.join('; ')}`,
                        `Conclusion: ${conclusion}`,
                        `Method: Refutation (premises ∧ ¬conclusion is UNSAT)`,
                    ],
                    timeMs: Date.now() - startTime,
                    clauseCount: groundClauses.length,
                    varCount: satResult.statistics?.variables,
                }, verbosity);
            } else {
                return buildProveResult({
                    success: false,
                    result: 'failed',
                    message: `Cannot prove: ${conclusion}`,
                    error: 'Found satisfying assignment for premises ∧ ¬conclusion',
                    timeMs: Date.now() - startTime,
                    clauseCount: groundClauses.length,
                    varCount: satResult.statistics?.variables,
                }, verbosity);
            }
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            return buildProveResult({
                success: false,
                result: 'error',
                error,
                timeMs: Date.now() - startTime,
            }, verbosity);
        }
    }
}

/**
 * Create a new SAT engine instance.
 */
export function createSATEngine(): SATEngine {
    return new SATEngine();
}
