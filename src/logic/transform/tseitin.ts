import { ASTNode } from '../../types/ast.js';
import { Clause, Literal, SkolemEnv } from '../../types/clause.js';
import { createClausificationError } from '../../types/errors.js';

/**
 * Perform Tseitin transformation on a quantifier-free FOL formula.
 *
 * Replaces subformulas with fresh predicates to avoid exponential blowup
 * during CNF conversion (distribution).
 *
 * Logic:
 * 1. For each non-atomic subformula phi(x1...xn), introduce a fresh predicate P_phi(x1...xn).
 * 2. Add definition clauses for P_phi <-> (structural definition).
 * 3. Return the literal for the root formula and the set of definition clauses.
 */

interface TseitinContext {
    clauses: Clause[];
    // We can use a reference to the counter or a context object that holds it?
    // SkolemEnv has a tseitinCounter property.
    skolemEnv?: SkolemEnv;
    localCounter: number; // Fallback if no SkolemEnv
}

export function toCNFTseitin(node: ASTNode, skolemEnv?: SkolemEnv): Clause[] {
    const ctx: TseitinContext = {
        clauses: [],
        skolemEnv,
        localCounter: 0,
    };

    // We assume node is NNF and quantifier-free
    const rootLit = processNode(node, ctx);

    // Assert the root literal
    ctx.clauses.push({
        literals: [rootLit]
    });

    return ctx.clauses;
}

function getNextCounter(ctx: TseitinContext): number {
    if (ctx.skolemEnv) {
        if (ctx.skolemEnv.tseitinCounter === undefined) {
            ctx.skolemEnv.tseitinCounter = 0;
        }
        return ++ctx.skolemEnv.tseitinCounter;
    }
    return ++ctx.localCounter;
}

function processNode(node: ASTNode, ctx: TseitinContext): Literal {
    if (node.type === 'predicate' || node.type === 'equals') {
        return nodeToLiteral(node);
    }

    if (node.type === 'not') {
        const inner = node.operand!;
        // If inner is atomic, just return negated literal
        if (inner.type === 'predicate' || inner.type === 'equals') {
            return nodeToLiteral(node);
        }
        // If inner is complex, process it and negate the result
        // But wait, we assume NNF. In NNF, 'not' only applies to atoms.
        // So this case should handled by nodeToLiteral check or we recurse?
        // If NNF, NOT(AND(..)) shouldn't exist.
        // But NOT(Predicate) does.
        return nodeToLiteral(node);
    }

    // It's a complex formula (AND, OR)
    // Generate fresh predicate
    const freeVars = getFreeVariables(node);
    const counter = getNextCounter(ctx);
    const predName = `_tseitin_${counter}`;

    const freshLit: Literal = {
        predicate: predName,
        args: freeVars.map(name => ({ type: 'variable', name })),
        negated: false,
    };

    // Generate definition clauses
    if (node.type === 'and') {
        // P <-> (A & B)
        // Clauses:
        // 1. -P | A
        // 2. -P | B
        // 3. -A | -B | P
        const litA = processNode(node.left!, ctx);
        const litB = processNode(node.right!, ctx);

        // Clause 1: -P | A
        ctx.clauses.push({
            literals: [negate(freshLit), litA]
        });
        // Clause 2: -P | B
        ctx.clauses.push({
            literals: [negate(freshLit), litB]
        });
        // Clause 3: -A | -B | P
        ctx.clauses.push({
            literals: [negate(litA), negate(litB), freshLit]
        });

    } else if (node.type === 'or') {
        // P <-> (A | B)
        // Clauses:
        // 1. -A | P
        // 2. -B | P
        // 3. -P | A | B
        const litA = processNode(node.left!, ctx);
        const litB = processNode(node.right!, ctx);

        // Clause 1: -A | P
        ctx.clauses.push({
            literals: [negate(litA), freshLit]
        });
        // Clause 2: -B | P
        ctx.clauses.push({
            literals: [negate(litB), freshLit]
        });
        // Clause 3: -P | A | B
        ctx.clauses.push({
            literals: [negate(freshLit), litA, litB]
        });
    } else {
        throw new Error(`Unsupported node type in Tseitin: ${node.type}`);
    }

    return freshLit;
}

function getFreeVariables(node: ASTNode): string[] {
    const vars = new Set<string>();

    function traverse(n: ASTNode) {
        if (n.type === 'variable') {
            vars.add(n.name!);
        }
        // Recurse
        if (n.left) traverse(n.left);
        if (n.right) traverse(n.right);
        if (n.operand) traverse(n.operand);
        if (n.args) n.args.forEach(traverse);
    }

    traverse(node);
    return Array.from(vars).sort();
}

function nodeToLiteral(node: ASTNode): Literal {
    if (node.type === 'not') {
        const inner = node.operand!;
        if (inner.type === 'predicate') {
             return { predicate: inner.name!, args: inner.args || [], negated: true };
        } else if (inner.type === 'equals') {
             return { predicate: '=', args: [inner.left!, inner.right!], negated: true };
        }
        throw createClausificationError(`Invalid literal in Tseitin: ${node.type}`);
    }
    if (node.type === 'predicate') {
        return { predicate: node.name!, args: node.args || [], negated: false };
    }
    if (node.type === 'equals') {
        return { predicate: '=', args: [node.left!, node.right!], negated: false };
    }
    throw createClausificationError(`Invalid literal in Tseitin: ${node.type}`);
}

function negate(lit: Literal): Literal {
    return { ...lit, negated: !lit.negated };
}
