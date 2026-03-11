/**
 * SAT Serialization Utilities
 *
 * Handles serialization of literals to string keys for SAT solvers,
 * and parsing them back.
 */

import { Literal } from '../../types/clause.js';
import { astToString } from '../../ast/index.js';
import { parse } from '../../parser/index.js';
import { ASTNode } from '../../types/ast.js';

/**
 * Convert a literal to a unique string key.
 * Format: predicate(arg1,arg2,...)
 */
export function literalToKey(lit: Literal): string {
    const argStrings = lit.args.map(astToString);
    if (argStrings.length === 0) {
        return lit.predicate;
    }
    return `${lit.predicate}(${argStrings.join(',')})`;
}

/**
 * Parsed key components
 */
export interface ParsedKey {
    predicate: string;
    args: string[];
}

/**
 * Parse a SAT key back into predicate and argument strings.
 * Uses the parser for robustness against nested terms.
 */
export function parseKey(key: string): ParsedKey | null {
    try {
        const ast = parse(key);
        if (ast.type === 'predicate') {
            return {
                predicate: ast.name!,
                args: (ast.args || []).map(astToString)
            };
        } else if (ast.type === 'function') {
            // Sometimes parser might see it as function if predicate context isn't clear?
            // But usually top-level is predicate.
            return {
                predicate: ast.name!,
                args: (ast.args || []).map(astToString)
            };
        } else if (ast.type === 'constant') {
             // 0-arity predicate
             return {
                 predicate: ast.name!,
                 args: []
             };
        }
        return null;
    } catch (e) {
        // Fallback or fail
        return null;
    }
}
