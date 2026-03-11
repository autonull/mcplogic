
import { Ontology, OntologyConfig } from '../types/ontology.js';
import { parse } from '../parser/index.js';
import { astToString, traverse } from '../ast/index.js';
import { ASTNode } from '../types/index.js';
import { createGenericError } from '../types/errors.js';

/**
 * Manages ontology constraints and synonym expansion.
 */
export class OntologyManager {
    private ontology: Ontology;

    constructor(config: OntologyConfig = {}) {
        this.ontology = {
            types: new Set((config.types ?? []).filter((t): t is string => !!t)),
            relationships: new Set((config.relationships ?? []).filter((r): r is string => !!r)),
            constraints: new Set((config.constraints ?? []).filter((c): c is string => !!c)),
            synonyms: new Map(Object.entries(config.synonyms ?? {})),
        };
    }

    /**
     * Expands synonyms in a formula string.
     * Uses the parser to preserve structure and only replace predicates/constants.
     */
    expandSynonyms(formula: string): string {
        if (this.ontology.synonyms.size === 0) {
            return formula;
        }

        try {
            const ast = parse(formula);

            traverse(ast, (node) => {
                if ((node.type === 'predicate' || node.type === 'function' || node.type === 'constant') && node.name) {
                    if (this.ontology.synonyms.has(node.name)) {
                        const replacement = this.ontology.synonyms.get(node.name);
                        if (replacement) {
                            node.name = replacement;
                        }
                    }
                }
                return node;
            });

            return astToString(ast);
        } catch (e) {
            // If parsing fails, we can't safely expand synonyms.
            // Return original or throw? Given this is usually called before assertion,
            // we should probably let the validation step catch the parse error.
            return formula;
        }
    }

    /**
     * Validates a formula against the ontology.
     * Checks if predicates and types are allowed.
     * Note: Full type checking would require a more complex type system.
     * This currently checks:
     * 1. Predicates must be in 'relationships' set (if not empty)
     * 2. Constants must be in 'types' set (if not empty) - wait, types are usually unary predicates.
     *
     * Refined Logic:
     * - If 'relationships' is defined, all predicates (except built-ins) must be in it.
     * - 'types' might be used for unary predicates or constants?
     *   Usually in ontologies, types are unary predicates like Person(x).
     *   So if 'types' is non-empty, unary predicates must be in 'types' or 'relationships'.
     */
    validate(formula: string): void {
        const ast = parse(formula);
        const predicates = new Set<string>();

        traverse(ast, (node) => {
            if (node.type === 'predicate' && node.name) {
                predicates.add(node.name);
            }
            return node;
        });

        // If strict ontology is enabled (relationships set is not empty)
        if (this.ontology.relationships.size > 0 || this.ontology.types.size > 0) {
            for (const pred of predicates) {
                // Skip equality/built-ins if we had them (equality is an operator in AST)

                const isRelationship = this.ontology.relationships.has(pred);
                const isType = this.ontology.types.has(pred);

                if (!isRelationship && !isType) {
                    throw createGenericError(
                        'INVALID_PREDICATE',
                        `Predicate '${pred}' is not allowed by the ontology.`
                    );
                }
            }
        }
    }

    /**
     * Updates the ontology dynamically.
     */
    update(config: OntologyConfig): void {
        if (config.types) {
            config.types.forEach(t => t && this.ontology.types.add(t));
        }
        if (config.relationships) {
            config.relationships.forEach(r => r && this.ontology.relationships.add(r));
        }
        if (config.constraints) {
            config.constraints.forEach(c => c && this.ontology.constraints.add(c));
        }
        if (config.synonyms) {
            Object.entries(config.synonyms).forEach(([k, v]) => {
                if (k && v) this.ontology.synonyms.set(k, v);
            });
        }
    }

    /**
     * Returns the current ontology snapshot.
     */
    getSnapshot(): Ontology {
        return {
            types: new Set(this.ontology.types),
            relationships: new Set(this.ontology.relationships),
            constraints: new Set(this.ontology.constraints),
            synonyms: new Map(this.ontology.synonyms),
        };
    }

    /**
     * Returns the current ontology configuration.
     */
    getConfig(): OntologyConfig {
        return {
            types: Array.from(this.ontology.types),
            relationships: Array.from(this.ontology.relationships),
            constraints: Array.from(this.ontology.constraints),
            synonyms: Object.fromEntries(this.ontology.synonyms),
        };
    }
}
