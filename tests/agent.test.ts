import { ReasoningAgent } from '../src/agent/core.js';

describe('ReasoningAgent', () => {
    test('should maintain state with assertions', () => {
        const agent = new ReasoningAgent();
        agent.assert('P(a)');
        expect(agent.getPremises()).toEqual(['P(a)']);
        agent.assert('Q(a)');
        expect(agent.getPremises()).toEqual(['P(a)', 'Q(a)']);
        agent.clear();
        expect(agent.getPremises()).toEqual([]);
    });

    test('should prove simple goals from asserted premises', async () => {
        const agent = new ReasoningAgent();
        agent.assert('P(a)');
        agent.assert('P(x) -> Q(x)');

        const result = await agent.prove('Q(a)');
        expect(result.answer).toBe('True');
        expect(result.confidence).toBe(1.0);
    });

    test('should disprove goals (find counterexample)', async () => {
        const agent = new ReasoningAgent();
        agent.assert('P(a)');
        agent.assert('-Q(a)');

        const result = await agent.prove('Q(a)');
        expect(result.answer).toBe('False');
    });

    test('should find counterexample for unprovable statements', async () => {
        const agent = new ReasoningAgent();
        agent.assert('P(a)');

        // Q(a) does not follow from P(a), so a counterexample (P=T, Q=F) exists.
        const result = await agent.prove('Q(a)');
        expect(result.answer).toBe('False');
    });
});
