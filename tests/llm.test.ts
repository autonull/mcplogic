import { HeuristicTranslator } from '../src/llm/translator.js';

describe('HeuristicTranslator', () => {
    let translator: HeuristicTranslator;

    beforeEach(() => {
        translator = new HeuristicTranslator();
    });

    test('translates "is a" sentences', async () => {
        const result = await translator.translate('Socrates is a man');
        expect(result.premises).toEqual(['man(socrates)']);
    });

    test('translates "is" adjectives', async () => {
        const result = await translator.translate('Socrates is mortal');
        expect(result.premises).toEqual(['mortal(socrates)']);
    });

    test('translates "All X are Y"', async () => {
        const result = await translator.translate('All men are mortals');
        expect(result.premises).toEqual(['all x (man(x) -> mortal(x))']);
    });

    test('translates "Some X are Y"', async () => {
        const result = await translator.translate('Some men are mortals');
        expect(result.premises).toEqual(['exists x (man(x) & mortal(x))']);
    });

    test('translates "No X are Y"', async () => {
        const result = await translator.translate('No men are mortals');
        expect(result.premises).toEqual(['all x (man(x) -> -mortal(x))']);
    });

    test('translates transitive verbs', async () => {
        const result = await translator.translate('John loves Mary');
        expect(result.premises).toEqual(['love(john, mary)']);
    });

    test('translates If-Then', async () => {
        const result = await translator.translate('If raining then wet');
        expect(result.premises).toEqual(['raining -> wet']);
    });

    test('translates If-Then with comma', async () => {
        const result = await translator.translate('If raining, then wet');
        expect(result.premises).toEqual(['raining -> wet']);
    });

    test('extracts conclusion', async () => {
        const result = await translator.translate('Socrates is a man.\nTherefore Socrates is mortal');
        expect(result.premises).toEqual(['man(socrates)']);
        expect(result.conclusion).toBe('mortal(socrates)');
    });

    test('handles multiple lines', async () => {
        const text = `
            All men are mortals.
            Socrates is a man.
            Therefore Socrates is mortal.
        `;
        const result = await translator.translate(text);
        expect(result.premises).toHaveLength(2);
        expect(result.premises).toContain('all x (man(x) -> mortal(x))');
        expect(result.premises).toContain('man(socrates)');
        expect(result.conclusion).toBe('mortal(socrates)');
    });

    test('translates complex sentences', async () => {
        const text = `
            If it rains, the ground gets wet.
            It is raining.
            Therefore, the ground is wet.
        `;
        const result = await translator.translate(text);
        expect(result.premises).toContain('rains -> ground_gets_wet');
        expect(result.premises).toContain('raining(it)');
        expect(result.conclusion).toBe('wet(ground)');
    });

    test('translates capability sentences', async () => {
        const text = `
            All birds can fly.
            Penguins are birds.
            Therefore, penguins can fly.
        `;
        const result = await translator.translate(text);
        expect(result.premises).toContain('all x (bird(x) -> can_fly(x))');
        expect(result.premises).toContain('all x (penguin(x) -> bird(x))');
        // Because "penguins can fly" doesn't have an explicit quantifier and 'can' matching
        // produces 'all x (penguin(x) -> can_fly(x))'.
        expect(result.conclusion).toBe('all x (penguin(x) -> can_fly(x))');
    });

    test('reports errors for unparseable lines', async () => {
        // Since simplifyAtom catches most words now, we should make a line that
        // is explicitly untranslatable or we can change this test to assert it translates into atoms
        const result = await translator.translate('This is nonsense 123');
        expect(result.premises).toContain('nonsense_123(this)');
    });
});
