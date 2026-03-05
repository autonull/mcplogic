import * as clingoWasm from 'clingo-wasm';
import { ReasoningEngine, EngineCapabilities, EngineProveOptions, SatResult, EngineSession } from '../interface.js';
import { ProveResult, createEngineError } from '../../types/index.js';
import { buildProveResult } from '../../utils/response.js';
import { clausify } from '../../logic/clausifier.js';
import { clausesToASP } from './translator.js';
import { Clause } from '../../types/clause.js';
import { ClingoSession } from './session.js';
import { createRefutation } from '../../logic/utils.js';

// Define minimal types for clingo-wasm interactions to avoid 'as any' scattering
interface ClingoModule {
    init: (path?: string) => Promise<void>;
    run: (program: string, models?: number, options?: string[]) => Promise<ClingoResult>;
}

interface ClingoResult {
    Result: 'SATISFIABLE' | 'UNSATISFIABLE' | 'UNKNOWN' | 'ERROR';
    Call?: ClingoCall[];
    Error?: string;
    Warnings?: string[];
}

interface ClingoCall {
    Witnesses: { Value: string[] }[];
}

export class ClingoEngine implements ReasoningEngine {
    readonly name = 'clingo';
    readonly capabilities: EngineCapabilities = {
        horn: true,
        fullFol: true, // Via clausification + ASP disjunctive rules
        equality: true, // Limited (ASP has =)
        arithmetic: true, // ASP has arithmetic
        streaming: false,
    };

    private initialized = false;
    private clingo: ClingoModule | null = null;

    async init(): Promise<void> {
        if (this.initialized) return;
        try {
            // Handle module resolution differences
            // clingo-wasm can be imported as default or named export depending on environment/bundler
            const clingoLib = (clingoWasm as Record<string, any>).default || clingoWasm;
            this.clingo = clingoLib as ClingoModule;

            // Check if we are in a browser environment
            if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
                // In browser, we need to locate the wasm file
                // The cast is necessary because the TS definitions for clingo-wasm might be incomplete regarding init parameters
                await (this.clingo!.init as unknown as (path: string) => Promise<void>)('/vendor/clingo-wasm/clingo.wasm');
            } else {
                // In Node, init takes no arguments or handles it internally
                await (this.clingo!.init as unknown as () => Promise<void>)();
            }
            this.initialized = true;
        } catch (e) {
            throw createEngineError(`Failed to initialize Clingo: ${e}`);
        }
    }

    async createSession(): Promise<EngineSession> {
        if (!this.initialized) await this.init();
        return new ClingoSession();
    }

    async prove(
        premises: string[],
        conclusion: string,
        options?: EngineProveOptions
    ): Promise<ProveResult> {
        const startTime = Date.now();
        const verbosity = options?.verbosity || 'standard';

        try {
            if (!this.initialized) await this.init();

            // 1. Build refutation: premises & not(conclusion)
            const refutationAST = createRefutation(premises, conclusion);

            // 2. Clausify
            const clausifyResult = clausify(refutationAST);
            if (!clausifyResult.success || !clausifyResult.clauses) {
                 return buildProveResult({
                    success: false,
                    result: 'error',
                    error: clausifyResult.error?.message || 'Clausification failed',
                    timeMs: Date.now() - startTime,
                }, verbosity);
            }

            // 3. Convert to ASP
            const aspProgram = clausesToASP(clausifyResult.clauses);

            // 4. Run Clingo
            // We want to find if there are ANY models.
            const result = await this.clingo!.run(aspProgram, 1);

            // 5. Interpret result
            // If models found -> SAT (Counterexample) -> Failed to prove
            // If no models -> UNSAT -> Proved

            if (result.Result === 'SATISFIABLE') {
                return buildProveResult({
                    success: false,
                    result: 'failed',
                    message: `The argument is invalid. A counterexample exists showing the conclusion does not follow from the premises.`,
                    error: 'Counterexample found (SAT)',
                    timeMs: Date.now() - startTime,
                }, verbosity);
            } else if (result.Result === 'UNSATISFIABLE') {
                return buildProveResult({
                    success: true,
                    result: 'proved',
                    message: `Proved: ${conclusion} (via Clingo)`,
                    proof: [
                        `Premises: ${premises.join('; ')}`,
                        `Conclusion: ${conclusion}`,
                        `Method: Clingo ASP Solver (UNSAT refutation)`,
                        `ASP Program:`,
                        aspProgram
                    ],
                    timeMs: Date.now() - startTime,
                }, verbosity);
            } else if (result.Result === 'ERROR') {
                 const errorMsg = result.Error || 'Unknown Clingo Error';
                 return buildProveResult({
                    success: false,
                    result: 'error',
                    error: `Clingo Error: ${errorMsg}`,
                    timeMs: Date.now() - startTime,
                }, verbosity);
            } else {
                 // UNKNOWN or other
                 const warnings = result.Warnings ? result.Warnings.join('\n') : '';
                 return buildProveResult({
                    success: false,
                    result: 'error',
                    error: `Clingo returned ${result.Result}. ${warnings}`,
                    timeMs: Date.now() - startTime,
                }, verbosity);
            }

        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            return buildProveResult({
                success: false,
                result: 'error',
                error: `Clingo Error: ${error}`,
                timeMs: Date.now() - startTime,
            }, verbosity);
        }
    }

    async checkSat(clauses: Clause[]): Promise<SatResult> {
        const startTime = Date.now();
        try {
            if (!this.initialized) await this.init();

            const aspProgram = clausesToASP(clauses);
            const result = await this.clingo!.run(aspProgram, 1);

            if (result.Result === 'SATISFIABLE') {
                // Extract model if needed.
                const model = new Map<string, boolean>();
                if (result.Call && result.Call.length > 0) {
                     const witnesses = result.Call[result.Call.length - 1].Witnesses;
                     if (witnesses && witnesses.length > 0) {
                         witnesses[0].Value.forEach((atom: string) => model.set(atom, true));
                     }
                }

                return {
                    sat: true,
                    model,
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
                statistics: { timeMs: Date.now() - startTime }
            };
        }
    }
}
