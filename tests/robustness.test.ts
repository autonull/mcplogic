
import { createEngineManager } from '../src/engines/manager';
import { parse } from '../src/parser';

describe('Robustness Tests', () => {
    test('EngineManager should gracefully handle invalid engine names', async () => {
        const manager = createEngineManager();
        await expect(manager.getEngine('invalid-engine')).rejects.toThrow();
        await manager.close();
    });

    test('Engines should handle empty premises', async () => {
        const manager = createEngineManager();
        const engines = manager.getEngines();

        for (const e of engines) {
            const engine = await manager.getEngine(e.name);
            const result = await engine.prove([], 'true');
            // Result might be proved (true is tautology) or failed (cannot derive), depending on engine
            // Key is it shouldn't crash
            expect(result).toBeDefined();
            expect(result.result).toMatch(/proved|failed|error/);
        }
        await manager.close();
    });

    test('Engines should handle rapid assertions/retractions', async () => {
        const manager = createEngineManager();
        // Use Prolog for session stress test (fastest)
        const session = await manager.createSession('prolog');

        for (let i = 0; i < 100; i++) {
            await session.assert(`p(${i})`);
        }

        for (let i = 0; i < 50; i++) {
            await session.retract(`p(${i})`);
        }

        const result = await session.prove('p(99)');
        expect(result.result).toBe('proved');

        const result2 = await session.prove('p(0)');
        expect(result2.result).toBe('failed'); // Retracted

        await session.close();
        await manager.close();
    });

    test('Engines should cleanup resources on close', async () => {
        const manager = createEngineManager();
        const z3 = await manager.getEngine('z3');

        // Verify it works
        const res1 = await z3.prove(['p'], 'p');
        expect(res1.result).toBe('proved');

        // Close
        await manager.close();

        // Should ideally throw or return error if used after close, or re-init
        // Implementation detail: Z3 checks context presence.
        // If re-init is supported, it might work.
        // But `close()` sets ctx = null.
        // `prove` calls `init()` if ctx is null.
        // So it should actually recover! This is good robust behavior.
        const res2 = await z3.prove(['p'], 'p');
        expect(res2.result).toBe('proved');
    });

    test('Parser should handle very deep nesting without stack overflow', () => {
        let formula = 'p';
        for (let i = 0; i < 1000; i++) {
            formula = `f(${formula})`;
        }
        formula = `p(${formula})`;

        expect(() => parse(formula)).not.toThrow();
    });
});
