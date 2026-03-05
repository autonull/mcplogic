import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Verbosity parameter schema for tools
 */
const verbositySchema = {
    type: 'string',
    enum: ['minimal', 'standard', 'detailed'],
    description: "Response verbosity: 'minimal' (token-efficient), 'standard' (default), 'detailed' (debug info)",
};

export const TOOLS: Tool[] = [
    // ==================== CORE REASONING TOOLS ====================
    {
        name: 'prove',
        description: `Prove a logical statement using resolution.

**When to use:** You have premises and want to verify a conclusion follows logically.
**When NOT to use:** You want to find counterexamples (use find-counterexample instead).

**Example:**
  premises: ["all x (man(x) -> mortal(x))", "man(socrates)"]
  conclusion: "mortal(socrates)"
  → Returns: { success: true, result: "proved" }

**Common issues:**
- "No proof found" often means inference limit reached, not that the theorem is false
- Try increasing inference_limit for complex proofs`,
        inputSchema: {
            type: 'object',
            properties: {
                premises: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of logical premises in FOL syntax',
                },
                conclusion: {
                    type: 'string',
                    description: 'Statement to prove',
                },
                inference_limit: {
                    type: 'integer',
                    description: 'Max inference steps before giving up (default: 1000). Increase for complex proofs.',
                },
                enable_arithmetic: {
                    type: 'boolean',
                    description: 'Enable arithmetic predicates (lt, gt, plus, minus, times, etc.). Default: false.',
                },
                enable_equality: {
                    type: 'boolean',
                    description: 'Auto-inject equality axioms (reflexivity, symmetry, transitivity, congruence). Default: false.',
                },
                highPower: {
                    type: 'boolean',
                    description: 'Enable extended limits (300s timeout, 100k inferences). Use for complex proofs.',
                },
                engine: {
                    type: 'string',
                    enum: ['prolog', 'sat', 'auto'],
                    description: "Reasoning engine: 'prolog' (Horn clauses), 'sat' (general FOL), 'auto' (select based on formula). Default: 'auto'.",
                },
                strategy: {
                    type: 'string',
                    enum: ['auto', 'iterative'],
                    description: "Search strategy: 'iterative' progressively increases inference limits (good for unknown complexity). Default: 'auto'.",
                },
                include_trace: {
                    type: 'boolean',
                    description: 'Include step-by-step inference trace in the output. Default: false.',
                },
                verbosity: verbositySchema,
            },
            required: ['premises', 'conclusion'],
        },
    },
    {
        name: 'check-well-formed',
        description: `Check if logical statements are well-formed with detailed syntax validation.

**When to use:** Before calling prove/find-model to catch syntax errors early.
**When NOT to use:** You already know the formula syntax is correct.

**Example:**
  statements: ["all x (P(x) -> Q(x))"]
  → Returns: { valid: true, statements: [...] }

**Common syntax issues:**
- Use lowercase for predicates/functions: man(x), not Man(x)
- Quantifiers: "all x (...)" or "exists x (...)"
- Operators: -> (implies), & (and), | (or), - (not), <-> (iff)`,
        inputSchema: {
            type: 'object',
            properties: {
                statements: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Logical statements to check',
                },
                verbosity: verbositySchema,
            },
            required: ['statements'],
        },
    },
    {
        name: 'find-model',
        description: `Find a finite model satisfying the given premises.

**When to use:** You want to show premises are satisfiable (have at least one model).
**When NOT to use:** You want to prove a conclusion follows (use prove instead).

**Example:**
  premises: ["exists x P(x)", "all x (P(x) -> Q(x))"]
  → Returns: { success: true, model: { domain: [0], predicates: {...} } }

**Performance notes:**
- Searches domains size 2 through max_domain_size (default: 10)
- Larger domains take exponentially longer
- Use domain_size to search a specific size only`,
        inputSchema: {
            type: 'object',
            properties: {
                premises: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of logical premises',
                },
                domain_size: {
                    type: 'integer',
                    description: 'Specific domain size to search (skips incremental search)',
                },
                max_domain_size: {
                    type: 'integer',
                    description: 'Maximum domain size to try (default: 10). Larger values may timeout.',
                },
                use_sat: {
                    type: ['boolean', 'string'],
                    enum: [true, false, 'auto'],
                    description: "Use SAT solver backend (recommended for domains > 10). Default: 'auto'.",
                },
                enable_symmetry: {
                    type: 'boolean',
                    description: 'Enable symmetry breaking optimization (reduces isomorphic models). Default: true.',
                },
                count: {
                    type: 'integer',
                    description: 'Number of non-isomorphic models to find (default: 1).',
                },
                verbosity: verbositySchema,
            },
            required: ['premises'],
        },
    },
    {
        name: 'find-counterexample',
        description: `Find a counterexample showing the conclusion doesn't follow from premises.

**When to use:** You suspect a conclusion doesn't logically follow and want proof.
**When NOT to use:** You want to prove the conclusion (use prove instead).

**Example:**
  premises: ["P(a)"]
  conclusion: "P(b)"
  → Returns counterexample where P(a)=true but P(b)=false

**How it works:** Searches for a model satisfying premises ∧ ¬conclusion.
If found, proves the conclusion doesn't logically follow.`,
        inputSchema: {
            type: 'object',
            properties: {
                premises: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of logical premises',
                },
                conclusion: {
                    type: 'string',
                    description: 'Conclusion to disprove',
                },
                domain_size: {
                    type: 'integer',
                    description: 'Specific domain size to search',
                },
                max_domain_size: {
                    type: 'integer',
                    description: 'Maximum domain size to try (default: 10)',
                },
                use_sat: {
                    type: ['boolean', 'string'],
                    enum: [true, false, 'auto'],
                    description: "Use SAT solver backend. Default: 'auto'.",
                },
                enable_symmetry: {
                    type: 'boolean',
                    description: 'Enable symmetry breaking optimization. Default: true.',
                },
                verbosity: verbositySchema,
            },
            required: ['premises', 'conclusion'],
        },
    },
    {
        name: 'verify-commutativity',
        description: `Verify that a categorical diagram commutes by generating FOL premises and conclusion.

**When to use:** You have a categorical diagram and want to verify path equality.
**When NOT to use:** For non-categorical reasoning (use prove directly).

**Example:**
  path_a: ["f", "g"], path_b: ["h"]
  object_start: "A", object_end: "C"
  → Generates premises/conclusion for proving compose(f,g) = h

**Output:** Returns premises and conclusion to pass to the prove tool.`,
        inputSchema: {
            type: 'object',
            properties: {
                path_a: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of morphism names in first path',
                },
                path_b: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of morphism names in second path',
                },
                object_start: {
                    type: 'string',
                    description: 'Starting object',
                },
                object_end: {
                    type: 'string',
                    description: 'Ending object',
                },
                with_category_axioms: {
                    type: 'boolean',
                    description: 'Include basic category theory axioms (default: true)',
                },
                verbosity: verbositySchema,
            },
            required: ['path_a', 'path_b', 'object_start', 'object_end'],
        },
    },
    {
        name: 'get-category-axioms',
        description: `Get FOL axioms for category theory concepts.

**Available concepts:**
- category: Composition, identity, associativity axioms
- functor: Preserves composition and identity
- natural-transformation: Naturality condition
- monoid: Binary operation with identity and associativity
- group: Monoid with inverses

**Example:**
  concept: "monoid"
  → Returns axioms for monoid structure`,
        inputSchema: {
            type: 'object',
            properties: {
                concept: {
                    type: 'string',
                    enum: ['category', 'functor', 'natural-transformation', 'monoid', 'group'],
                    description: "Which concept's axioms to retrieve",
                },
                functor_name: {
                    type: 'string',
                    description: 'For functor axioms: name of the functor (default: F)',
                },
                verbosity: verbositySchema,
            },
            required: ['concept'],
        },
    },

    // ==================== LLM TOOLS ====================
    {
        name: 'translate-text',
        description: `Translate natural language to First-Order Logic (FOL) using the server's internal translator.

**When to use:** Converting basic user input into logical formulas.
**Important Host AI Instruction:** If this tool fails due to complex language or an unconfigured internal LLM, you (the host AI) should gracefully fallback by doing the FOL translation yourself. You are highly capable of understanding natural language. Simply formulate the FOL premises and conclusion yourself, and directly invoke the 'prove' or 'find-model' tools instead of relying on 'translate-text'.
**Features:**
- Handles basic standard English forms ("All X are Y", "A is B", "If P then Q")
- Works offline (heuristic-based fallback)
- Validates generated formulas`,
        inputSchema: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'Natural language text to translate',
                },
                validate: {
                    type: 'boolean',
                    description: 'Validate generated formulas (default: true)',
                },
            },
            required: ['text'],
        },
    },

    // ==================== AGENT TOOLS ====================
    {
        name: 'agent-reason',
        description: `Neurosymbolic reasoning loop that combines proving and model finding.

**When to use:** You want the system to autonomously attempt to prove OR disprove a goal.
**How it works:**
1. Asserts premises
2. Attempts to prove goal
3. If proof fails, attempts to find counter-example
4. Returns result with confidence and step-by-step trace`,
        inputSchema: {
            type: 'object',
            properties: {
                goal: {
                    type: 'string',
                    description: 'Goal to prove or disprove',
                },
                premises: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional premises',
                },
                max_steps: {
                    type: 'integer',
                    description: 'Max steps (default: 10)',
                },
                timeout: {
                    type: 'integer',
                    description: 'Timeout in ms (default: 30000)',
                },
            },
            required: ['goal'],
        },
    },

    // ==================== EVOLUTION TOOLS ====================
    {
        name: 'evolution-start',
        description: `Start the evolution optimization loop to improve translation strategies.

**When to use:** You want to optimize the NL->FOL translation strategies using collected data.
**Effect:** Runs genetic algorithm to evolve prompt templates.`,
        inputSchema: {
            type: 'object',
            properties: {
                generations: { type: 'integer', description: 'Number of generations (default: 1)' },
                population_size: { type: 'integer', description: 'Population size (default: 5)' }
            }
        }
    },
    {
        name: 'evolution-list-strategies',
        description: `List available translation strategies.`,
        inputSchema: { type: 'object', properties: {} }
    },
    {
        name: 'evolution-generate-cases',
        description: `Generate new evaluation test cases using LLM.`,
        inputSchema: {
            type: 'object',
            properties: {
                domain: { type: 'string', description: 'Domain topic (e.g. "physics")' },
                count: { type: 'integer', description: 'Number of cases to generate' }
            },
            required: ['domain']
        }
    },

    // ==================== SESSION MANAGEMENT TOOLS ====================
    {
        name: 'create-session',
        description: `Create a new reasoning session for incremental knowledge base construction.

**When to use:** You want to build up premises incrementally and query multiple times.
**When NOT to use:** Single query with all premises known upfront (use prove directly).

**Example:**
  ttl_minutes: 30
  → Returns: { session_id: "uuid...", expires_at: ... }

**Notes:**
- Sessions auto-expire after TTL (default: 30 minutes)
- Maximum 1000 concurrent sessions
- Session ID must be passed to all session operations`,
        inputSchema: {
            type: 'object',
            properties: {
                ttl_minutes: {
                    type: 'integer',
                    description: 'Session time-to-live in minutes (default: 30, max: 1440)',
                },
                ontology: {
                    type: 'object',
                    description: 'Optional ontology configuration',
                    properties: {
                        types: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Allowed entity types (unary predicates)',
                        },
                        relationships: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Allowed relationships (predicates)',
                        },
                        constraints: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Constraints (not yet enforced)',
                        },
                        synonyms: {
                            type: 'object',
                            additionalProperties: { type: 'string' },
                            description: 'Map of synonyms to canonical forms',
                        },
                    },
                },
                verbosity: verbositySchema,
            },
            required: [],
        },
    },
    {
        name: 'assert-premise',
        description: `Add a formula to a session's knowledge base.

**When to use:** Building up premises incrementally in a session.

**Example:**
  session_id: "abc-123..."
  formula: "all x (man(x) -> mortal(x))"
  → Adds the formula to the session KB`,
        inputSchema: {
            type: 'object',
            properties: {
                session_id: {
                    type: 'string',
                    description: 'Session ID from create-session',
                },
                formula: {
                    type: 'string',
                    description: 'FOL formula to add to the knowledge base',
                },
                verbosity: verbositySchema,
            },
            required: ['session_id', 'formula'],
        },
    },
    {
        name: 'query-session',
        description: `Query the accumulated knowledge base in a session.

**When to use:** After asserting premises, query for a conclusion.

**Example:**
  session_id: "abc-123..."
  goal: "mortal(socrates)"
  → Attempts to prove the goal from accumulated premises`,
        inputSchema: {
            type: 'object',
            properties: {
                session_id: {
                    type: 'string',
                    description: 'Session ID from create-session',
                },
                goal: {
                    type: 'string',
                    description: 'FOL formula to prove from the knowledge base',
                },
                inference_limit: {
                    type: 'integer',
                    description: 'Max inference steps (default: 1000)',
                },
                verbosity: verbositySchema,
            },
            required: ['session_id', 'goal'],
        },
    },
    {
        name: 'retract-premise',
        description: `Remove a specific premise from a session's knowledge base.

**When to use:** You need to undo an assertion or explore alternative premises.

**Example:**
  session_id: "abc-123..."
  formula: "man(plato)"
  → Removes the exact formula if found`,
        inputSchema: {
            type: 'object',
            properties: {
                session_id: {
                    type: 'string',
                    description: 'Session ID from create-session',
                },
                formula: {
                    type: 'string',
                    description: 'Exact formula to remove (must match what was asserted)',
                },
                verbosity: verbositySchema,
            },
            required: ['session_id', 'formula'],
        },
    },
    {
        name: 'list-premises',
        description: `List all premises in a session's knowledge base.

**When to use:** Review what has been asserted so far.

**Example:**
  session_id: "abc-123..."
  → Returns: { premises: ["all x (man(x) -> mortal(x))", "man(socrates)"] }`,
        inputSchema: {
            type: 'object',
            properties: {
                session_id: {
                    type: 'string',
                    description: 'Session ID from create-session',
                },
                verbosity: verbositySchema,
            },
            required: ['session_id'],
        },
    },
    {
        name: 'clear-session',
        description: `Clear all premises from a session (keeps session alive).

**When to use:** Start fresh within the same session.

**Example:**
  session_id: "abc-123..."
  → Clears all premises, session remains valid`,
        inputSchema: {
            type: 'object',
            properties: {
                session_id: {
                    type: 'string',
                    description: 'Session ID from create-session',
                },
                verbosity: verbositySchema,
            },
            required: ['session_id'],
        },
    },
    {
        name: 'delete-session',
        description: `Delete a session entirely.

**When to use:** Done with a session, want to free resources.

**Example:**
  session_id: "abc-123..."
  → Session is deleted and ID becomes invalid`,
        inputSchema: {
            type: 'object',
            properties: {
                session_id: {
                    type: 'string',
                    description: 'Session ID to delete',
                },
                verbosity: verbositySchema,
            },
            required: ['session_id'],
        },
    },
];
