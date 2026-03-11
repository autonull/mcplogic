import {
    AgentAction,
    ReasoningResult,
    ReasonOptions,
    ReasoningStep,
    AgentActionType
} from '../types/agent.js';
import { EngineManager, createEngineManager } from '../engines/manager.js';
import { parse } from '../parser/index.js';
import { ModelFinder, createModelFinder } from '../model/index.js';
import { OntologyManager } from '../ontology/manager.js';
import { OntologyConfig } from '../types/ontology.js';
import { HeuristicTranslator } from '../llm/translator.js';

export interface AgentOptions extends ReasonOptions {
    ontology?: OntologyConfig;
}

/**
 * An agent that reasons about a goal using available tools.
 * It follows a simple loop: Assert -> Query (Prove) -> Disprove (Model Find).
 */
export class ReasoningAgent {
    private engine: EngineManager;
    private modelFinder: ModelFinder;
    private ontology?: OntologyManager;
    private translator: HeuristicTranslator;
    private maxSteps: number;
    private timeout: number;
    private verbose: boolean;

    // Stateful memory
    private premises: string[] = [];

    constructor(options?: AgentOptions) {
        // Defaults: 30s timeout, 10 steps, verbose false
        this.timeout = options?.timeout ?? 30000;
        this.maxSteps = options?.maxSteps ?? 10;
        this.verbose = options?.verbose ?? false;

        // Initialize engines
        this.engine = createEngineManager(this.timeout);
        this.modelFinder = createModelFinder(this.timeout);
        this.translator = new HeuristicTranslator();

        if (options?.ontology) {
            this.ontology = new OntologyManager(options.ontology);
        }
    }

    /**
     * Assert a premise into the agent's knowledge base.
     */
    assert(premise: string): void {
        let formula = premise;

        // Apply ontology
        if (this.ontology) {
            formula = this.ontology.expandSynonyms(formula);
            this.ontology.validate(formula);
        }

        parse(formula); // Syntax Validation
        this.premises.push(formula);
    }

    /**
     * Translate natural language text to FOL formulas.
     * Does NOT automatically assert them.
     */
    async translate(text: string): Promise<string[]> {
        const result = await this.translator.translate(text);
        if (result.errors) {
            throw new Error(result.errors.join('; '));
        }

        // If there's a conclusion, return it as well?
        // Usually translate returns premises + conclusion.
        // For .tell, we probably just want assertions.
        // If there is a conclusion, we might want to return it differently?
        // For now, return premises. If conclusion exists, append it?
        // Standard .tell usually adds facts/rules.

        const formulas = [...result.premises];
        if (result.conclusion) {
            formulas.push(result.conclusion);
        }
        return formulas;
    }

    /**
     * Get current premises
     */
    getPremises(): string[] {
        return [...this.premises];
    }

    /**
     * Clear all premises
     */
    clear(): void {
        this.premises = [];
    }

    /**
     * Prove a goal using the current knowledge base.
     */
    async prove(goal: string): Promise<ReasoningResult> {
        let formula = goal;
        if (this.ontology) {
            formula = this.ontology.expandSynonyms(formula);
            this.ontology.validate(formula);
        }
        return this.reasonLoop(formula, this.premises);
    }

    /**
     * Executes the agentic reasoning loop.
     * @deprecated Use assert() and prove() for stateful interaction.
     */
    async run(goal: string, premises: string[] = []): Promise<ReasoningResult> {
        const effectivePremises = premises.length > 0 ? premises : this.premises;
        return this.reasonLoop(goal, effectivePremises);
    }

    private async reasonLoop(goal: string, premises: string[]): Promise<ReasoningResult> {
        const steps: ReasoningStep[] = [];
        // Helper to add steps
        const addStep = (type: AgentActionType, content: string, explanation?: string, result?: unknown) => {
            steps.push({
                action: { type, content, explanation },
                result,
                timestamp: Date.now()
            });
        };

        try {
            // Validation
            for (const p of premises) {
                try {
                    parse(p);
                    addStep('assert', p);
                } catch (e) {
                    addStep('conclude', 'Error', `Invalid syntax in premise: ${p}`);
                    return { answer: 'Error', steps, confidence: 0 };
                }
            }

            try {
                parse(goal);
            } catch (e) {
                addStep('conclude', 'Error', `Invalid syntax in goal: ${goal}`);
                return { answer: 'Error', steps, confidence: 0 };
            }

            // Step 2: Query (Prove)
            addStep('query', goal, 'Attempting to prove goal');

            const proofResult = await this.engine.prove(premises, goal, {
                engine: 'race' // Use race strategy for best performance
            });

            if (proofResult.found) {
                addStep('conclude', 'True', 'Proof found', proofResult);
                return { answer: 'True', steps, confidence: 1.0 };
            }

            // Step 3: Check for Counter-model (Disprove)
            const negation = `-(${goal})`;
            addStep('query', negation, 'Attempting to find counter-example');

            const modelResult = await this.modelFinder.findModel([...premises, negation]);

            if (modelResult.success) {
                addStep('conclude', 'False', 'Counter-example found', modelResult);
                return { answer: 'False', steps, confidence: 1.0 };
            }

            // Step 4: Indeterminate
            addStep('conclude', 'Unknown', 'No proof or counter-example found');
            return { answer: 'Unknown', steps, confidence: 0.0 };

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            addStep('conclude', 'Error', msg);
             return { answer: 'Error', steps, confidence: 0.0 };
        }
    }
}
