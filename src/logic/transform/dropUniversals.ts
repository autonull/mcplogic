import { ASTNode } from '../../types/index.js';

/**
 * Drop universal quantifiers (all remaining variables are implicitly universal).
 */
export function dropUniversals(node: ASTNode): ASTNode {
    switch (node.type) {
        case 'forall':
            return dropUniversals(node.body!);

        case 'and':
        case 'or':
            return {
                type: node.type,
                left: dropUniversals(node.left!),
                right: dropUniversals(node.right!),
            };

        case 'not':
            return {
                type: 'not',
                operand: dropUniversals(node.operand!),
            };

        default:
            return node;
    }
}
