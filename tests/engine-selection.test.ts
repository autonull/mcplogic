
import { createEngineManager } from '../src/engines/manager';
import { EngineSelection } from '../src/engines/manager';

describe('EngineManager Selection', () => {
    test('should use Z3 when engine is "z3"', async () => {
        const manager = createEngineManager();
        const result = await manager.prove(['P(a)'], 'P(a)', { engine: 'z3' });
        expect(result.success).toBe(true);
        expect(result.engineUsed).toBe('z3');
    });

    test('should use Prolog when engine is "prolog"', async () => {
        const manager = createEngineManager();
        // Prolog requires atomic terms to be lowercase for constants
        const result = await manager.prove(['man(socrates)'], 'man(socrates)', { engine: 'prolog' });
        expect(result.success).toBe(true);
        expect(result.engineUsed).toContain('prolog');
    });

    test('should use SAT when engine is "sat"', async () => {
        const manager = createEngineManager();
        const result = await manager.prove(['P(a)'], 'P(a)', { engine: 'sat' });
        expect(result.success).toBe(true);
        expect(result.engineUsed).toContain('sat');
    });

    test('should use Clingo when engine is "clingo"', async () => {
        const manager = createEngineManager();
        // Clingo also prefers lowercase for constants
        const result = await manager.prove(['man(socrates)'], 'man(socrates)', { engine: 'clingo' });
        expect(result.success).toBe(true);
        expect(result.engineUsed).toBe('clingo');
    });

    test('should use Race when engine is "race"', async () => {
        const manager = createEngineManager();
        const result = await manager.prove(['man(socrates)'], 'man(socrates)', { engine: 'race' });
        expect(result.success).toBe(true);
        // Race uses the name of the winning engine
        expect(['z3', 'prolog/tau-prolog', 'sat/minisat', 'clingo']).toContain(result.engineUsed);
    });
});
