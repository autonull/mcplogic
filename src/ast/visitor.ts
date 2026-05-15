import type { ASTNode } from '../types/index.js';

/**
 * Generic AST Visitor
 */
export function traverse(node: ASTNode, visitor: (node: ASTNode) => boolean | void): boolean {
    if (visitor(node) === false) return false;

    if (node.args) {
        for (const arg of node.args) {
            if (traverse(arg, visitor) === false) return false;
        }
    }
    if (node.left && traverse(node.left, visitor) === false) return false;
    if (node.right && traverse(node.right, visitor) === false) return false;
    if (node.operand && traverse(node.operand, visitor) === false) return false;
    if (node.body && traverse(node.body, visitor) === false) return false;

    return true;
}
