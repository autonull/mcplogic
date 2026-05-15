import type { EvolutionStrategy, EvolutionConfig } from '../types/evolution.js';
import type { IPerformanceDatabase } from './storage.js';
import { StrategyEvolver } from './strategyEvolver.js';
import { Evaluator } from './evaluator.js';
import type { EvaluationCase } from '../types/evolution.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Orchestrates the evolution loop.
 */
export class Optimizer {
    constructor(
        private _db: IPerformanceDatabase,
        private evolver: StrategyEvolver,
        private evaluator: Evaluator,
        private config: EvolutionConfig
    ) {}

    /**
     * Loads evaluation cases from disk.
     */
    private loadEvaluationCases(): EvaluationCase[] {
        // Simplified loader: reads all .json files in evalCasesPath
        const cases: EvaluationCase[] = [];
        if (fs.existsSync(this.config.evalCasesPath)) {
            const files = fs.readdirSync(this.config.evalCasesPath).filter(f => f.endsWith('.json'));
            for (const file of files) {
                try {
                    const content = fs.readFileSync(path.join(this.config.evalCasesPath, file), 'utf-8');
                    const data = JSON.parse(content);
                    // Assuming data is array of cases or single case
                    if (Array.isArray(data)) {
                        cases.push(...data);
                    } else {
                        cases.push(data);
                    }
                } catch (e) {
                    // Ignore malformed case files
                }
            }
        }
        return cases;
    }

    /**
     * Runs the evolution loop.
     */
    async run(
        initialStrategies: EvolutionStrategy[],
        onProgress?: (msg: string) => void,
        overrides?: Partial<EvolutionConfig>
    ) {
        const config = { ...this.config, ...overrides };
        let population = [...initialStrategies];
        const evalCases = this.loadEvaluationCases();
        const caseLookup = new Map(evalCases.map(c => [c.id, c]));

        if (evalCases.length === 0) {
            if (onProgress) onProgress("No evaluation cases found. Evolution cannot proceed.");
            return population;
        }

        for (let gen = 0; gen < config.generations; gen++) {
            if (onProgress) onProgress(`=== Generation ${gen + 1} / ${config.generations} ===`);

            // 1. Evaluate current population
            for (const strategy of population) {
                let successCount = 0;
                for (const testCase of evalCases) {
                   const result = await this.evaluator.evaluate(strategy, testCase);
                   if (result.success) successCount++;
                }

                // Update in-memory metadata
                strategy.metadata.successRate = successCount / evalCases.length;
                if (onProgress) onProgress(`Strategy ${strategy.id}: ${(strategy.metadata.successRate * 100).toFixed(1)}% success`);
            }

            // 2. Selection (Elitism)
            population.sort((a, b) => b.metadata.successRate - a.metadata.successRate);
            const elites = population.slice(0, config.elitismCount);

            // 3. Reproduction & Mutation
            const newPopulation = [...elites];

            while (newPopulation.length < config.populationSize) {
                // Select parent (tournament or simple top)
                const parent = elites[Math.floor(Math.random() * elites.length)];

                // Mutate
                const child = await this.evolver.mutateStrategy(parent, caseLookup);
                newPopulation.push(child);
            }

            population = newPopulation;
        }

        if (onProgress) {
            onProgress("Evolution complete.");
            onProgress("Best Strategy: " + population[0].id);
        }

        return population;
    }
}
