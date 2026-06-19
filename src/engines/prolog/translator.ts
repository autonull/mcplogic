/**
 * Translator: Prover9 FOL Syntax ↔ Prolog Syntax
 * 
 * Converts between Prover9-style formulas and Tau-Prolog compatible format.
 */

import { parse } from '../../parser/index.js';
import type { ASTNode } from '../../types/index.js';
import {
    createClausificationError,
    createEngineError,
} from '../../types/errors.js';
import { clausify } from '../../logic/clausifier.js';
import { Clause, Literal } from '../../types/clause.js';
import { astToString } from '../../ast/index.js';
import { isArithmeticOperator, isArithmeticPredicate } from '../../axioms/arithmetic.js';

/**
 * Options for translation
 */
export interface TranslatorOptions {
    enableEquality?: boolean;
}

/**
 * Convert a Prover9-style formula to Prolog
 * 
 * Prover9: all x (man(x) -> mortal(x))
 * Prolog:  mortal(X) :- man(X).
 * 
 * Uses clausification to handle Skolemization and normalization.
 * If the formula results in non-Horn clauses, it falls back to legacy translation
 * (which may produce meta-logical terms like (A;B) that are valid Prolog syntax
 * but not executable clauses).
 */
export function folToProlog(formula: string, options?: TranslatorOptions): string[] {
    // Use clausifier to handle Skolemization, NNF, and variable standardization
    const result = clausify(formula);

    if (!result.success || !result.clauses) {
        // Should not happen unless parser fails, which clausify catches
        throw createClausificationError(result.error?.message || 'Clausification failed');
    }

    try {
        return clausesToProlog(result.clauses, options);
    } catch (e) {
        // Not Horn clauses (e.g. A | B).
        // The Prolog engine cannot natively reason with non-Horn clauses as premises.
        // We throw a specific error so the EngineManager can switch to SAT if needed.
        throw createEngineError(
            'Formula is not a Horn clause (contains disjunctions in positive positions). ' +
            'The Prolog engine only supports Horn clauses. Use the SAT engine for general FOL.'
        );
    }
}

/**
 * Convert clauses to Prolog-compatible format.
 * Only works for Horn clauses.
 */
export function clausesToProlog(clauses: Clause[], options?: TranslatorOptions): string[] {
    const prologClauses: string[] = [];

    for (const clause of clauses) {
        const positive = clause.literals.filter(l => !l.negated);
        const negative = clause.literals.filter(l => l.negated);

        if (positive.length === 0) {
            // Goal clause (all negative) - represents a query
            // :- p, q. means "prove p and q"
            const body = negative.map(l => literalToProlog(l, false, options)).join(', ');
            prologClauses.push(`:- ${body}.`);
        } else if (positive.length === 1) {
            const head = literalToProlog(positive[0], false, options);
            if (negative.length === 0) {
                // Fact
                prologClauses.push(`${head}.`);
            } else {
                // Rule
                const body = negative.map(l => literalToProlog(l, false, options)).join(', ');
                prologClauses.push(`${head} :- ${body}.`);
            }
        } else {
            // Not a Horn clause - cannot directly convert
            throw createEngineError('Cannot convert non-Horn clause to Prolog');
        }
    }

    return prologClauses;
}

/**
 * Convert a literal to Prolog format.
 */
function literalToProlog(lit: Literal, useNegation: boolean, options?: TranslatorOptions): string {
    const formatArg = (arg: ASTNode): string => {
        return termToProlog(arg);
    };

    let predicate = lit.predicate;
    if (predicate === '=') {
        // Facts about equality are always stored as eq_fact
        // LogicEngine sets up axioms where eq_step uses eq_fact.
        predicate = 'eq_fact';
    } else {
        // In Prolog, predicates MUST start with a lowercase letter or be single-quoted.
        // We'll just lowercase it to be safe.
        predicate = predicate.toLowerCase();
    }

    const atom = lit.args.length > 0
        ? `${predicate}(${lit.args.map(formatArg).join(', ')})`
        : predicate;

    if (useNegation && lit.negated) {
        return `\\+ ${atom}`;
    }
    return atom;
}

/**
 * Formats a term string (variable or constant) for Prolog.
 */
function simpleFormatPrologTerm(term: string): string {
    if (term.startsWith('_v')) {
        // It's a variable from Clausifier, ensure uppercase for Prolog
        return term.toUpperCase();
    } else if (term.startsWith('sk')) {
        // Skolem constant, ensure lowercase
        return term.toLowerCase();
    } else if (term.length === 1 && /^[a-z]/.test(term)) {
        // Single lowercase letter: Free variable (implicitly universal)
        return term.toUpperCase();
    } else if (/^[a-z][a-zA-Z0-9_]*$/.test(term)) {
        // Lowercase string (length > 1) starting with letter: Constant
        return term;
    } else if (/^-?\d+$/.test(term)) {
        // Integer constant
        return term;
    } else {
        // Uppercase string or other: Constant
        // Example: Socrates -> socrates
        const lower = term.toLowerCase();
        if (/^[a-z][a-zA-Z0-9_]*$/.test(lower)) {
            return lower;
        }
        // If it starts with a number or contains special characters, quote it
        return `'${term}'`;
    }
}

function predicateToProlog(node: ASTNode, options?: TranslatorOptions): string {
    if (node.type !== 'predicate') {
        throw createEngineError(`Expected predicate, got ${node.type} during translation`);
    }

    let name = node.name!.toLowerCase();

    // Map comparison operators to arithmetic predicates
    if (isArithmeticPredicate(name)) {
        if (name === '<') name = 'lt';
        else if (name === '>') name = 'gt';
        else if (name === '<=') name = 'lte';
        else if (name === '>=') name = 'gte';
        else if (name === '!=') name = 'neq'; // Assuming there's a neq or we map it
    }

    if (!node.args || node.args.length === 0) {
        return name;
    }

    const args = node.args.map(termToProlog).join(', ');
    return `${name}(${args})`;
}

function termToProlog(node: ASTNode): string {
    // Handle variables from Clausifier (which might come as constants/predicates if not fully typed in AST)
    // But since we are working with AST nodes, we should rely on node structure.
    // However, clausifier might rename variables to _v... which might be stored as name.

    if (node.name && node.name.startsWith('_v')) {
        return node.name.toUpperCase();
    }

    switch (node.type) {
        case 'variable':
            // Explicit variable node: must be uppercase in Prolog
            return node.name!.toUpperCase();
        case 'constant':
            // Explicit constant node: must be lowercase in Prolog
            return simpleFormatPrologTerm(node.name!);
        case 'function':
            const args = node.args!.map(termToProlog).join(', ');
            let funcName = node.name!.toLowerCase();
            if (isArithmeticOperator(funcName)) {
                if (funcName === '+') funcName = 'plus';
                else if (funcName === '-') funcName = 'minus';
                else if (funcName === '*') funcName = 'times';
                else if (funcName === '/') funcName = 'divide';
                else if (funcName === 'unary_minus') {
                     // unary_minus expects 1 argument but functions like plus expect 2
                     // Actually unary_minus is not easily mapped unless we define an axiom.
                     // The parser gives it 1 arg. Let's let it pass as `unary_minus(X)`.
                }
            }
            return `${funcName}(${args})`;
        // Helper for cases where we might have just a name string node (though AST should be stricter)
        default:
             if (node.type === 'predicate') {
                // Sometimes terms might be parsed as predicates in isolation
                 const args = node.args ? node.args.map(termToProlog).join(', ') : '';
                 const name = node.name!.toLowerCase();
                 return args ? `${name}(${args})` : name;
             }
            throw createEngineError(`Cannot convert ${node.type} to Prolog term`);
    }
}

/**
 * Convert arbitrary FOL to meta-representation in Prolog
 * This allows representing complex formulas that don't fit Horn clause form.
 */
function astToMetaProlog(node: ASTNode, options?: TranslatorOptions): string | null {
    switch (node.type) {
        case 'predicate':
            return predicateToProlog(node, options);

        case 'and':
            return `(${astToMetaProlog(node.left!, options)}, ${astToMetaProlog(node.right!, options)})`;

        case 'or':
            return `(${astToMetaProlog(node.left!, options)}; ${astToMetaProlog(node.right!, options)})`;

        case 'not':
            return `\\+ ${astToMetaProlog(node.operand!, options)}`;

        case 'implies':
            // P -> Q is equivalent to ¬P ∨ Q
            // In Prolog (P -> Q ; true) implements material implication P -> Q
            return `(${astToMetaProlog(node.left!, options)} -> ${astToMetaProlog(node.right!, options)}; true)`;

        case 'iff':
            // P <-> Q is (P -> Q) & (Q -> P)
            const left = astToMetaProlog(node.left!, options);
            const right = astToMetaProlog(node.right!, options);
            return `((${left} -> ${right} ; true), (${right} -> ${left} ; true))`;

        case 'equals':
            if (options?.enableEquality) {
                 return `eq(${astToMetaProlog(node.left!, options)}, ${astToMetaProlog(node.right!, options)})`;
            }
            return `${astToMetaProlog(node.left!, options)} = ${astToMetaProlog(node.right!, options)}`;

        case 'variable':
        case 'constant':
        case 'function':
            return termToProlog(node);

        case 'forall':
            // Universal quantification - in Prolog, typically handled by variables being universal in rules
            return astToMetaProlog(node.body!, options);

        case 'exists':
            // Existential - Prolog handles this through unification
            return astToMetaProlog(node.body!, options);

        default:
            return null;
    }
}

/**
 * Convert a Prolog query result back to FOL format
 */
export function prologResultToFol(result: Record<string, string>): Record<string, string> {
    const folResult: Record<string, string> = {};

    for (const [key, value] of Object.entries(result)) {
        // Convert Prolog uppercase var back to lowercase
        folResult[key.toLowerCase()] = value.toLowerCase();
    }

    return folResult;
}

/**
 * Create a Prolog query from a FOL goal
 */
export function folGoalToProlog(goal: string, options?: TranslatorOptions): string {
    const ast = parse(goal);

    // Check for universal quantifiers which Prolog cannot directly prove via goal query
    if (containsUniversal(ast)) {
        throw createEngineError(
            'Universal quantification (all/forall) in goals is not supported by the Prolog engine. ' +
            'Try using the SAT engine or refutation (negating the goal and checking for contradiction).'
        );
    }

    // Special handling for top-level predicate to avoid meta-call overhead if possible,
    // but only if it's not equality with enableEquality (which converts to eq)
    if (ast.type === 'predicate') {
        return predicateToProlog(ast, options) + '.';
    }

    // For complex goals (including equality if enabled), use meta-representation
    const meta = astToMetaProlog(ast, options);
    return meta ? meta + '.' : '';
}

/**
 * Check if AST contains universal quantifiers
 */
function containsUniversal(node: ASTNode): boolean {
    if (node.type === 'forall') return true;

    if (node.left && containsUniversal(node.left)) return true;
    if (node.right && containsUniversal(node.right)) return true;
    if (node.operand && containsUniversal(node.operand)) return true;
    if (node.body && containsUniversal(node.body)) return true;

    // Note: forall inside existential is also problematic for Prolog goals
    // unless Skolemized, but Prolog goals generally don't support quantifiers well.

    return false;
}

/**
 * Build a complete Prolog program from premises
 */
export function buildPrologProgram(premises: string[], options?: TranslatorOptions): string {
    const allClauses: string[] = [];

    for (const premise of premises) {
        const clauses = folToProlog(premise, options);
        allClauses.push(...clauses);
    }

    return allClauses.join('\n');
}
