/**
 * CNF Clause Types
 * 
 * Types for representing formulas in Conjunctive Normal Form (CNF).
 * Used by the clausifier to transform arbitrary FOL into clause form.
 */

import { ASTNode } from './ast.js';
import { LogicError } from './errors.js';

/**
 * A literal is a predicate or its negation.
 * In CNF, clauses are disjunctions of literals.
 */
export interface Literal {
    /** Predicate name */
    predicate: string;
    /** Arguments (variable or constant names) */
    args: ASTNode[];
    /** Whether this literal is negated */
    negated: boolean;
}

/**
 * A clause is a disjunction of literals.
 * A CNF formula is a conjunction of clauses.
 */
export interface Clause {
    /** Literals in this clause (implicitly disjunctive) */
    literals: Literal[];
    /** Original formula this clause was derived from (for debugging) */
    origin?: string;
}

/**
 * Environment for Skolemization and auxiliary symbol generation.
 */
export interface SkolemEnv {
    /** Counter for generating unique Skolem function names */
    counter: number;
    /** Map of existentially quantified variables to their Skolem terms */
    skolemMap: Map<string, { name: string; args: string[] }>;
    /** Currently bound universal variables (for creating Skolem function arguments) */
    universalVars: string[];
    /** Permanent record of all generated Skolem functions (name → arity) */
    generatedSkolems: Map<string, number>;
    /** Counter for generating unique Tseitin predicate names */
    tseitinCounter?: number;
}

/**
 * Options for the clausification process.
 */
export interface ClausifyOptions {
    /** Maximum number of clauses before aborting (default: 10000) */
    maxClauses?: number;
    /** Maximum literals per clause before aborting (default: 50) */
    maxClauseSize?: number;
    /** Timeout in milliseconds (default: 5000) */
    timeout?: number;
    /** CNF transformation strategy: 'standard' (distribution) or 'tseitin' (variable introduction) */
    strategy?: 'standard' | 'tseitin';
    /** Optional existing Skolem environment to maintain consistent function names across calls */
    skolemEnv?: SkolemEnv;
    /** Internal node count for OOM protection */
    _nodeCount?: number;
}

/**
 * Result of clausification.
 */
export interface ClausifyResult {
    /** Whether clausification succeeded */
    success: boolean;
    /** The resulting clauses (if successful) */
    clauses?: Clause[];
    /** Skolem functions introduced during clausification (name → arity) */
    skolemFunctions?: Map<string, number>;
    /** Error information (if failed) */
    error?: LogicError;
    /** Statistics about the clausification */
    statistics: {
        /** Number of AST nodes in input formula */
        originalSize: number;
        /** Number of clauses produced */
        clauseCount: number;
        /** Maximum clause size (literals) */
        maxClauseSize: number;
        /** Time taken in milliseconds */
        timeMs: number;
    };
}

/**
 * Result of converting clauses to DIMACS format.
 */
export interface DIMACSResult {
    /** DIMACS CNF format string: "p cnf <vars> <clauses>\n<clause lines>" */
    dimacs: string;
    /** Mapping from atom strings to positive integer variable numbers */
    varMap: Map<string, number>;
    /** Statistics about the DIMACS output */
    stats: { variables: number; clauses: number };
}
