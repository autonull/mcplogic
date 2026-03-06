/**
 * Model Finder - Finite model enumeration
 *
 * Equivalent to Mace4 - finds finite models or counterexamples.
 */

import { parse } from '../parser/index.js';
import { Model, ModelResult, ModelOptions, DEFAULTS } from '../types/index.js';
import { extractSignature, getFreeVariables, astToString } from '../ast/index.js';
import { createGenericError } from '../types/errors.js';
import { SATEngine } from '../engines/sat/index.js';
import { findModelsSAT } from './strategies/sat.js';
import { findModelsBacktracking } from './strategies/backtracking.js';
import { formatModelString } from '../utils/response.js';
import { EngineManager } from '../engines/manager.js';

export type { Model, ModelResult };

/**
 * Model Finder for finite domains
 */
export class ModelFinder {
    private timeout: number;
    private maxDomainSize: number;
    private satEngine = new SATEngine();
    private engineManager?: EngineManager;

    constructor(timeout: number = 10000, maxDomainSize: number = 25, engineManager?: EngineManager) {
        this.timeout = timeout;
        this.maxDomainSize = maxDomainSize;
        this.engineManager = engineManager;
    }

    /**
     * Find a model satisfying the premises
     */
    async findModel(
        premises: string[],
        options?: ModelOptions
    ): Promise<ModelResult> {
        const opts = { ...DEFAULTS, ...options };
        const startTime = Date.now();
        const startSize = 1;
        const endSize = opts.maxDomainSize ?? this.maxDomainSize;

        try {
            // Parse all premises
            const asts = premises.map(p => parse(p));

            // Extract signature (predicates, constants, functions)
            const signature = extractSignature(asts);

            // Treat free variables as constants (Skolemization for model finding)
            const freeVars = new Set<string>();
            for (const ast of asts) {
                const free = getFreeVariables(ast);
                for (const v of free) {
                    freeVars.add(v);
                }
            }

            for (const v of freeVars) {
                signature.constants.add(v);
                signature.variables.delete(v);
            }

            // Restore contradiction check, but use safe premises
            if (this.engineManager && premises.length > 0) {
                // Ensure free variables parse as constants by renaming them before passing to the engine
                const safeAsts = premises.map(p => parse(p));
                const renameFreeVars = (node: any, bound: Set<string>) => {
                    if (node.type === 'forall' || node.type === 'exists') {
                        const newBound = new Set(bound);
                        if (node.variable) newBound.add(node.variable);
                        if (node.body) renameFreeVars(node.body, newBound);
                        return;
                    }
                    if (node.type === 'variable' && node.name && freeVars.has(node.name) && !bound.has(node.name)) {
                        node.type = 'constant';
                        node.name = `sk_c_${node.name}`;
                    }
                    if (node.left) renameFreeVars(node.left, bound);
                    if (node.right) renameFreeVars(node.right, bound);
                    if (node.operand) renameFreeVars(node.operand, bound);
                    if (node.args) {
                        for (const arg of node.args) renameFreeVars(arg, bound);
                    }
                };

                for (const ast of safeAsts) {
                    renameFreeVars(ast, new Set());
                }
                const safePremises = safeAsts.map(a => astToString(a));

                const contradictionCheck = await this.engineManager.prove(safePremises, 'contradiction_probe & -contradiction_probe', { maxSeconds: 2, engine: 'sat' });
                if (contradictionCheck.result === 'proved') {
                    return { success: false, result: 'no_model', interpretation: 'Premises are contradictory' };
                }
            }

            // Try increasing domain sizes
            for (let size = startSize; size <= endSize; size++) {
                if (opts.onProgress) {
                    opts.onProgress(size / endSize, `Searching domain size ${size}...`);
                }

                if (Date.now() - startTime > (opts.maxSeconds ?? 30) * 1000) {
                    return { success: false, result: 'timeout' };
                }

                const shouldUseSAT = opts.useSAT === true || (opts.useSAT === 'auto' && size > opts.satThreshold!);
                const count = opts.count ?? 1;
                const foundModels: Model[] = [];

                if (shouldUseSAT) {
                    const models = await findModelsSAT(premises, size, opts, this.satEngine);
                    foundModels.push(...models);
                } else {
                    // Backtracking search
                    const models = findModelsBacktracking(asts, signature, size, opts, count);
                    foundModels.push(...models);
                }

                if (foundModels.length > 0) {
                    return {
                        success: true,
                        result: 'model_found',
                        model: foundModels[0], // Primary model for backward compatibility
                        models: foundModels,
                        interpretation: formatModelString(foundModels[0]),
                        statistics: {
                            domainSize: size,
                            searchedSizes: Array.from({ length: size - startSize + 1 }, (_, i) => startSize + i),
                            timeMs: Date.now() - startTime
                        }
                    };
                }
            }

            return {
                success: false,
                result: 'no_model',
                statistics: {
                    domainSize: endSize,
                    searchedSizes: Array.from({ length: endSize - startSize + 1 }, (_, i) => startSize + i),
                    timeMs: Date.now() - startTime
                }
            };
        } catch (e) {
            const error = e instanceof Error ? e : createGenericError('ENGINE_ERROR', String(e));
            return {
                success: false,
                result: 'error',
                error: error.message
            };
        }
    }

    /**
     * Find a counterexample (model where premises true but conclusion false)
     */
    async findCounterexample(
        premises: string[],
        conclusion: string,
        options?: ModelOptions
    ): Promise<ModelResult> {
        // A counterexample is a model of premises ∧ ¬conclusion
        const negatedConclusion = `-(${conclusion.replace(/\.$/, '')})`;

        const result = await this.findModel(
            [...premises, negatedConclusion],
            options
        );

        if (result.success) {
            result.interpretation = `Counterexample found: The premises are satisfied but the conclusion '${conclusion}' is FALSE in this model.`;
        }

        return result;
    }
}

/**
 * Create a model finder instance
 */
export function createModelFinder(timeout?: number, maxDomainSize?: number, engineManager?: EngineManager): ModelFinder {
    return new ModelFinder(timeout, maxDomainSize, engineManager);
}
