import { EngineSession, EngineProveOptions } from '../interface.js';
import { ProveResult, createEngineError } from '../../types/index.js';
import { LogicEngine } from './engine.js';

export class PrologSession implements EngineSession {
    private engine: LogicEngine;
    private premises: string[] = [];

    constructor(inferenceLimit?: number) {
        this.engine = new LogicEngine(inferenceLimit);
    }

    async assert(formula: string): Promise<void> {
        this.premises.push(formula);
    }

    async retract(formula: string): Promise<void> {
        const index = this.premises.indexOf(formula);
        if (index !== -1) {
            this.premises.splice(index, 1);
        } else {
             // For now, silently ignore if not found, or throw?
             // The interface says "retract a formula".
             // If we can't find it, we can't retract it.
        }
    }

    async prove(
        conclusion: string,
        options?: EngineProveOptions
    ): Promise<ProveResult> {
        // We delegate to LogicEngine.prove which rebuilds the program from premises.
        // This ensures that global transformations like Skolemization consistency (if managed there)
        // and Equality Axioms (Knuth-Bendix rewriting) are applied correctly to the full set of premises.
        // While not strictly "incremental" in terms of Prolog DB state, it provides the correct semantics
        // for a logical session where assertions can change the derived rules (rewrites).
        return this.engine.prove(this.premises, conclusion, options);
    }

    async close(): Promise<void> {
        // No cleanup needed for Prolog session (pure JS)
    }
}
