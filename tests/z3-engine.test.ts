import { Z3Engine } from '../src/engines/z3/index.js';

describe('Z3Engine', () => {
    let engine: Z3Engine;

    beforeEach(() => {
        engine = new Z3Engine();
    });

    afterEach(async () => {
        await engine.close();
    });

    test('proves simple implication', async () => {
        const result = await engine.prove(
            ['p -> q', 'p'],
            'q'
        );
        expect(result.result).toBe('proved');
    }, 10000); // Give it time to load WASM

    test('proves valid syllogism', async () => {
        const result = await engine.prove(
            ['all x (man(x) -> mortal(x))', 'man(socrates)'],
            'mortal(socrates)'
        );
        expect(result.result).toBe('proved');
    });

    test('fails on invalid conclusion', async () => {
        const result = await engine.prove(
            ['p'],
            'q'
        );
        expect(result.result).toBe('failed');
    });

    test('handles arithmetic equality', async () => {
        const result = await engine.prove(
            ['x = 5'],
            'x = 5',
            { enableArithmetic: true }
        );
        expect(result.result).toBe('proved');
    });

    test('handles complex arithmetic', async () => {
        // Use predicate syntax: gt(x, 0)
        // Also function syntax: plus(x, 1)
        const result = await engine.prove(
            ['all x (gt(x, 0) -> gt(plus(x, 1), 1))'],
            'gt(2, 0) -> gt(3, 1)',
             { enableArithmetic: true }
        );
        expect(result.result).toBe('proved');
    });
});
