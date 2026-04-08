import { ASTNode } from '../../types/index.js';

/**
 * Standardize variables - give each quantified variable a unique name.
 */
export function standardizeVariables(node: ASTNode): ASTNode {
    let counter = 0;
    const renaming = new Map<string, string>();

    function standardize(n: ASTNode): ASTNode {
        switch (n.type) {
            case 'forall':
            case 'exists': {
                const oldVar = n.variable!;
                const newVar = `_v${counter++}`;
                const previousMapping = renaming.get(oldVar);

                renaming.set(oldVar, newVar);
                const newBody = standardize(n.body!);

                previousMapping ? renaming.set(oldVar, previousMapping) : renaming.delete(oldVar);

                return {
                    type: n.type,
                    variable: newVar,
                    body: newBody,
                };
            }

            case 'variable': {
                const renamed = renaming.get(n.name!);
                return renamed ? { type: 'variable', name: renamed } : n;
            }

            case 'and':
            case 'or':
            case 'implies':
            case 'iff':
                return {
                    type: n.type,
                    left: standardize(n.left!),
                    right: standardize(n.right!),
                };

            case 'not':
                return {
                    type: 'not',
                    operand: standardize(n.operand!),
                };

            case 'equals':
                return {
                    type: 'equals',
                    left: standardize(n.left!),
                    right: standardize(n.right!),
                };

            case 'predicate':
                return {
                    type: 'predicate',
                    name: n.name,
                    args: n.args?.map(standardize),
                };

            case 'function':
                return {
                    type: 'function',
                    name: n.name,
                    args: n.args?.map(standardize),
                };

            default:
                return n;
        }
    }

    return standardize(node);
}
