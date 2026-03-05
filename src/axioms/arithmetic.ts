/**
 * Arithmetic Support for FOL
 * 
 * Translates arithmetic expressions in FOL to Tau-Prolog's built-in `is/2`.
 * 
 * Supported operators:
 * - Arithmetic: +, -, *, /, mod
 * - Comparison: <, >, =<, >=, =:=, =\=
 * 
 * Note: Tau-Prolog uses standard Prolog arithmetic:
 * - `X is 2 + 2` evaluates arithmetic
 * - `X > 0` compares numeric values
 */

import { ASTNode } from '../types/index.js';

/**
 * Check if an AST node contains arithmetic expressions.
 */
export function containsArithmetic(node: ASTNode): boolean {
    switch (node.type) {
        case 'predicate':
            // Check for comparison predicates
            if (isArithmeticPredicate(node.name!)) {
                return true;
            }
            return node.args?.some(containsArithmetic) ?? false;

        case 'function':
            // Check for arithmetic operators
            if (isArithmeticOperator(node.name!)) {
                return true;
            }
            return node.args?.some(containsArithmetic) ?? false;

        case 'and':
        case 'or':
        case 'implies':
        case 'iff':
        case 'equals':
            return containsArithmetic(node.left!) || containsArithmetic(node.right!);

        case 'not':
            return containsArithmetic(node.operand!);

        case 'forall':
        case 'exists':
            return containsArithmetic(node.body!);

        default:
            return false;
    }
}

/**
 * Check if a predicate name is an arithmetic comparison.
 */
export function isArithmeticPredicate(name: string): boolean {
    return ['lt', 'gt', 'lte', 'gte', 'less', 'greater', 'leq', 'geq', '<', '>', '<=', '>=', '!='].includes(name);
}

/**
 * Check if a function name is an arithmetic operator.
 */
export function isArithmeticOperator(name: string): boolean {
    return ['plus', 'minus', 'times', 'divide', 'mod', 'add', 'sub', 'mul', 'div', '+', '-', '*', '/', 'unary_minus'].includes(name);
}

/**
 * Prolog axioms for arithmetic comparison predicates.
 * These bridge FOL predicates like lt(X, Y) to Prolog's X < Y.
 */
export function getArithmeticAxioms(): string[] {
    return [
        '% Arithmetic comparison predicates',
        'lt(X, Y) :- X < Y.',
        'gt(X, Y) :- X > Y.',
        'lte(X, Y) :- X =< Y.',
        'gte(X, Y) :- X >= Y.',
        'less(X, Y) :- X < Y.',
        'greater(X, Y) :- X > Y.',
        'leq(X, Y) :- X =< Y.',
        'geq(X, Y) :- X >= Y.',
        '',
        '% Arithmetic function predicates',
        '% plus(X, Y, Z) means Z = X + Y',
        'plus(X, Y, Z) :- Z is X + Y.',
        'minus(X, Y, Z) :- Z is X - Y.',
        'times(X, Y, Z) :- Z is X * Y.',
        'divide(X, Y, Z) :- Y \\== 0, Z is X / Y.',
        'mod(X, Y, Z) :- Y \\== 0, Z is X mod Y.',
        'add(X, Y, Z) :- Z is X + Y.',
        'sub(X, Y, Z) :- Z is X - Y.',
        'mul(X, Y, Z) :- Z is X * Y.',
        'div(X, Y, Z) :- Y \\== 0, Z is X // Y.',
        '',
        '% Successor and predecessor',
        'succ(X, Y) :- Y is X + 1.',
        'pred(X, Y) :- Y is X - 1.',
        '',
        '% Absolute value and sign',
        'abs(X, Y) :- X >= 0, Y is X.',
        'abs(X, Y) :- X < 0, Y is -X.',
        'sign(X, 1) :- X > 0.',
        'sign(X, -1) :- X < 0.',
        'sign(0, 0).',
        '',
        '% Min and max',
        'min(X, Y, X) :- X =< Y.',
        'min(X, Y, Y) :- X > Y.',
        'max(X, Y, X) :- X >= Y.',
        'max(X, Y, Y) :- X < Y.',
    ];
}

/**
 * Convert an arithmetic expression AST to Prolog format.
 * 
 * Example: plus(2, 3) → 2 + 3
 */
export function arithmeticToProlog(node: ASTNode): string {
    if (node.type === 'function') {
        const args = node.args!.map(arithmeticToProlog);

        switch (node.name) {
            case 'plus':
            case 'add':
                return `(${args[0]} + ${args[1]})`;
            case 'minus':
            case 'sub':
                return `(${args[0]} - ${args[1]})`;
            case 'times':
            case 'mul':
                return `(${args[0]} * ${args[1]})`;
            case 'divide':
            case 'div':
                return `(${args[0]} / ${args[1]})`;
            case 'mod':
                return `(${args[0]} mod ${args[1]})`;
            default:
                // Regular function
                return `${node.name}(${args.join(', ')})`;
        }
    }

    if (node.type === 'variable') {
        return node.name!.toUpperCase();
    }

    if (node.type === 'constant') {
        return node.name!;
    }

    return node.name || '';
}

/**
 * Prolog setup for enabling arithmetic in a session.
 * Returns Prolog code to be consulted before other programs.
 */
export function getArithmeticSetup(): string {
    return getArithmeticAxioms().join('\n');
}

/**
 * Check if a value looks like a number.
 */
export function isNumericConstant(value: string): boolean {
    return /^-?\d+(\.\d+)?$/.test(value);
}

/**
 * Parse a numeric constant from a string.
 */
export function parseNumber(value: string): number | null {
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
}
