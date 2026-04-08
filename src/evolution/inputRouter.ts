import type { EvolutionStrategy } from '../types/evolution.js';
import type { IPerformanceDatabase } from './storage.js';
import type { TranslationStrategy } from '../types/llm.js';
import type { LLMProvider } from '../types/llm.js';
import { LLMTranslator } from '../llm/llmTranslator.js';
import { HeuristicTranslator } from '../llm/translator.js';

/**
 * Routes input to the best available TranslationStrategy.
 */
export class InputRouter {
    constructor(
        private db: IPerformanceDatabase,
        private defaultStrategy: EvolutionStrategy,
        private provider: LLMProvider
    ) {}

    /**
     * Selects and returns an instantiated TranslationStrategy ready to use.
     */
    async getTranslator(input: string): Promise<TranslationStrategy> {
        // 1. Select the best EvolutionStrategy (prompt template)
        const strategyData = await this.selectEvolutionStrategy(input);

        // 2. Instantiate the translator with that strategy
        // If strategy is "heuristic" (special ID), return HeuristicTranslator
        if (strategyData.id === 'heuristic-v1' || strategyData.id === 'heuristic') {
             return new HeuristicTranslator();
        }

        return new LLMTranslator(this.provider, strategyData);
    }

    private async selectEvolutionStrategy(input: string): Promise<EvolutionStrategy> {
        // Simple keyword-based routing or just global best for now
        // In full implementation, we analyze 'input' to find best match in DB
        const bestId = await this.db.getBestStrategy('default');

        if (!bestId) {
            return this.defaultStrategy;
        }

        // LIMITATION: Currently returning default strategy as strategy persistence is not yet implemented.
        // This will be addressed in future phases when a proper StrategyStore is added.
        return this.defaultStrategy;
    }
}
