import { ReasoningAgent } from '../src/agent/core.js';

describe('ReasoningAgent Enhanced', () => {
    let agents: ReasoningAgent[] = [];

    afterAll(async () => {
        await Promise.all(agents.map(a => a.close()));
    });

    test('should support synonym expansion via ontology', () => {
        const agent = new ReasoningAgent({
            ontology: {
                synonyms: { 'human': 'person' }
            }
        });
        agents.push(agent);

        agent.assert('human(socrates)');
        const premises = agent.getPremises();
        expect(premises[0]).toContain('person(socrates)');
    });

    test('should translate natural language', async () => {
        const agent = new ReasoningAgent();
        agents.push(agent);
        const formulas = await agent.translate('Socrates is a man');
        expect(formulas).toEqual(['man(socrates)']);
    });

    test('should translate and assert via manual integration', async () => {
        const agent = new ReasoningAgent();
        agents.push(agent);
        const formulas = await agent.translate('All men are mortal');
        for (const f of formulas) agent.assert(f);

        expect(agent.getPremises().length).toBe(1);
        expect(agent.getPremises()[0]).toContain('all x (man(x) -> mortal(x))');
    });
});
