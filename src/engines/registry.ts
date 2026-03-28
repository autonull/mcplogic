import { ReasoningEngine, EngineCapabilities } from './interface.js';

export interface EngineEntry {
    factory: () => Promise<ReasoningEngine>;
    capabilities: EngineCapabilities;
    instance?: ReasoningEngine;
    actualName: string;
}

export class EngineRegistry {
    private registry: Map<string, EngineEntry> = new Map();

    constructor(inferenceLimit: number) {
        this.registerEngines(inferenceLimit);
    }

    private registerEngines(inferenceLimit: number) {
        // Register Prolog
        this.registry.set('prolog', {
            factory: async () => {
                const { createPrologEngine } = await import('./prolog/index.js');
                return createPrologEngine(inferenceLimit);
            },
            capabilities: {
                horn: true,
                fullFol: false,
                equality: false,
                arithmetic: false,
                streaming: false
            },
            actualName: 'prolog/tau-prolog'
        });

        // Register SAT
        this.registry.set('sat', {
            factory: async () => {
                const { createSATEngine } = await import('./sat/index.js');
                return createSATEngine();
            },
            capabilities: {
                horn: true,
                fullFol: true,
                equality: false,
                arithmetic: false,
                streaming: false
            },
            actualName: 'sat/minisat'
        });

        // Register Z3
        this.registry.set('z3', {
            factory: async () => {
                const { Z3Engine } = await import('./z3/index.js');
                return new Z3Engine();
            },
            capabilities: {
                horn: true,
                fullFol: true,
                equality: true,
                arithmetic: true,
                streaming: false
            },
            actualName: 'z3'
        });

        // Register Clingo
        this.registry.set('clingo', {
            factory: async () => {
                const { ClingoEngine } = await import('./clingo/index.js');
                return new ClingoEngine();
            },
            capabilities: {
                horn: true,
                fullFol: true,
                equality: true,
                arithmetic: true,
                streaming: false
            },
            actualName: 'clingo'
        });
    }

    async getEngine(name: string): Promise<ReasoningEngine> {
        const entry = this.registry.get(name);
        if (!entry) {
            if (name === 'prolog/tau-prolog') return this.getEngine('prolog');
            if (name === 'sat/minisat') return this.getEngine('sat');
            throw new Error(`Engine ${name} not registered`);
        }

        if (!entry.instance) {
            entry.instance = await entry.factory();
            if (entry.instance.init) {
                await entry.instance.init();
            }
        }
        return entry.instance;
    }

    getEntries(): [string, EngineEntry][] {
        return Array.from(this.registry.entries());
    }
}
