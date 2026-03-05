/**
 * Extended parser tests for robustness
 */

import { parse, Tokenizer, Parser } from '../src/parser/index.js';
import { astToString } from '../src/ast/index.js';
import { validateFormulas } from '../src/validation/syntax.js';

describe('Parser - Extended Coverage', () => {
    describe('Tokenizer', () => {
        test('tokenizes all operator types', () => {
            const tokenizer = new Tokenizer('all x exists y (P(x) -> Q(y) & R(z) | S(w))');
            const tokens = tokenizer.tokenize();

            const types = tokens.map(t => t.type);
            expect(types).toContain('QUANTIFIER');
            expect(types).toContain('IMPLIES');
            expect(types).toContain('AND');
            expect(types).toContain('OR');
        });

        test('handles biconditional', () => {
            const tokenizer = new Tokenizer('P(x) <-> Q(x)');
            const tokens = tokenizer.tokenize();
            expect(tokens.some(t => t.type === 'IFF')).toBe(true);
        });

        test('handles equality', () => {
            const tokenizer = new Tokenizer('x = y');
            const tokens = tokenizer.tokenize();
            expect(tokens.some(t => t.type === 'EQUALS')).toBe(true);
        });

        test('handles trailing period', () => {
            const tokenizer = new Tokenizer('P(a).');
            const tokens = tokenizer.tokenize();
            expect(tokens.some(t => t.type === 'DOT')).toBe(true);
        });

        test('throws on invalid character', () => {
            const tokenizer = new Tokenizer('P(a) @ Q(b)');
            expect(() => tokenizer.tokenize()).toThrow(/Unexpected character/);
        });
    });

    describe('Parser - Complex Formulas', () => {
        test('parses nested quantifiers', () => {
            const ast = parse('all x exists y (loves(x, y))');
            expect(ast.type).toBe('forall');
            expect(ast.body?.type).toBe('exists');
        });

        test('parses double negation', () => {
            const ast = parse('--P(x)');
            expect(ast.type).toBe('not');
            expect(ast.operand?.type).toBe('not');
        });

        test('parses complex boolean expression', () => {
            const ast = parse('(P(x) & Q(x)) | (R(x) & S(x))');
            expect(ast.type).toBe('or');
            expect(ast.left?.type).toBe('and');
            expect(ast.right?.type).toBe('and');
        });

        test('parses multi-argument predicate', () => {
            const ast = parse('between(a, b, c)');
            expect(ast.type).toBe('predicate');
            expect(ast.args?.length).toBe(3);
        });

        test('parses equality', () => {
            const ast = parse('x = y');
            expect(ast.type).toBe('equals');
        });

        test('parses function terms', () => {
            const ast = parse('P(f(x))');
            expect(ast.type).toBe('predicate');
            expect(ast.args?.[0].type).toBe('function');
        });

        test('parses propositional atom', () => {
            const ast = parse('rain');
            expect(ast.type).toBe('predicate');
            expect(ast.name).toBe('rain');
            expect(ast.args?.length).toBe(0);
        });
    });

    describe('Parser - Arithmetic', () => {
        it('parses basic arithmetic equality', () => {
            const ast = parse('2 + 2 = 4');
            expect(ast.type).toBe('equals');
            const eqNode = ast as any;
            expect(eqNode.right.name).toBe('4');
            expect(eqNode.left.type).toBe('function');
            expect(eqNode.left.name).toBe('+');
            expect(eqNode.left.args[0].name).toBe('2');
        });

        it('parses comparison operators', () => {
            const ast = parse('x > 5');
            expect(ast.type).toBe('predicate');
            const pNode = ast as any;
            expect(pNode.name).toBe('>');
            expect(pNode.args[0].name).toBe('x');
            expect(pNode.args[1].name).toBe('5');
        });
    });

    describe('astToString - Roundtrip', () => {
        const testCases = [
            'P(a)',
            'P(x) & Q(x)',
            'P(x) | Q(x)',
            '-P(x)',
            'P(x) -> Q(x)',
            'P(x) <-> Q(x)',
            'all x (P(x))',
            'exists x (P(x))',
        ];

        testCases.forEach(formula => {
            test(`roundtrips: ${formula}`, () => {
                const ast = parse(formula);
                const result = astToString(ast);
                // Parse again to verify structural equivalence
                const ast2 = parse(result);
                expect(ast2.type).toBe(ast.type);
            });
        });
    });
});

describe('Parser - Error Handling', () => {
    test('throws on empty input', () => {
        expect(() => parse('')).toThrow();
    });

    test('throws on unmatched parenthesis', () => {
        expect(() => parse('P(x')).toThrow();
    });

    test('throws on missing quantifier body', () => {
        expect(() => parse('all x')).toThrow();
    });

    test('throws on invalid token sequence', () => {
        expect(() => parse('P(x) & & Q(y)')).toThrow();
    });
});

describe('Validation - syntax.ts', () => {
    test('validates formulas correctly and returns errors for missing parenthesis', () => {
        const formula = "all x (triangle(x) -> have_three_side(x)";
        const result = validateFormulas([formula]);
        expect(result.valid).toBe(false);
        expect(result.formulaResults.length).toBe(1);
        expect(result.formulaResults[0].formula).toBe(formula);
        expect(result.formulaResults[0].valid).toBe(false);
        expect(result.formulaResults[0].errors.length).toBeGreaterThan(0);
        expect(result.formulaResults[0].errors[0]).toContain('Expected');
    });

    test('validates valid formulas successfully', () => {
        const result = validateFormulas(["all x (triangle(x) -> have_three_side(x))"]);
        expect(result.valid).toBe(true);
        expect(result.formulaResults[0].valid).toBe(true);
        expect(result.formulaResults[0].errors.length).toBe(0);
    });
});
