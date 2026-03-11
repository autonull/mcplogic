import * as clingoWasm from 'clingo-wasm';
import { ReasoningEngine, EngineCapabilities, EngineProveOptions, SatResult, EngineSession } from '../interface.js';
import { ProveResult, createEngineError } from '../../types/index.js';
import { buildProveResult } from '../../utils/response.js';
import { parse } from '../../parser/index.js';
import { createNot, createAnd } from '../../ast/index.js';
import { clausify } from '../../logic/clausifier.js';
import { clausesToASP } from './translator.js';
import { Clause } from '../../types/clause.js';
import { ClingoSession } from './session.js';

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

    async init(): Promise<void> {
        if (this.initialized) return;
        try {
            // Handle module resolution differences
            const clingo = (clingoWasm as any).default || clingoWasm;

            // Check if we are in a browser environment
            if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
                // In browser, we need to locate the wasm file
                await (clingo.init as any)('/vendor/clingo-wasm/clingo.wasm');
            } else {
                // In Node, init takes no arguments or handles it internally
                await (clingo.init as any)();
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
            const premiseNodes = premises.map(p => parse(p));
            const conclusionNode = parse(conclusion);
            const negatedConclusion = createNot(conclusionNode);

            const allNodes = [...premiseNodes, negatedConclusion];
            const refutationAST = allNodes.length > 0
                ? allNodes.reduce((acc, node) => createAnd(acc, node))
                : negatedConclusion;

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
            // run(program: string, models?: number, options?: string[])
            // Resolve clingo object again for usage
            const clingo = (clingoWasm as any).default || clingoWasm;
            const result = await clingo.run(aspProgram, 1);

            // 5. Interpret result
            // If models found -> SAT (Counterexample) -> Failed to prove
            // If no models -> UNSAT -> Proved

            if (result.Result === 'SATISFIABLE') {
                return buildProveResult({
                    success: false,
                    result: 'failed',
                    message: `Cannot prove: ${conclusion}`,
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
                 // Handle ClingoError
                 const errorMsg = (result as any).Error || 'Unknown Clingo Error';
                 return buildProveResult({
                    success: false,
                    result: 'error',
                    error: `Clingo Error: ${errorMsg}`,
                    timeMs: Date.now() - startTime,
                }, verbosity);
            } else {
                 // UNKNOWN or other
                 const warnings = (result as any).Warnings ? (result as any).Warnings.join('\n') : '';
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
            const clingo = (clingoWasm as any).default || clingoWasm;
            const result = await clingo.run(aspProgram, 1);

            if (result.Result === 'SATISFIABLE') {
                // Extract model if needed.
                // Models are in result.Call[0].Witnesses[0].Value (array of strings)
                const model = new Map<string, boolean>();
                if ('Call' in result && result.Call && result.Call.length > 0) {
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
