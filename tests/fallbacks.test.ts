import { createEngineManager } from '../src/engines/manager.js';

describe('Fallback behavior when native engines are missing', () => {
    test('Clingo fallback proves trivial atom present in premises', async () => {
        const manager = createEngineManager();
        const res = await manager.prove(['man(socrates)'], 'man(socrates)', { engine: 'clingo' });
        expect(res.success).toBe(true);
        expect(res.engineUsed).toBe('clingo');
    });

    test('Z3 fallback proves trivial universal instantiation case', async () => {
        const manager = createEngineManager();
        const premises = ['all x (P(x) -> Q(x))', 'P(a)'];
        const res = await manager.prove(premises, 'Q(a)', { engine: 'z3' });
        expect(res.success).toBe(true);
        expect(res.engineUsed).toBe('z3');
    });
});
