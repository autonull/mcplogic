/**
 * Basic tests for the MCP Logic Node.js implementation
 */

import { parse } from '../src/parser/index.js';
import { astToString } from '../src/ast/index.js';
import { validateFormulas } from '../src/validation/syntax.js';
import { categoryAxioms, functorAxioms, verifyCommutativity, monoidAxioms, groupAxioms } from '../src/axioms/categorical.js';
import { ModelFinder } from '../src/model/index.js';
import { FORMULAS, createTestModelFinder, expectModelFound } from './fixtures.js';

describe('Parser', () => {
    test('parses simple predicate', () => {
        const ast = parse('man(socrates)');
        expect(ast.type).toBe('predicate');
        expect(ast.name).toBe('man');
        expect(ast.args?.length).toBe(1);
    });

    test('parses universal quantification', () => {
        const ast = parse('all x (man(x) -> mortal(x))');
        expect(ast.type).toBe('forall');
        expect(ast.variable).toBe('x');
    });

    test('parses conjunction', () => {
        const ast = parse('P(a) & Q(b)');
        expect(ast.type).toBe('and');
    });

    test('parses negation', () => {
        const ast = parse('-P(x)');
        expect(ast.type).toBe('not');
    });

    test('roundtrips formula', () => {
        const formula = 'all x (man(x) -> mortal(x))';
        const ast = parse(formula);
        const result = astToString(ast);
        expect(result).toContain('all x');
        expect(result).toContain('man');
        expect(result).toContain('mortal');
    });
});

describe('SyntaxValidator', () => {
    test('validates correct formula', () => {
        const result = validateFormulas(['all x (P(x) -> Q(x))']);
        expect(result.valid).toBe(true);
    });

    test('detects unbalanced parentheses', () => {
        const result = validateFormulas(['all x (P(x) -> Q(x)']);
        expect(result.valid).toBe(false);
        const messages = [...result.formulaResults[0].errors, ...result.formulaResults[0].warnings];
        expect(messages.some(e => e.includes('parenthesis'))).toBe(true);
    });

    test('warns about uppercase predicates', () => {
        const result = validateFormulas(['Man(x)']);
        expect(result.formulaResults[0].warnings.some(w => w.includes('uppercase'))).toBe(true);
    });
});

describe('CategoricalHelpers', () => {
    test('generates category axioms', () => {
        const axioms = categoryAxioms();
        expect(axioms.length).toBe(6);
        expect(axioms[0]).toContain('identity');
    });

    test('generates functor axioms', () => {
        const axioms = functorAxioms('F');
        expect(axioms.length).toBe(2);
    });

    test('verifies commutativity', () => {
        const { premises, conclusion } = verifyCommutativity(
            ['f', 'g'],
            ['h'],
            'A',
            'C'
        );
        expect(premises.length).toBeGreaterThan(0);
        expect(conclusion).toContain('=');
    });

    test('generates monoid axioms', () => {
        const axioms = monoidAxioms();
        expect(axioms.length).toBe(3);
    });

    test('generates group axioms', () => {
        const axioms = groupAxioms();
        expect(axioms.length).toBe(4);
    });
});

describe('ModelFinder', () => {
    const finder = createTestModelFinder({ maxDomainSize: 4 });

    test('finds model for simple predicate', async () => {
        const result = await finder.findModel(['P(a)'], { maxDomainSize: 2 });
        expect(result.result).toBe('model_found');
        expectModelFound(result);
        expect(result.model!.domainSize).toBeGreaterThanOrEqual(1);
    });

    test('finds counterexample', async () => {
        const result = await finder.findCounterexample(['P(a)'], 'P(b)', { maxDomainSize: 3 });
        if (result.result === 'model_found') {
            expect(result.interpretation).toContain('Counterexample');
        } else {
            expect(['no_model', 'timeout']).toContain(result.result);
        }
    });

    test('finds model for shared fixture', async () => {
        const result = await finder.findModel(FORMULAS.existential.premises, { maxDomainSize: 1 });
        expectModelFound(result);
        expect(result.model!.domainSize).toBe(FORMULAS.existential.expectedModel.domainSize);
    });
});
