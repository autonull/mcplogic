import { ASTNode } from '../../types/index.js';

/**
 * Simplify an AST by applying boolean simplification rules.
 *
 * Rules:
 * - A & T -> A
 * - A & F -> F
 * - A | T -> T
 * - A | F -> A
 * - A & A -> A
 * - A | A -> A
 * - !T -> F
 * - !F -> T
 * - !!A -> A
 */
export function simplify(node: ASTNode): ASTNode {
    // Post-order traversal: simplify children first
    const simplified = simplifyChildren(node);

    switch (simplified.type) {
        case 'and': return simplifyAnd(simplified);
        case 'or': return simplifyOr(simplified);
        case 'not': return simplifyNot(simplified);
        case 'implies': return simplifyImplies(simplified);
        case 'iff': return simplifyIff(simplified);
        case 'forall':
        case 'exists': return simplifyQuantifier(simplified);
        default: return simplified;
    }
}

function simplifyChildren(node: ASTNode): ASTNode {
    const clone = { ...node }; // Shallow copy

    if (clone.left) clone.left = simplify(clone.left);
    if (clone.right) clone.right = simplify(clone.right);
    if (clone.operand) clone.operand = simplify(clone.operand);
    if (clone.body) clone.body = simplify(clone.body);
    if (clone.args) clone.args = clone.args.map(arg => simplify(arg)); // Should args be simplified? They are terms. Usually no boolean simplifications in terms unless they contain formulas (which they don't in standard FOL, but functions might).

    return clone;
}

function isTrue(node: ASTNode): boolean {
    return node.type === 'constant' && node.name === 'true'; // Assuming 'true' constant representation
}

function isFalse(node: ASTNode): boolean {
    return node.type === 'constant' && node.name === 'false'; // Assuming 'false' constant representation
}

function areEqual(a: ASTNode, b: ASTNode): boolean {
    // Structural equality check
    if (a.type !== b.type) return false;
    if (a.name !== b.name) return false;
    if (a.variable !== b.variable) return false;
    // ... deep check needed for robust equality.
    // For now, simple check for atomic equality
    if (a.type === 'predicate' && b.type === 'predicate') {
        return a.name === b.name && JSON.stringify(a.args) === JSON.stringify(b.args);
    }
    return false;
}

function simplifyAnd(node: ASTNode): ASTNode {
    const left = node.left!;
    const right = node.right!;

    if (isTrue(left)) return right;
    if (isTrue(right)) return left;
    if (isFalse(left)) return left; // F & X -> F
    if (isFalse(right)) return right; // X & F -> F
    if (areEqual(left, right)) return left; // A & A -> A

    return node;
}

function simplifyOr(node: ASTNode): ASTNode {
    const left = node.left!;
    const right = node.right!;

    if (isTrue(left)) return left; // T | X -> T
    if (isTrue(right)) return right; // X | T -> T
    if (isFalse(left)) return right; // F | X -> X
    if (isFalse(right)) return left; // X | F -> X
    if (areEqual(left, right)) return left; // A | A -> A

    return node;
}

function simplifyNot(node: ASTNode): ASTNode {
    const operand = node.operand!;

    if (isTrue(operand)) return { type: 'constant', name: 'false' };
    if (isFalse(operand)) return { type: 'constant', name: 'true' };
    if (operand.type === 'not') return operand.operand!; // !!A -> A

    return node;
}

function simplifyImplies(node: ASTNode): ASTNode {
    const left = node.left!;
    const right = node.right!;

    if (isFalse(left)) return { type: 'constant', name: 'true' }; // F -> X is T
    if (isTrue(left)) return right; // T -> X is X
    if (isTrue(right)) return { type: 'constant', name: 'true' }; // X -> T is T
    // X -> F is !X (handled by NNF usually, but good to have)

    return node;
}

function simplifyIff(node: ASTNode): ASTNode {
    const left = node.left!;
    const right = node.right!;

    if (areEqual(left, right)) return { type: 'constant', name: 'true' }; // A <-> A is T
    if (isTrue(left)) return right; // T <-> X is X
    if (isTrue(right)) return left; // X <-> T is X
    if (isFalse(left)) return { type: 'not', operand: right }; // F <-> X is !X
    if (isFalse(right)) return { type: 'not', operand: left }; // X <-> F is !X

    return node;
}

function simplifyQuantifier(node: ASTNode): ASTNode {
    // Remove vacuous quantification: forall x P(y) -> P(y) if x not in free vars of P(y)
    // This requires getFreeVariables check which might be expensive.
    // Skipping for basic simplify.
    return node;
}
