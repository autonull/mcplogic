/**
 * MCP Resources - Axiom Libraries
 * 
 * Provides browsable axiom sets for various mathematical theories
 * via the MCP resources protocol.
 */

import { categoryAxioms, monoidAxioms, groupAxioms } from '../axioms/categorical.js';

/**
 * Resource definition
 */
export interface Resource {
    uri: string;
    name: string;
    description: string;
    mimeType: string;
}

/**
 * All available resources
 */
export const RESOURCES: Resource[] = [
    {
        uri: 'logic://axioms/category',
        name: 'Category Theory Axioms',
        description: 'Basic category theory: composition, identity, associativity',
        mimeType: 'text/plain',
    },
    {
        uri: 'logic://axioms/monoid',
        name: 'Monoid Axioms',
        description: 'Monoid structure: binary operation, identity, associativity',
        mimeType: 'text/plain',
    },
    {
        uri: 'logic://axioms/group',
        name: 'Group Axioms',
        description: 'Group structure: monoid axioms plus inverses',
        mimeType: 'text/plain',
    },
    {
        uri: 'logic://axioms/ring',
        name: 'Ring Axioms',
        description: 'Ring structure: abelian group for addition, monoid for multiplication, distributivity',
        mimeType: 'text/plain',
    },
    {
        uri: 'logic://axioms/lattice',
        name: 'Lattice Axioms',
        description: 'Lattice structure: two idempotent, commutative, associative, absorptive operations',
        mimeType: 'text/plain',
    },
    {
        uri: 'logic://axioms/equivalence',
        name: 'Equivalence Relation Axioms',
        description: 'Reflexive, symmetric, and transitive relation',
        mimeType: 'text/plain',
    },
    {
        uri: 'logic://axioms/peano',
        name: 'Peano Arithmetic',
        description: 'Peano axioms for natural numbers',
        mimeType: 'text/plain',
    },
    {
        uri: 'logic://axioms/set-zfc',
        name: 'ZFC Set Theory Basics',
        description: 'Basic ZFC set theory axioms (extensionality, pairing, union)',
        mimeType: 'text/plain',
    },
    {
        uri: 'logic://axioms/propositional',
        name: 'Propositional Logic',
        description: 'Classical propositional tautologies and inference rules',
        mimeType: 'text/plain',
    },
    {
        uri: 'logic://templates/syllogism',
        name: 'Syllogism Patterns',
        description: 'Classic Aristotelian syllogism patterns',
        mimeType: 'text/plain',
    },
    {
        uri: 'logic://engines',
        name: 'Available Reasoning Engines',
        description: 'List of available reasoning engines with their capabilities',
        mimeType: 'application/json',
    },
];

export const RING_AXIOMS = [
    'all X (add(zero, X) = X)',
    'all X (add(neg(X), X) = zero)',
    'all X all Y (add(X, Y) = add(Y, X))',
    'all X all Y all Z (add(add(X, Y), Z) = add(X, add(Y, Z)))',
    'all X all Y all Z (mul(mul(X, Y), Z) = mul(X, mul(Y, Z)))',
    'all X all Y all Z (mul(X, add(Y, Z)) = add(mul(X, Y), mul(X, Z)))',
];

export const LATTICE_AXIOMS = [
    'all X (meet(X, X) = X)', 'all X (join(X, X) = X)',
    'all X all Y (meet(X, Y) = meet(Y, X))', 'all X all Y (join(X, Y) = join(Y, X))',
    'all X all Y all Z (meet(meet(X, Y), Z) = meet(X, meet(Y, Z)))',
    'all X all Y all Z (join(join(X, Y), Z) = join(X, join(Y, Z)))',
    'all X all Y (meet(X, join(X, Y)) = X)', 'all X all Y (join(X, meet(X, Y)) = X)',
];

export const EQUIVALENCE_AXIOMS = [
    'all X (equiv(X, X))',
    'all X all Y (equiv(X, Y) -> equiv(Y, X))',
    'all X all Y all Z ((equiv(X, Y) & equiv(Y, Z)) -> equiv(X, Z))',
];

/**
 * Peano arithmetic axioms
 */
function peanoAxioms(): string[] {
    return [
        // Zero is a natural number
        'nat(zero)',
        // Successor of a natural is a natural
        'all x (nat(x) -> nat(succ(x)))',
        // Zero is not a successor
        'all x (-succ(x) = zero)',
        // Successor is injective
        'all x all y ((succ(x) = succ(y)) -> x = y)',
        // Addition base case
        'all x (plus(x, zero, x))',
        // Addition recursive case
        'all x all y all z ((plus(x, y, z)) -> plus(x, succ(y), succ(z)))',
        // Multiplication base case
        'all x (mult(x, zero, zero))',
        // Multiplication recursive case
        'all x all y all z all w ((mult(x, y, z) & plus(z, x, w)) -> mult(x, succ(y), w))',
    ];
}

/**
 * ZFC set theory axioms (basic subset)
 */
function zfcAxioms(): string[] {
    return [
        // Extensionality: sets with same members are equal
        'all x all y ((all z (member(z,x) <-> member(z,y))) -> x = y)',
        // Empty set exists
        'exists e (all x (-member(x,e)))',
        // Pairing: for any a,b there's a set {a,b}
        'all a all b exists p (all x (member(x,p) <-> (x = a | x = b)))',
        // Union: union of sets exists
        'all f exists u (all x (member(x,u) <-> exists y (member(x,y) & member(y,f))))',
        // Subset definition
        'all a all b (subset(a,b) <-> all x (member(x,a) -> member(x,b)))',
    ];
}

/**
 * Propositional logic tautologies
 */
function propositionalAxioms(): string[] {
    return [
        // Identity (for any proposition P)
        'all p (p -> p)',
        // Modus ponens pattern
        'all p all q ((p & (p -> q)) -> q)',
        // Modus tollens pattern
        'all p all q (((-q) & (p -> q)) -> -p)',
        // Contraposition
        'all p all q ((p -> q) <-> ((-q) -> (-p)))',
        // Double negation
        'all p ((-(-p)) <-> p)',
        // De Morgan 1
        'all p all q ((-(p & q)) <-> ((-p) | (-q)))',
        // De Morgan 2
        'all p all q ((-(p | q)) <-> ((-p) & (-q)))',
        // Excluded middle
        'all p (p | -p)',
        // Non-contradiction
        'all p (-(p & -p))',
    ];
}

/**
 * Syllogism patterns
 */
function syllogismPatterns(): string[] {
    return [
        // Barbara (AAA-1): All M are P, All S are M ∴ All S are P
        '% Barbara (AAA-1): All M are P, All S are M → All S are P',
        'all x (middle(x) -> predicate(x))',
        'all x (subject(x) -> middle(x))',
        '% Conclusion: all x (subject(x) -> predicate(x))',
        '',
        // Celarent (EAE-1): No M are P, All S are M ∴ No S are P
        '% Celarent (EAE-1): No M are P, All S are M → No S are P',
        'all x (middle(x) -> -predicate(x))',
        'all x (subject(x) -> middle(x))',
        '% Conclusion: all x (subject(x) -> -predicate(x))',
        '',
        // Darii (AII-1): All M are P, Some S are M ∴ Some S are P
        '% Darii (AII-1): All M are P, Some S are M → Some S are P',
        'all x (middle(x) -> predicate(x))',
        'exists x (subject(x) & middle(x))',
        '% Conclusion: exists x (subject(x) & predicate(x))',
        '',
        // Ferio (EIO-1): No M are P, Some S are M ∴ Some S are not P
        '% Ferio (EIO-1): No M are P, Some S are M → Some S are not P',
        'all x (middle(x) -> -predicate(x))',
        'exists x (subject(x) & middle(x))',
        '% Conclusion: exists x (subject(x) & -predicate(x))',
    ];
}

/**
 * Get content for a resource URI
 */
export function getResourceContent(uri: string): string | null {
    switch (uri) {
        case 'logic://axioms/category':
            return formatAxioms('Category Theory Axioms', categoryAxioms());
        case 'logic://axioms/monoid':
            return formatAxioms('Monoid Axioms', monoidAxioms());
        case 'logic://axioms/group':
            return formatAxioms('Group Axioms', groupAxioms());
        case 'logic://axioms/ring':
            return formatAxioms('Ring Axioms', RING_AXIOMS);
        case 'logic://axioms/lattice':
            return formatAxioms('Lattice Axioms', LATTICE_AXIOMS);
        case 'logic://axioms/equivalence':
            return formatAxioms('Equivalence Relation Axioms', EQUIVALENCE_AXIOMS);
        case 'logic://axioms/peano':
            return formatAxioms('Peano Arithmetic', peanoAxioms());
        case 'logic://axioms/set-zfc':
            return formatAxioms('ZFC Set Theory (Basic)', zfcAxioms());
        case 'logic://axioms/propositional':
            return formatAxioms('Propositional Logic', propositionalAxioms());
        case 'logic://templates/syllogism':
            return formatAxioms('Syllogism Patterns', syllogismPatterns());
        case 'logic://engines':
            return getEngineInfo();
        default:
            return null;
    }
}

/**
 * Format axioms with header
 */
function formatAxioms(title: string, axioms: string[]): string {
    const lines = [
        `% ${title}`,
        `% Generated by MCPLogic`,
        `% Use these axioms as premises in the 'prove' tool`,
        '',
        ...axioms,
    ];
    return lines.join('\n');
}

/**
 * List all resources
 */
export function listResources(): Resource[] {
    return RESOURCES;
}

/**
 * Get engine information as JSON
 */
function getEngineInfo(): string {
    const engines = [
        {
            name: 'prolog/tau-prolog',
            capabilities: {
                horn: true,
                fullFol: false,
                equality: true,
                arithmetic: true,
                streaming: false,
            },
            recommended_for: 'Horn clauses, Datalog, simple inference, equality reasoning',
        },
        {
            name: 'sat/minisat',
            capabilities: {
                horn: true,
                fullFol: true,
                equality: false,
                arithmetic: false,
                streaming: false,
            },
            recommended_for: 'Non-Horn formulas, SAT problems, model finding',
        },
    ];

    return JSON.stringify({ engines }, null, 2);
}
