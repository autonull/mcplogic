/**
 * Shared test fixtures for consistent, DRY testing.
 */
import { createLogicEngine } from '../src/engines/prolog/engine';
import { createModelFinder } from '../src/model/index';
import { ProveResult, ModelResult } from '../src/types/responses';
// Note: We might need to import specific types if they aren't exported from index
// but based on the plan, let's assume standard imports work.

// === Common Formulas ===
export const FORMULAS = {
    // Simple
    mortalSocrates: {
        premises: ['all x (man(x) -> mortal(x))', 'man(socrates)'],
        conclusion: 'mortal(socrates)',
        expected: { found: true }
    },
    // Horn clause
    hornTransitive: {
        premises: ['p(a)', 'all x (p(x) -> q(x))', 'all x (q(x) -> r(x))'],
        conclusion: 'r(a)',
        expected: { found: true }
    },
    // Non-Horn (needs SAT)
    nonHornDisjunction: {
        premises: ['P(a) | Q(a)', '-P(a)'],
        conclusion: 'Q(a)',
        expected: { found: true }
    },
    // Equality-heavy
    equalityChain: {
        premises: ['a = b', 'b = c', 'c = d'],
        conclusion: 'a = d',
        expected: { found: true }
    },
    // Unsatisfiable
    contradiction: {
        premises: ['P(a)', '-P(a)'],
        conclusion: 'Q(a)',
        expected: { found: false }
    },
    // Model-finding
    existential: {
        premises: ['exists x P(x)'],
        expectedModel: { domainSize: 1 }
    },
} as const;

// === Factory Functions ===
export function createTestEngine(options?: {
    timeout?: number;
    inferenceLimit?: number;
    highPower?: boolean;
}) {
    const { inferenceLimit = 1000, highPower = false } = options ?? {};
    const limit = highPower ? 100000 : inferenceLimit;
    return createLogicEngine(limit);
}

import { createEngineManager } from '../src/engines/manager';

export function createTestModelFinder(options?: {
    maxDomainSize?: number;
    highPower?: boolean;
}) {
    const { maxDomainSize = 10, highPower = false } = options ?? {};
    const size = highPower ? 25 : maxDomainSize;
    return createModelFinder(30000, size, createEngineManager());
}

// === Assertion Helpers ===
export function expectProved(result: ProveResult) {
    expect(result.found).toBe(true);
}

export function expectNotProved(result: ProveResult) {
    expect(result.found).toBe(false);
}

export function expectModelFound(result: ModelResult) {
    expect(result.success).toBe(true);
    expect(result.model).toBeDefined();
}
