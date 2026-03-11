import { EngineSession, EngineProveOptions } from '../interface.js';
import { ProveResult, createEngineError } from '../../types/index.js';
import { buildProveResult } from '../../utils/response.js';
import { parse } from '../../parser/index.js';
import { createNot } from '../../ast/index.js';
import { clausify } from '../../logic/clausifier.js';
import { SkolemEnv } from '../../types/clause.js';
import { clausesToASP } from './translator.js';
import * as clingoWasm from 'clingo-wasm';

export class ClingoSession implements EngineSession {
    private program: string = '';
    private skolemEnv: SkolemEnv;
    private initialized = false;

    constructor() {
        this.skolemEnv = {
            counter: 0,
            skolemMap: new Map(),
            universalVars: [],
            generatedSkolems: new Map()
        };
    }

    async init() {
        if (!this.initialized) {
            const clingo = (clingoWasm as any).default || clingoWasm;
            if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
                await (clingo.init as any)('/vendor/clingo-wasm/clingo.wasm');
            } else {
                await (clingo.init as any)();
            }
            this.initialized = true;
        }
    }

    async assert(formula: string): Promise<void> {
        try {
            const ast = parse(formula);
            // We reuse the skolemEnv to ensure consistency of Skolem constants across assertions
            const result = clausify(ast, { skolemEnv: this.skolemEnv });

            if (!result.success || !result.clauses) {
                 throw createEngineError(`Clausification failed: ${result.error?.message}`);
            }

            const asp = clausesToASP(result.clauses);
            this.program += asp + '\n';
        } catch (e) {
            throw createEngineError(`Clingo Session Assert Error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    async retract(formula: string): Promise<void> {
        throw createEngineError("ClingoSession does not support arbitrary retraction. Please rebuild the session.");
    }

    async prove(
        conclusion: string,
        options?: EngineProveOptions
    ): Promise<ProveResult> {
        const startTime = Date.now();
        const verbosity = options?.verbosity || 'standard';

        try {
            if (!this.initialized) await this.init();

            // Negate conclusion
            const conclusionNode = parse(conclusion);
            const negatedConclusion = createNot(conclusionNode);

            const result = clausify(negatedConclusion, { skolemEnv: this.skolemEnv });
            if (!result.success || !result.clauses) {
                 return buildProveResult({
                    success: false,
                    result: 'error',
                    error: result.error?.message || 'Clausification of conclusion failed',
                    timeMs: Date.now() - startTime,
                }, verbosity);
            }

            const aspConclusion = clausesToASP(result.clauses);
            const fullProgram = this.program + '\n' + aspConclusion;

            // Run Clingo
            // run(program: string, models?: number, options?: string[])
            const clingo = (clingoWasm as any).default || clingoWasm;
            const runResult = await clingo.run(fullProgram, 1);

            if (runResult.Result === 'SATISFIABLE') {
                return buildProveResult({
                    success: false,
                    result: 'failed',
                    message: `Cannot prove: ${conclusion}`,
                    error: 'Counterexample found (SAT)',
                    timeMs: Date.now() - startTime,
                }, verbosity);
            } else if (runResult.Result === 'UNSATISFIABLE') {
                return buildProveResult({
                    success: true,
                    result: 'proved',
                    message: `Proved: ${conclusion} (via Clingo Session)`,
                    proof: [
                        `Conclusion: ${conclusion}`,
                        `Method: Clingo ASP Solver (Session)`,
                    ],
                    timeMs: Date.now() - startTime,
                }, verbosity);
            } else if (runResult.Result === 'ERROR') {
                 const errorMsg = (runResult as any).Error || 'Unknown Clingo Error';
                 return buildProveResult({
                    success: false,
                    result: 'error',
                    error: `Clingo Error: ${errorMsg}`,
                    timeMs: Date.now() - startTime,
                }, verbosity);
            } else {
                 const warnings = (runResult as any).Warnings ? (runResult as any).Warnings.join('\n') : '';
                 return buildProveResult({
                    success: false,
                    result: 'error',
                    error: `Clingo returned ${runResult.Result}. ${warnings}`,
                    timeMs: Date.now() - startTime,
                }, verbosity);
            }

        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            return buildProveResult({
                success: false,
                result: 'error',
                error: `Clingo Session Error: ${error}`,
                timeMs: Date.now() - startTime,
            }, verbosity);
        }
    }

    async close(): Promise<void> {
        // No cleanup needed for Clingo session (pure string state)
    }
}
