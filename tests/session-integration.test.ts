import { createSessionManager } from '../src/session/manager';
import { createEngineManager } from '../src/engines/manager';

describe('Session Integration', () => {
    let sessionManager: any;
    let engineManager: any;

    beforeEach(() => {
        engineManager = createEngineManager();
        sessionManager = createSessionManager(engineManager);
    });

    afterEach(() => {
        sessionManager.stop();
    });

    it('should create a session and assert premises', async () => {
        const session = sessionManager.create();
        await sessionManager.assertPremise(session.id, 'man(socrates)');
        await sessionManager.assertPremise(session.id, 'all x (man(x) -> mortal(x))');

        expect(session.premises.length).toBe(2);
        expect(session.engineSession).toBeDefined();
        expect(session.engineName).toBe('prolog');
    });

    it('should prove using session engine', async () => {
        const session = sessionManager.create();
        await sessionManager.assertPremise(session.id, 'man(socrates)');
        await sessionManager.assertPremise(session.id, 'all x (man(x) -> mortal(x))');

        expect(session.engineSession).toBeDefined();
        const result = await session.engineSession!.prove('mortal(socrates)');
        expect(result.success).toBe(true);
        expect(result.result).toBe('proved');
    });

    it('should switch to Z3 for arithmetic', async () => {
        const session = sessionManager.create();
        await sessionManager.assertPremise(session.id, 'x = 10');
        await sessionManager.assertPremise(session.id, 'y = 20');

        // This should trigger rebuild/switch to Z3 because of arithmetic functions
        // Note: x=10 might be handled by Prolog via equality, but plus(x,y) definitely triggers arithmetic check logic
        await sessionManager.assertPremise(session.id, 'z = plus(x, y)');

        expect(session.engineName).toBe('z3');
        const result = await session.engineSession!.prove('z = 30');
        expect(result.success).toBe(true);
    });

    it('should handle retraction', async () => {
        const session = sessionManager.create();
        await sessionManager.assertPremise(session.id, 'p');
        await sessionManager.assertPremise(session.id, 'p -> q');

        let result = await session.engineSession!.prove('q');
        expect(result.success).toBe(true);

        await sessionManager.retractPremise(session.id, 'p');
        expect(session.premises).not.toContain('p');

        // Retraction triggers rebuild
        result = await session.engineSession!.prove('q');
        // Without 'p', 'p->q' doesn't imply 'q'.
        expect(result.success).toBe(false);
    });
});
