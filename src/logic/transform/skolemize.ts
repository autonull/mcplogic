import { ASTNode } from '../../types/index.js';
import { SkolemEnv } from '../../logic/clause.js';

/**
 * Skolemize - replace existentially quantified variables with Skolem functions.
 *
 * ∃x.P(x) → P(sk0) (if no universal vars in scope)
 * ∀y.∃x.P(x,y) → ∀y.P(sk1(y), y) (Skolem function of universal vars)
 */
export function skolemize(node: ASTNode, env: SkolemEnv): ASTNode {
    switch (node.type) {
        case 'forall': {
            // Add variable to universal scope
            env.universalVars.push(node.variable!);
            const newBody = skolemize(node.body!, env);
            env.universalVars.pop();
            return {
                type: 'forall',
                variable: node.variable,
                body: newBody,
            };
        }

        case 'exists': {
            // Replace with Skolem term
            const skolemName = `sk${env.counter++}`;
            const skolemArgs = [...env.universalVars];
            env.skolemMap.set(node.variable!, { name: skolemName, args: skolemArgs });
            // Permanently record this Skolem function
            env.generatedSkolems.set(skolemName, skolemArgs.length);

            // Continue with body (variable will be replaced)
            const newBody = skolemize(node.body!, env);
            env.skolemMap.delete(node.variable!);

            // Remove the quantifier, return just the body
            return newBody;
        }

        case 'variable': {
            const skolem = env.skolemMap.get(node.name!);
            if (!skolem) return node;

            return skolem.args.length === 0
                ? { type: 'constant', name: skolem.name }
                : {
                    type: 'function',
                    name: skolem.name,
                    args: skolem.args.map(v => ({ type: 'variable', name: v })),
                };
        }

        case 'and':
        case 'or':
            return {
                type: node.type,
                left: skolemize(node.left!, env),
                right: skolemize(node.right!, env),
            };

        case 'not':
            return {
                type: 'not',
                operand: skolemize(node.operand!, env),
            };

        case 'equals':
            return {
                type: 'equals',
                left: skolemize(node.left!, env),
                right: skolemize(node.right!, env),
            };

        case 'predicate':
            return {
                type: 'predicate',
                name: node.name,
                args: node.args?.map(a => skolemize(a, env)),
            };

        case 'function':
            return {
                type: 'function',
                name: node.name,
                args: node.args?.map(a => skolemize(a, env)),
            };

        default:
            return node;
    }
}
