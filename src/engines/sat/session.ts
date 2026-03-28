import { EngineSession, EngineProveOptions } from '../interface.js';
import { ProveResult, createEngineError } from '../../types/index.js';
import { buildProveResult } from '../../utils/response.js';
import { parse } from '../../parser/index.js';
import { createNot } from '../../ast/index.js';
import { clausify } from '../../logic/clausifier.js';
import { SkolemEnv, Clause } from '../../types/clause.js';
import { SATEngine } from './index.js';
import { instantiateClauses } from '../../logic/herbrand/index.js';
import { generateEqualityAxiomsForSAT } from '../../axioms/equality.js';

export class SATSession implements EngineSession {
    private engine: SATEngine;
    private clauses: Clause[] = [];
    private skolemEnv: SkolemEnv;

    constructor() {
        this.engine = new SATEngine();
        this.skolemEnv = {
            counter: 0,
            skolemMap: new Map(),
            universalVars: [],
            generatedSkolems: new Map(),
            tseitinCounter: 0
        };
    }

    async assert(formula: string): Promise<void> {
        try {
            // Clausify with Tseitin strategy + persistent environment
            const result = clausify(formula, {
                strategy: 'tseitin',
                skolemEnv: this.skolemEnv
            });

            if (!result.success || !result.clauses) {
                throw createEngineError(`SAT Session Clausification failed: ${result.error?.message}`);
            }

            this.clauses.push(...result.clauses);
        } catch (e) {
            throw createEngineError(`SAT Session Assert Error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    async retract(formula: string): Promise<void> {
         throw createEngineError("SATSession does not support arbitrary retraction. Please rebuild the session.");
    }

    async prove(
        conclusion: string,
        options?: EngineProveOptions
    ): Promise<ProveResult> {
        const startTime = Date.now();
        const verbosity = options?.verbosity || 'standard';

        try {
            // 1. Clausify negated conclusion
            const conclusionNode = parse(conclusion);
            const negatedConclusion = createNot(conclusionNode);

            // Use same skolemEnv
            const result = clausify(negatedConclusion, {
                strategy: 'tseitin',
                skolemEnv: this.skolemEnv
            });

            if (!result.success || !result.clauses) {
                 return buildProveResult({
                    success: false,
                    result: 'error',
                    error: result.error?.message || 'Clausification of conclusion failed',
                    timeMs: Date.now() - startTime,
                }, verbosity);
            }

            // Combine assertions + negated conclusion
            let currentClauses = [...this.clauses, ...result.clauses];

            // 2. Inject equality axioms if enabled
            if (options?.enableEquality) {
                const axiomsResult = generateEqualityAxiomsForSAT(currentClauses);
                if (axiomsResult.success && axiomsResult.clauses) {
                    currentClauses = [...currentClauses, ...axiomsResult.clauses];
                }
            }

            // 3. Ground (Instantiate)
            // This must be done on the full set of clauses
            const groundClauses = instantiateClauses(currentClauses);

            // 4. Check SAT
            const satResult = await this.engine.checkSat(groundClauses);

            if (!satResult.sat) {
                return buildProveResult({
                    success: true,
                    result: 'proved',
                    message: `Proved: ${conclusion} (via SAT Refutation)`,
                    proof: [
                        `Conclusion: ${conclusion}`,
                        `Method: SAT Refutation (UNSAT)`,
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
                    error: 'Counterexample found (SAT)',
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
                error: `SAT Session Error: ${error}`,
                timeMs: Date.now() - startTime,
            }, verbosity);
        }
    }

    async close(): Promise<void> {
        // No cleanup needed for SAT session (GC handled)
    }
}
