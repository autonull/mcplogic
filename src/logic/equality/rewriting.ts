import { ASTNode } from '../../types/ast.js';
import { Clause } from '../../types/clause.js';

/**
 * Generate rewriting axioms based on Knuth-Bendix-like orientation.
 *
 * Extracts ground equality facts from clauses, orients them to reduce terms
 * (lexicographically or by size), and generates Prolog predicates for
 * normalization.
 *
 * Replaces the naive 'eq' axioms with a rewriting system:
 *   normalize(Term, NormalForm).
 *   eq(X, Y) :- normalize(X, N), normalize(Y, N).
 */
export function generateRewritingAxioms(clauses: Clause[]): string[] {
    const rules = extractAndOrientRules(clauses);

    if (rules.length === 0) return [];

    return [
        // 1. Rewrite rules (base cases)
        ...rules.map(({ from, to }) => `rewrite_rule(${from}, ${to}).`),

        // 2. Normalization Engine
        '% Rewriting Logic',
        'normalize(X, Y) :- rewrite_step(X, Z), !, normalize(Z, Y).',
        'normalize(X, X).',

        // Single rewrite step: try direct rule or deep rewrite
        'rewrite_step(X, Y) :- rewrite_rule(X, Y).',

        // Deep rewrite (Congruence) for compound terms
        // Deconstruct term, normalize arguments, reconstruct.
        // If arguments changed, that constitutes a step.
        'rewrite_step(Term, Result) :-',
        '    nonvar(Term), \\+ atomic(Term),', // compound check compatible with Tau
        '    Term =.. [F | Args],',
        '    rewrite_args(Args, NewArgs),',
        '    Args \\== NewArgs,', // Ensure something changed
        '    Result =.. [F | NewArgs].',

        // Helper to rewrite list of arguments (one pass)
        'rewrite_args([], []).',
        'rewrite_args([H|T], [NH|NT]) :- normalize(H, NH), rewrite_args(T, NT).',

        // Equality definition based on convergence
        'eq(X, Y) :- normalize(X, NX), normalize(Y, NY), NX == NY.'
    ];
}

interface RewriteRule {
    from: string;
    to: string;
}

function extractAndOrientRules(clauses: Clause[]): RewriteRule[] {
    const rules: RewriteRule[] = [];

    for (const clause of clauses) {
        // We only consider unit clauses (definite facts) for rewriting
        // Disjunctive rules (A | B) are ambiguous for rewriting
        if (clause.literals.length === 1 && !clause.literals[0].negated) {
            const lit = clause.literals[0];
            if (lit.predicate === '=' || lit.predicate === 'eq_fact') {
                // Ensure no variables are present in the rule to avoid infinite unification loops
                if (!hasVariables(lit.args[0]) && !hasVariables(lit.args[1])) {
                    const left = termToString(lit.args[0]);
                    const right = termToString(lit.args[1]);
                    const rule = orient(left, right);
                    if (rule) rules.push(rule);
                }
            }
        }
    }

    return rules;
}

function hasVariables(node: ASTNode): boolean {
    if (node.type === 'variable') return true;
    return node.args?.some(hasVariables) ?? false;
}

function orient(t1: string, t2: string): RewriteRule | null {
    if (t1 === t2) return null;

    // Heuristic: Prefer reducing complex terms to simpler ones
    // 1. Length
    if (t1.length > t2.length) return { from: t1, to: t2 };
    if (t2.length > t1.length) return { from: t2, to: t1 };

    // 2. Lexicographical (fallback)
    if (t1 > t2) return { from: t1, to: t2 };
    return { from: t2, to: t1 };
}

function termToString(node: ASTNode): string {
    if (node.type === 'variable') return node.name!.toUpperCase(); // Prolog vars
    if (node.type === 'constant') {
        // Match Prolog translator logic: lowercase first letter if uppercase,
        // but preserve camelCase if starts with lowercase.
        const name = node.name!;
        if (/^[A-Z]/.test(name)) {
            return name.toLowerCase();
        }
        return name;
    }
    if (node.type === 'function') {
        const args = node.args!.map(termToString).join(', ');
        return `${node.name}(${args})`;
    }
    return 'unknown';
}
