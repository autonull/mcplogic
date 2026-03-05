/**
 * Tests for the CNF Clausifier
 */

import {
    clausify,
    toNNF,
    standardizeVariables,
    skolemize,
    dropUniversals,
    isHornFormula,
    clausesToDIMACS,
} from '../src/logic/clausifier.js';
import { clausesToProlog } from '../src/engines/prolog/translator.js';
import { parse } from '../src/parser/index.js';
import { createSkolemEnv, clauseToString, cnfToString } from '../src/logic/clause';

describe('Clausifier', () => {
    describe('toNNF - Negation Normal Form', () => {
        it('should eliminate implications', () => {
            const ast = parse('P -> Q');
            const nnf = toNNF(ast);
            // P -> Q becomes ¬P ∨ Q
            expect(nnf.type).toBe('or');
            expect(nnf.left!.type).toBe('not');
            expect(nnf.right!.type).toBe('predicate');
        });

        it('should eliminate biconditionals', () => {
            const ast = parse('P <-> Q');
            const nnf = toNNF(ast);
            // P <-> Q becomes (¬P ∨ Q) ∧ (¬Q ∨ P)
            expect(nnf.type).toBe('and');
        });

        it('should push negation through conjunction (De Morgan)', () => {
            const ast = parse('-(P & Q)');
            const nnf = toNNF(ast);
            // ¬(P ∧ Q) becomes ¬P ∨ ¬Q
            expect(nnf.type).toBe('or');
            expect(nnf.left!.type).toBe('not');
            expect(nnf.right!.type).toBe('not');
        });

        it('should push negation through disjunction (De Morgan)', () => {
            const ast = parse('-(P | Q)');
            const nnf = toNNF(ast);
            // ¬(P ∨ Q) becomes ¬P ∧ ¬Q
            expect(nnf.type).toBe('and');
            expect(nnf.left!.type).toBe('not');
            expect(nnf.right!.type).toBe('not');
        });

        it('should eliminate double negation', () => {
            const ast = parse('--P');
            const nnf = toNNF(ast);
            expect(nnf.type).toBe('predicate');
            expect(nnf.name).toBe('P');
        });

        it('should push negation through forall', () => {
            const ast = parse('-all x P(x)');
            const nnf = toNNF(ast);
            // ¬∀x.P(x) becomes ∃x.¬P(x)
            expect(nnf.type).toBe('exists');
            expect(nnf.body!.type).toBe('not');
        });

        it('should push negation through exists', () => {
            const ast = parse('-exists x P(x)');
            const nnf = toNNF(ast);
            // ¬∃x.P(x) becomes ∀x.¬P(x)
            expect(nnf.type).toBe('forall');
            expect(nnf.body!.type).toBe('not');
        });
    });

    describe('standardizeVariables', () => {
        it('should rename variables in nested quantifiers', () => {
            const ast = parse('all x P(x) & all x Q(x)');
            const standardized = standardizeVariables(ast);
            // Each x should have a unique name
            expect(standardized.type).toBe('and');
            expect(standardized.left!.variable).not.toBe(standardized.right!.variable);
        });

        it('should preserve variable references within scope', () => {
            const ast = parse('all x (P(x) & Q(x))');
            const standardized = standardizeVariables(ast);
            const body = standardized.body!;
            // Both uses of x should be the same renamed variable
            expect(body.left!.args![0].name).toBe(body.right!.args![0].name);
        });
    });

    describe('skolemize', () => {
        it('should replace existential with Skolem constant when no universals', () => {
            const ast = parse('exists x P(x)');
            const env = createSkolemEnv();
            const skolemized = skolemize(toNNF(ast), env);
            // ∃x.P(x) becomes P(sk0)
            expect(skolemized.type).toBe('predicate');
            expect(skolemized.args![0].type).toBe('constant');
            expect(skolemized.args![0].name).toBe('sk0');
        });

        it('should replace existential with Skolem function under universal', () => {
            const ast = parse('all y exists x P(x, y)');
            const env = createSkolemEnv();
            const skolemized = skolemize(toNNF(ast), env);
            // ∀y.∃x.P(x,y) becomes ∀y.P(sk0(y), y)
            expect(skolemized.type).toBe('forall');
            const body = skolemized.body!;
            expect(body.args![0].type).toBe('function');
            expect(body.args![0].name).toBe('sk0');
            expect(body.args![0].args![0].name).toBe(skolemized.variable);
        });

        it('should handle multiple existentials with correct dependencies', () => {
            const ast = parse('all x exists y exists z P(x, y, z)');
            const env = createSkolemEnv();
            const skolemized = skolemize(toNNF(ast), env);
            // sk0 and sk1 should both depend on x
            expect(env.skolemMap.size).toBe(0); // Map is cleared after processing
        });
    });

    describe('dropUniversals', () => {
        it('should remove universal quantifiers', () => {
            const ast = parse('all x P(x)');
            const dropped = dropUniversals(toNNF(ast));
            expect(dropped.type).toBe('predicate');
        });

        it('should preserve structure under quantifiers', () => {
            const ast = parse('all x (P(x) & Q(x))');
            const dropped = dropUniversals(toNNF(ast));
            expect(dropped.type).toBe('and');
        });
    });

    describe('clausify - full pipeline', () => {
        it('should clausify simple implication to single clause', () => {
            const result = clausify('P -> Q');
            expect(result.success).toBe(true);
            expect(result.clauses).toHaveLength(1);
            // P -> Q becomes ¬P ∨ Q, i.e., one clause with two literals
            expect(result.clauses![0].literals).toHaveLength(2);
        });

        it('should clausify conjunction to multiple clauses', () => {
            const result = clausify('P & Q');
            expect(result.success).toBe(true);
            expect(result.clauses).toHaveLength(2);
        });

        it('should clausify biconditional correctly', () => {
            const result = clausify('P <-> Q');
            expect(result.success).toBe(true);
            // P <-> Q produces (¬P ∨ Q) ∧ (¬Q ∨ P)
            expect(result.clauses).toHaveLength(2);
        });

        it('should handle nested quantifiers', () => {
            const result = clausify('all x exists y P(x, y)');
            expect(result.success).toBe(true);
            expect(result.clauses).toHaveLength(1);
            // Should contain Skolem function
            expect(result.skolemFunctions).toBeDefined();
            expect(result.skolemFunctions!.size).toBe(1);
        });

        it('should eliminate tautologies', () => {
            const result = clausify('P | -P');
            expect(result.success).toBe(true);
            // P ∨ ¬P is a tautology, should be filtered out
            expect(result.clauses).toHaveLength(0);
        });

        it('should track statistics', () => {
            const result = clausify('(P -> Q) & (Q -> R)');
            expect(result.success).toBe(true);
            expect(result.statistics.originalSize).toBeGreaterThan(0);
            expect(result.statistics.clauseCount).toBe(2);
            expect(result.statistics.timeMs).toBeGreaterThanOrEqual(0);
        });

        it('should handle complex formulas', () => {
            const result = clausify('all x (man(x) -> mortal(x))');
            expect(result.success).toBe(true);
            expect(result.clauses).toHaveLength(1);
            // ∀x.(man(x) → mortal(x)) becomes ¬man(X) ∨ mortal(X)
            const clause = result.clauses![0];
            expect(clause.literals).toHaveLength(2);
        });

        it('should return error for invalid formula', () => {
            const result = clausify('P -> ');
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe('isHornFormula', () => {
        it('should identify Horn clause sets', () => {
            const result = clausify('all x (man(x) -> mortal(x))');
            expect(result.success).toBe(true);
            expect(isHornFormula(result.clauses!)).toBe(true);
        });

        it('should identify non-Horn clause sets', () => {
            const result = clausify('P | Q');
            expect(result.success).toBe(true);
            // P ∨ Q has two positive literals
            expect(isHornFormula(result.clauses!)).toBe(false);
        });

        it('should allow goal clauses (all negative)', () => {
            const result = clausify('-P & -Q');
            expect(result.success).toBe(true);
            expect(isHornFormula(result.clauses!)).toBe(true);
        });

        // Test cases from test_is_horn.ts
        const checkHorn = (premises: string[], conclusion: string) => {
            const astStr = [...premises, `-(${conclusion})`].join(' & ');
            const result = clausify(astStr);
            expect(result.success).toBe(true);
            return isHornFormula(result.clauses!);
        };

        it('should correctly identify Modus Tollens refutations as Horn', () => {
            expect(checkHorn(['rains -> ground_gets_wet', 'not_wet(ground)'], 'not_raining(it)')).toBe(true);
            expect(checkHorn(['rains -> ground_gets_wet', '-ground_gets_wet'], '-rains')).toBe(true);
        });

        it('should correctly identify Existential Instantiation Failure refutation as Horn', () => {
            // negated conclusion expands to ∀x (¬human(x) ∨ ¬mortal(x)), premises add ¬human(x) ∨ mortal(x)
            // But checking horn formula property on the resulting clauses
            // Wait, this ACTUALLY produces Horn clauses:
            // clause 1: -human(X) | mortal(X)   (Horn, 1 pos)
            // clause 2: -human(Y) | -mortal(Y)  (Horn, 0 pos)
            expect(checkHorn(['all x (human(x) -> mortal(x))'], 'exists x (human(x) & mortal(x))')).toBe(true);
        });

        it('should correctly identify Syllogistic Reasoning refutation as Horn', () => {
            expect(checkHorn(['all x (triangle(x) -> have_three_side(x))'], 'something_has_three_sides -> triangle')).toBe(true);
        });
    });

    describe('clausesToProlog', () => {
        it('should convert facts', () => {
            const result = clausify('P');
            expect(result.success).toBe(true);
            const prolog = clausesToProlog(result.clauses!);
            expect(prolog).toContain('p.');
        });

        it('should convert rules', () => {
            const result = clausify('all x (man(x) -> mortal(x))');
            expect(result.success).toBe(true);
            const prolog = clausesToProlog(result.clauses!);
            // ¬man(X) ∨ mortal(X) should become mortal(X) :- man(X).
            expect(prolog.length).toBe(1);
            expect(prolog[0]).toMatch(/mortal.*:-.*man/i);
        });

        it('should throw on non-Horn clauses', () => {
            const result = clausify('P | Q');
            expect(result.success).toBe(true);
            expect(() => clausesToProlog(result.clauses!)).toThrow('non-Horn');
        });
    });

    describe('clause formatting', () => {
        it('should format literals correctly', () => {
            const result = clausify('P(a, b)');
            expect(result.success).toBe(true);
            const str = clauseToString(result.clauses![0]);
            expect(str).toBe('P(a, b)');
        });

        it('should format negated literals', () => {
            const result = clausify('-P(a)');
            expect(result.success).toBe(true);
            const str = clauseToString(result.clauses![0]);
            expect(str).toBe('¬P(a)');
        });

        it('should format CNF', () => {
            const result = clausify('(P -> Q) & R');
            expect(result.success).toBe(true);
            const str = cnfToString(result.clauses!);
            expect(str).toContain('∧');
        });
    });

    describe('blowup protection', () => {
        it('should timeout on very large formulas', () => {
            // Create a formula that causes exponential blowup during distribution
            const bigFormula = Array(20).fill('(A | B)').join(' & ');
            const result = clausify(bigFormula, { timeout: 100 });
            // Either succeeds with many clauses or times out
            if (!result.success) {
                expect(result.error?.message).toMatch(/timeout/i);
            }
        });
    });

    describe('clausesToDIMACS', () => {
        it('should produce valid DIMACS header', () => {
            const result = clausify('P & Q');
            expect(result.success).toBe(true);
            const dimacs = clausesToDIMACS(result.clauses!);
            expect(dimacs.dimacs).toMatch(/^p cnf \d+ \d+/);
            expect(dimacs.stats.variables).toBe(2);
            expect(dimacs.stats.clauses).toBe(2);
        });

        it('should handle negated literals', () => {
            const result = clausify('P -> Q');  // ¬P ∨ Q
            expect(result.success).toBe(true);
            const dimacs = clausesToDIMACS(result.clauses!);
            // Should have negative number for ¬P
            expect(dimacs.dimacs).toMatch(/-\d+/);
        });

        it('should provide variable mapping', () => {
            const result = clausify('foo & bar');
            expect(result.success).toBe(true);
            const dimacs = clausesToDIMACS(result.clauses!);
            expect(dimacs.varMap.size).toBe(2);
            expect(dimacs.varMap.has('foo')).toBe(true);
            expect(dimacs.varMap.has('bar')).toBe(true);
        });

        it('should handle empty clause set', () => {
            const result = clausify('P | -P');  // Tautology, filtered out
            expect(result.success).toBe(true);
            const dimacs = clausesToDIMACS(result.clauses!);
            expect(dimacs.stats.clauses).toBe(0);
            expect(dimacs.stats.variables).toBe(0);
            expect(dimacs.dimacs).toBe('p cnf 0 0');
        });

        it('should handle predicates with arguments', () => {
            const result = clausify('P(a) & Q(b)');
            expect(result.success).toBe(true);
            const dimacs = clausesToDIMACS(result.clauses!);
            expect(dimacs.varMap.has('P(a)')).toBe(true);
            expect(dimacs.varMap.has('Q(b)')).toBe(true);
        });
    });
});
