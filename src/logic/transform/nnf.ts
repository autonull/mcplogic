import { ASTNode } from '../../types/index.js';

/**
 * Convert an AST to Negation Normal Form (NNF).
 *
 * In NNF:
 * - Negations only appear on atoms (predicates)
 * - Only AND, OR, and quantifiers remain
 * - Implications and biconditionals are eliminated
 */
export function toNNF(node: ASTNode): ASTNode {
    switch (node.type) {
        case 'iff': {
            // A ↔ B → (A → B) ∧ (B → A)
            // But better expansion for NNF: (¬A ∨ B) ∧ (¬B ∨ A)
            const left = node.left!;
            const right = node.right!;

            // ¬A ∨ B
            const c1 = {
                type: 'or',
                left: pushNegation(left), // ¬A
                right: toNNF(right)       // B
            } as ASTNode;

            // ¬B ∨ A
            const c2 = {
                type: 'or',
                left: pushNegation(right), // ¬B
                right: toNNF(left)         // A
            } as ASTNode;

            return { type: 'and', left: c1, right: c2 };
        }

        case 'implies': {
            // A → B → ¬A ∨ B
            const left = node.left!;
            const right = node.right!;
            return {
                type: 'or',
                left: pushNegation(left), // ¬A
                right: toNNF(right)       // B
            };
        }

        case 'not': {
            const operand = node.operand!;
            return pushNegation(operand);
        }

        case 'and':
            return {
                type: 'and',
                left: toNNF(node.left!),
                right: toNNF(node.right!),
            };

        case 'or':
            return {
                type: 'or',
                left: toNNF(node.left!),
                right: toNNF(node.right!),
            };

        case 'forall':
            return {
                type: 'forall',
                variable: node.variable,
                body: toNNF(node.body!),
            };

        case 'exists':
            return {
                type: 'exists',
                variable: node.variable,
                body: toNNF(node.body!),
            };

        case 'predicate':
        case 'equals':
        case 'constant':
        case 'variable':
        case 'function':
            return node;

        default:
            return node;
    }
}

/**
 * Push a negation inward (De Morgan's laws, quantifier negation).
 * Used when we encounter `not(node)` and want to push the `not` down.
 */
function pushNegation(node: ASTNode): ASTNode {
    switch (node.type) {
        case 'not':
            // Double negation elimination: ¬¬A → A
            // But we must ensure A is also in NNF
            return toNNF(node.operand!);

        case 'and':
            // De Morgan: ¬(A ∧ B) → ¬A ∨ ¬B
            return {
                type: 'or',
                left: pushNegation(node.left!),
                right: pushNegation(node.right!),
            };

        case 'or':
            // De Morgan: ¬(A ∨ B) → ¬A ∧ ¬B
            return {
                type: 'and',
                left: pushNegation(node.left!),
                right: pushNegation(node.right!),
            };

        case 'implies':
            // ¬(A → B) → A ∧ ¬B
            return {
                type: 'and',
                left: toNNF(node.left!),      // A
                right: pushNegation(node.right!), // ¬B
            };

        case 'iff':
            // ¬(A ↔ B) → (A ∧ ¬B) ∨ (¬A ∧ B)
            const left = node.left!;
            const right = node.right!;

            // A ∧ ¬B
            const d1 = {
                type: 'and',
                left: toNNF(left),
                right: pushNegation(right)
            } as ASTNode;

            // ¬A ∧ B
            const d2 = {
                type: 'and',
                left: pushNegation(left),
                right: toNNF(right)
            } as ASTNode;

            return { type: 'or', left: d1, right: d2 };

        case 'forall':
            // ¬∀x.P → ∃x.¬P
            return {
                type: 'exists',
                variable: node.variable,
                body: pushNegation(node.body!),
            };

        case 'exists':
            // ¬∃x.P → ∀x.¬P
            return {
                type: 'forall',
                variable: node.variable,
                body: pushNegation(node.body!),
            };

        case 'predicate':
        case 'equals':
            // Atomic negation: this is the base case for NNF
            return { type: 'not', operand: node };

        default:
            // For other atomic types (should not be negated directly ideally)
            return { type: 'not', operand: node };
    }
}
