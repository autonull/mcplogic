import type { EvaluationCase, EvaluationResult, EvolutionStrategy } from '../types/evolution.js';
import type { IPerformanceDatabase } from './storage.js';
import type { LLMProvider } from '../types/llm.js';
import { randomUUID } from 'crypto';
import { parse } from '../parser/index.js';
import { toNNF, standardizeVariables } from '../logic/transform/index.js';
import { astToString } from '../ast/index.js';
import { parseLLMOutput } from '../llm/outputParser.js';

export class Evaluator {
    constructor(private db: IPerformanceDatabase, private llm: LLMProvider) {}

    async evaluate(strategy: EvolutionStrategy, testCase: EvaluationCase): Promise<EvaluationResult> {
        const startTime = Date.now();

        // 1. Construct prompt from strategy template and test case input
        const prompt = strategy.promptTemplate.replace('{{INPUT}}', testCase.input);

        // 2. Call LLM
        // Note: In a real implementation, we would handle parameters from strategy.parameters
        let response;
        try {
            response = await this.llm.complete([
                { role: 'user', content: prompt } // Simplified: usually system prompt is separate
            ]);
        } catch (e) {
            // Handle error
            return this.createFailureResult(strategy, testCase, startTime, (e as Error).message);
        }

        const latencyMs = Date.now() - startTime;
        const rawOutput = response.content;

        // 3. Parse and Validate
        const { premises, conclusion } = parseLLMOutput(rawOutput);
        const actualFormulas = [...premises];
        if (conclusion) actualFormulas.push(conclusion);

        const isSuccess = this.compareOutput(actualFormulas, testCase.expected);

        const result: EvaluationResult = {
            id: randomUUID(),
            strategyId: strategy.id,
            strategyHash: strategy.metadata.hash || 'unknown', // Should be calculated
            caseId: testCase.id,
            success: isSuccess,
            metrics: {
                accuracy: isSuccess ? 1.0 : 0.0,
                latencyMs,
                tokenCount: (response.usage?.promptTokens || 0) + (response.usage?.completionTokens || 0),
                syntaxValid: true, // Placeholder
                semanticMatch: isSuccess
            },
            cost: {
                promptTokens: response.usage?.promptTokens || 0,
                completionTokens: response.usage?.completionTokens || 0,
                totalTokens: (response.usage?.promptTokens || 0) + (response.usage?.completionTokens || 0)
            },
            rawOutput,
            timestamp: Date.now(),
            llmModelId: 'default' // Should come from config
        };

        // 4. Store result
        await this.db.saveResult(result);

        return result;
    }

    private createFailureResult(strategy: EvolutionStrategy, testCase: EvaluationCase, startTime: number, errorMsg: string): EvaluationResult {
        return {
            id: randomUUID(),
            strategyId: strategy.id,
            strategyHash: strategy.metadata.hash || 'unknown',
            caseId: testCase.id,
            success: false,
            metrics: {
                accuracy: 0,
                latencyMs: Date.now() - startTime,
                tokenCount: 0,
                syntaxValid: false,
                semanticMatch: false
            },
            cost: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            rawOutput: `ERROR: ${errorMsg}`,
            timestamp: Date.now(),
            llmModelId: 'default'
        };
    }

    private compareOutput(actual: string[], expected: string[]): boolean {
        // Check if every expected formula has an equivalent in the actual output
        return expected.every(exp =>
            actual.some(act => this.areEquivalent(exp, act))
        );
    }

    private areEquivalent(f1: string, f2: string): boolean {
        try {
            const ast1 = parse(f1);
            const ast2 = parse(f2);

            // Normalize: NNF + Standardized Variables
            const norm1 = standardizeVariables(toNNF(ast1));
            const norm2 = standardizeVariables(toNNF(ast2));

            return astToString(norm1) === astToString(norm2);
        } catch {
            // If parsing fails, fall back to normalized string equality
            return f1.replace(/\s+/g, '') === f2.replace(/\s+/g, '');
        }
    }
}
