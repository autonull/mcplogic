import type { EvolutionStrategy, EvaluationResult, EvaluationCase } from '../types/evolution.js';
import type { LLMProvider } from '../types/llm.js';
import type { IPerformanceDatabase } from './storage.js';
import { randomUUID } from 'crypto';

/**
 * Responsible for mutating translation strategies to improve their performance.
 */
export class StrategyEvolver {
    constructor(private llm: LLMProvider, private db: IPerformanceDatabase) {}

    /**
     * Mutates a strategy by critiquing its prompt based on failing examples.
     */
    async mutateStrategy(
        strategy: EvolutionStrategy,
        caseLookup: Map<string, EvaluationCase>
    ): Promise<EvolutionStrategy> {
        // 1. Fetch failing results for this strategy
        const results = await this.db.getResults(strategy.id);
        const failures = results.filter(r => !r.success);

        if (failures.length === 0) {
            // No failures to learn from? Maybe just randomize parameters or try to optimize for token count.
            // For now, return as is (or a slight random perturbation if we had parameter logic)
            return {
                ...strategy,
                id: randomUUID(),
                metadata: {
                    ...strategy.metadata,
                    parent: strategy.id,
                    generation: strategy.metadata.generation + 1
                }
            };
        }

        // 2. Select a few failures to analyze
        // Limit to 3 examples to keep prompt size manageable
        const examplesToAnalyze = failures.slice(0, 3);

        // 3. Construct the Critique Prompt
        const critiquePrompt = this.constructCritiquePrompt(strategy.promptTemplate, examplesToAnalyze, caseLookup);

        // 4. Call LLM to generate new prompt
        const response = await this.llm.complete([
            { role: 'user', content: critiquePrompt }
        ]);

        const newPromptTemplate = this.extractPrompt(response.content);

        // 5. Create new strategy object
        const newStrategy: EvolutionStrategy = {
            id: randomUUID(),
            description: `Evolved from ${strategy.id} based on ${failures.length} failures.`,
            promptTemplate: newPromptTemplate,
            parameters: { ...strategy.parameters }, // Keep parameters same for now
            metadata: {
                successRate: 0, // Reset metrics
                inferenceCount: 0,
                generation: strategy.metadata.generation + 1,
                parent: strategy.id,
                // Hash would be calculated here
            }
        };

        return newStrategy;
    }

    private constructCritiquePrompt(
        currentPrompt: string,
        failures: EvaluationResult[],
        caseLookup: Map<string, EvaluationCase>
    ): string {
        let prompt = `You are an expert AI system optimizer.
Your task is to improve a prompt template used for translating natural language to First-Order Logic (FOL).

Current Prompt Template:
"""
${currentPrompt}
"""

Here are some examples where this prompt failed:

`;

        failures.forEach((f, i) => {
            const testCase = caseLookup.get(f.caseId);
            const inputContext = testCase ? `Input: "${testCase.input}"\n` : `(Input unavailable for case ${f.caseId})\n`;

            prompt += `Failure #${i + 1} (Case ID: ${f.caseId}):
${inputContext}Output: ${f.rawOutput}
(Note: This output was incorrect or invalid.)
`;
        });

        prompt += `
Please analyze why the prompt failed for these cases.
Then, provide a REWRITTEN version of the prompt template that addresses these issues while maintaining performance on other cases.
The new prompt should be self-contained.

Return ONLY the new prompt template, enclosed in <new_prompt> tags.
`;
        return prompt;
    }

    private extractPrompt(response: string): string {
        const match = response.match(/<new_prompt>([\s\S]*?)<\/new_prompt>/);
        if (match) {
            return match[1].trim();
        }
        // Fallback: return whole response if tags missing (or handle error)
        return response.trim();
    }
}
