import { ASTNode } from '../../types/index.js';
import { ClausifyOptions } from '../../types/clause.js';
import { createTimeoutError, createGenericError } from '../../types/errors.js';

/**
 * Distribute OR over AND to achieve CNF.
 * (A ∨ (B ∧ C)) → (A ∨ B) ∧ (A ∨ C)
 */
export function distribute(
    node: ASTNode,
    options: Required<ClausifyOptions>,
    startTime: number
): ASTNode {
    // Check timeout
    if (Date.now() - startTime > options.timeout) {
        throw createTimeoutError(options.timeout, 'Clausification');
    }

    // Check size limit
    options._nodeCount = (options._nodeCount || 0) + 1;
    if (options._nodeCount > 50000) {
        throw createGenericError('CLAUSIFICATION_BLOWUP', 'Formula too complex (node limit exceeded)');
    }

    switch (node.type) {
        case 'and':
            return {
                type: 'and',
                left: distribute(node.left!, options, startTime),
                right: distribute(node.right!, options, startTime),
            };

        case 'or': {
            const left = distribute(node.left!, options, startTime);
            const right = distribute(node.right!, options, startTime);

            // If either side is a conjunction, distribute
            if (left.type === 'and') {
                // (A ∧ B) ∨ C → (A ∨ C) ∧ (B ∨ C)
                return distribute(
                    {
                        type: 'and',
                        left: { type: 'or', left: left.left!, right },
                        right: { type: 'or', left: left.right!, right },
                    },
                    options,
                    startTime
                );
            }

            if (right.type === 'and') {
                // A ∨ (B ∧ C) → (A ∨ B) ∧ (A ∨ C)
                return distribute(
                    {
                        type: 'and',
                        left: { type: 'or', left, right: right.left! },
                        right: { type: 'or', left, right: right.right! },
                    },
                    options,
                    startTime
                );
            }

            return { type: 'or', left, right };
        }

        default:
            return node;
    }
}
