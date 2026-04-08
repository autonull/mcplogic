import { ASTNode } from '../types/ast.js';
import { parse } from '../parser/index.js';
import { createAnd, createNot } from '../ast/index.js';

/**
 * Creates a refutation formula AST from premises and a conclusion.
 *
 * Formula: (P1 ∧ P2 ∧ ... ∧ Pn) ∧ ¬Conclusion
 *
 * This is used for proof by refutation: if the resulting formula is unsatisfiable,
 * then the conclusion follows from the premises.
 *
 * @param premises List of premise strings
 * @param conclusion Conclusion string
 * @returns ASTNode representing the refutation formula
 */
export function createRefutation(premises: string[], conclusion: string): ASTNode {
    const premiseNodes = premises.map(p => parse(p));
    const conclusionNode = parse(conclusion);
    const negatedConclusion = createNot(conclusionNode);

    // Combine all formulas with AND
    const allNodes = [...premiseNodes, negatedConclusion];

    if (allNodes.length === 0) throw new Error('Cannot create refutation with no formulas');

    return allNodes.reduce((acc, node) => createAnd(acc, node));
}
