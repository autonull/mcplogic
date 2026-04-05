import type { ASTNode } from '../types/index.js';
import { traverse } from './visitor.js';

/**
 * Signature extracted from formulas
 */
export interface FormulaSignature {
    /** Predicate names with arities */
    predicates: Map<string, number>;
    /** Constant names */
    constants: Set<string>;
    /** Variable names */
    variables: Set<string>;
    /** Function symbols with arities */
    functions: Map<string, number>;
}

/**
 * Extract signature (predicates, constants, functions, variables) from AST nodes
 */
export function extractSignature(asts: ASTNode[]): FormulaSignature {
    const predicates = new Map<string, number>();
    const constants = new Set<string>();
    const variables = new Set<string>();
    const functions = new Map<string, number>();

    const visitor = (node: ASTNode) => {
        switch (node.type) {
            case 'predicate':
                if (node.name) {
                    predicates.set(node.name, node.args?.length ?? 0);
                }
                break;
            case 'function':
                if (node.name) {
                    functions.set(node.name, node.args?.length ?? 0);
                }
                break;
            case 'constant':
                if (node.name) {
                    constants.add(node.name);
                }
                break;
            case 'variable':
                if (node.name) {
                    variables.add(node.name);
                }
                break;
            case 'forall':
            case 'exists':
                if (node.variable) {
                    variables.add(node.variable);
                }
                break;
        }
    };

    for (const ast of asts) {
        traverse(ast, visitor);
    }

    return { predicates, constants, variables, functions };
}

/**
 * Count nodes in an AST (for complexity estimation)
 */
export function countNodes(ast: ASTNode): number {
    let count = 0;
    traverse(ast, () => { count++; });
    return count;
}

/**
 * Get all free variables in a formula (not bound by quantifiers)
 */
export function getFreeVariables(ast: ASTNode, bound: Set<string> = new Set()): Set<string> {
    const free = new Set<string>();

    function visit(node: ASTNode, boundVars: Set<string>): void {
        switch (node.type) {
            case 'variable':
                if (node.name && !boundVars.has(node.name)) {
                    free.add(node.name);
                }
                break;

            case 'forall':
            case 'exists':
                if (node.body) {
                    const newBound = new Set(boundVars);
                    if (node.variable) newBound.add(node.variable);
                    visit(node.body, newBound);
                }
                break;

            case 'predicate':
            case 'function':
                if (node.args) {
                    for (const arg of node.args) {
                        visit(arg, boundVars);
                    }
                }
                break;

            case 'not':
                if (node.operand) visit(node.operand, boundVars);
                break;

            case 'and':
            case 'or':
            case 'implies':
            case 'iff':
            case 'equals':
                if (node.left) visit(node.left, boundVars);
                if (node.right) visit(node.right, boundVars);
                break;
        }
    }

    visit(ast, bound);
    return free;
}

/**
 * Check if formula contains equality (for auto axiom injection)
 */
export function containsEquality(ast: ASTNode): boolean {
    let found = false;
    traverse(ast, (node) => {
        if (node.type === 'equals' || (node.type === 'predicate' && (node.name === 'eq' || node.name === 'equals'))) {
            found = true;
            return false; // Early exit
        }
    });
    return found;
}

/**
 * Check if formula is a Horn clause (A1 & A2 & ... -> B where A_i and B are atoms)
 */
export function isHornClause(ast: ASTNode): boolean {
    // Unwrap quantifiers
    let current = ast;
    while (current.type === 'forall') {
        current = current.body!;
    }

    // Must be an implication
    if (current.type !== 'implies') {
        // Could be a simple fact (predicate)
        return current.type === 'predicate';
    }

    // Head must be a single predicate
    if (current.right!.type !== 'predicate') {
        return false;
    }

    // Body must be a conjunction of predicates or a single predicate
    return isConjunctionOfAtoms(current.left!);
}

/**
 * Check if node is a conjunction of atomic formulas
 */
function isConjunctionOfAtoms(node: ASTNode): boolean {
    if (node.type === 'predicate') return true;
    if (node.type === 'and') {
        return isConjunctionOfAtoms(node.left!) && isConjunctionOfAtoms(node.right!);
    }
    return false;
}

/**
 * Deep clone an AST node
 */
export function cloneAST(node: ASTNode): ASTNode {
    // Traverse cannot be easily used for cloning since we need to rebuild the structure.
    const clone: ASTNode = { type: node.type };

    if (node.name !== undefined) clone.name = node.name;
    if (node.variable !== undefined) clone.variable = node.variable;
    if (node.args) clone.args = node.args.map(cloneAST);
    if (node.left) clone.left = cloneAST(node.left);
    if (node.right) clone.right = cloneAST(node.right);
    if (node.operand) clone.operand = cloneAST(node.operand);
    if (node.body) clone.body = cloneAST(node.body);

    return clone;
}
