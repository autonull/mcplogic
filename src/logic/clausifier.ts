/**
 * Clausifier - CNF Transformation
 *
 * Converts arbitrary First-Order Logic formulas to Conjunctive Normal Form (CNF).
 * Implements the standard clausification algorithm:
 * 1. Eliminate biconditionals (↔)
 * 2. Eliminate implications (→)
 * 3. Push negations inward (NNF)
 * 4. Standardize variables (unique names per quantifier)
 * 5. Skolemize (eliminate existential quantifiers)
 * 6. Drop universal quantifiers
 * 7. Distribute OR over AND (CNF)
 * 8. Extract clauses
 */

import { parse } from '../parser/index.js';
import type { ASTNode } from '../types/ast.js';
import { countNodes } from '../ast/index.js';
import {
    Clause,
    ClausifyOptions,
    ClausifyResult,
    createSkolemEnv,
    isTautology,
} from './clause.js';
import {
    toNNF,
    standardizeVariables,
    skolemize,
    dropUniversals,
} from './transform/index.js';
import { createClausificationError, createGenericError } from '../types/errors.js';
import { toCNF } from './cnf.js';
import { toCNFTseitin } from './transform/tseitin.js';

/** Default clausification options */
const DEFAULT_OPTIONS: Required<Omit<ClausifyOptions, 'skolemEnv'>> = {
    maxClauses: 10000,
    maxClauseSize: 50,
    timeout: 5000,
    strategy: 'standard',
    _nodeCount: 0,
};

/**
 * Clausify a FOL formula string or AST.
 *
 * @param formula - The FOL formula to clausify (string or AST)
 * @param options - Clausification options
 * @returns ClausifyResult with clauses or error
 */
export function clausify(formula: string | ASTNode, options: ClausifyOptions = {}): ClausifyResult {
    const startTime = Date.now();
    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
        const ast = typeof formula === 'string' ? parse(formula) : formula;
        const originalSize = countNodes(ast);

        // Step 1-3: Convert to Negation Normal Form
        const nnf = toNNF(ast);

        // Step 4: Standardize variables
        const standardized = standardizeVariables(nnf);

        // Step 5: Skolemize
        // Use provided SkolemEnv or create a new one
        const skolemEnv = opts.skolemEnv || createSkolemEnv();
        const skolemized = skolemize(standardized, skolemEnv);

        // Step 6: Drop universal quantifiers
        const quantifierFree = dropUniversals(skolemized);

        // Step 7-8: Convert to CNF and extract clauses
        let clauses: Clause[];
        if (opts.strategy === 'tseitin') {
            clauses = toCNFTseitin(quantifierFree, skolemEnv);
        } else {
            clauses = toCNF(quantifierFree, opts, startTime);
        }

        // Filter tautologies
        const filteredClauses = clauses.filter(c => !isTautology(c));

        const timeMs = Date.now() - startTime;
        const maxClauseSize = filteredClauses.reduce(
            (max, c) => Math.max(max, c.literals.length),
            0
        );

        return {
            success: true,
            clauses: filteredClauses,
            skolemFunctions: new Map(skolemEnv.generatedSkolems),
            statistics: {
                originalSize,
                clauseCount: filteredClauses.length,
                maxClauseSize,
                timeMs,
            },
        };
    } catch (e) {
        const timeMs = Date.now() - startTime;

        // Preserve LogicError if it has a code
        if (e && typeof e === 'object' && 'error' in e && (e as any).error?.code) {
             const logicErr = (e as any).error;
             return {
                success: false,
                error: logicErr,
                statistics: {
                    originalSize: 0,
                    clauseCount: 0,
                    maxClauseSize: 0,
                    timeMs,
                },
             };
        }

        const error = e instanceof Error ? e : createGenericError('CLAUSIFICATION_ERROR', String(e));

        return {
            success: false,
            error: createClausificationError(error.message).error,
            statistics: {
                originalSize: 0,
                clauseCount: 0,
                maxClauseSize: 0,
                timeMs,
            },
        };
    }
}

/**
 * Check if a formula is already in Horn clause form.
 * A Horn clause has at most one positive literal.
 */
export function isHornFormula(clauses: Clause[]): boolean {
    for (const clause of clauses) {
        const positiveCount = clause.literals.filter(l => !l.negated).length;
        if (positiveCount > 1) return false;
    }
    return true;
}

export { clausesToDIMACS } from './clause.js';
export {
    toNNF,
    standardizeVariables,
    skolemize,
    dropUniversals,
} from './transform/index.js';
export { toCNF } from './cnf.js';
