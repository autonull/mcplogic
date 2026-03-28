import { createEngineManager } from '../../src/engines/manager.js';
import { clausify } from '../../src/logic/clausifier.js';

describe('Resilience and Stability', () => {
    describe('Z3 Resource Management', () => {
        test('Should handle rapid session creation and destruction', async () => {
            const manager = createEngineManager();
            const iterations = 20;

            for (let i = 0; i < iterations; i++) {
                try {
                    const session = await manager.createSession('z3');
                    // Use correct syntax: 'all x'
                    await session.assert('all x (P(x) -> Q(x))');
                    await session.assert('P(a)');
                    const result = await session.prove('Q(a)');
                    expect(result.success).toBe(true);
                    await session.close();
                } catch (e) {
                    throw new Error(`Iteration ${i} failed: ${e}`);
                }
            }
        }, 60000);
    });

    describe('Clausification Limits', () => {
        test('Should abort when formula complexity exceeds node limit', () => {
            let formula = 'P(0)';
            for (let i = 1; i < 18; i++) {
                formula = `(${formula} & P(${i})) | (Q(${i}) & R(${i}))`;
            }

            const result = clausify(formula, { strategy: 'standard', timeout: 10000 });

            expect(result.success).toBe(false);
            expect(result.error?.code).toBe('CLAUSIFICATION_BLOWUP');
        });
    });
});
