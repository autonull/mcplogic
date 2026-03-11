# MCP Logic

A self-contained MCP server for first-order logic reasoning, implemented in TypeScript with no external binary dependencies.

Original: https://github.com/angrysky56/mcp-logic/

---

## Feature Status

> ✅ = Implemented | 🔲 = Planned | 🔬 = Research/Vision

### Core Reasoning
- [x] **Theorem Proving** — Resolution-based proving via Tau-Prolog
- [x] **Model Finding** — Finite model enumeration (domain ≤25 with SAT)
- [x] **Counterexample Detection** — Find models refuting conclusions
- [x] **Syntax Validation** — Pre-validate formulas with detailed errors
- [x] **CNF Clausification** — Transform FOL to Conjunctive Normal Form
- [x] **Tseitin Transformation** — Linear-size CNF conversion for SAT (avoids exponential blowup)
- [x] **DIMACS Export** — Export CNF for external SAT solvers
- [x] **Symmetry Breaking** — Lex-leader for model search (reduces search space exponentially)
- [x] **SAT-Backed Model Finding** — Scale to domain 25+ with automatic SAT threshold
- [ ] **Isomorphism Filtering** — Skip equivalent models (deferred until "findAllModels" use case)
- [x] **Proof Traces** — Step-by-step derivation output (via `include_trace`)

### Engine Federation
- [x] **Multi-Engine Architecture** — Automatic engine selection
- [x] **Prolog Engine** (Tau-Prolog) — Horn clauses, Datalog, equality
- [x] **SAT Engine** (MiniSat) — General FOL, non-Horn formulas
- [x] **SMT Engine** (Z3) — High-performance SMT solver with arithmetic & quantifiers
- [x] **ASP Engine** (Clingo) — Answer Set Programming (Constraints & Models)
- [x] **Engine Parameter** — Explicit engine selection via `engine` param
- [x] **Iterative Deepening** — Progressive inference limit strategy for complex proofs
- [x] **Resource Management** — Automatic cleanup of WASM resources (Z3 contexts)
- [ ] **Prover9 WASM** — Optional high-power ATP (deferred until SAT+iterative proves insufficient)
- [ ] **Demodulation** — Equational term rewriting (deferred until equality workloads show perf issues)

### Logic Features
- [x] **Arithmetic Support** — Built-in: `lt`, `gt`, `plus`, `minus`, `times`, `divides`
- [x] **Equality Reasoning** — Reflexivity, symmetry, transitivity, congruence
- [x] **Rewriting System** — Knuth-Bendix style term rewriting for efficient equality handling (Prolog)
- [x] **Extended Axiom Library** — Ring, field, lattice, equivalence relation axioms
- [x] **Function Interpretation** — Full function support in model finding
- [ ] **Typed/Sorted FOL** — Domain-constraining type annotations (research)
- [ ] **Modal Logic** — Necessity, possibility operators (research)
- [ ] **Probabilistic Logic** — Weighted facts, Bayesian inference (research)

### MCP Protocol
- [x] **Session-Based Reasoning** — Incremental knowledge base construction with resource cleanup
- [x] **Axiom Resources** — Browsable libraries (category, Peano, ZFC, ring, lattice, etc.)
- [x] **Reasoning Prompts** — Templates for proof patterns
- [x] **Verbosity Control** — `minimal`/`standard`/`detailed` responses
- [x] **Structured Errors** — Machine-readable error codes and suggestions
- [x] **Streaming Progress** — Real-time progress notifications (via MCP notifications)
- [x] **High-Power Mode** — Extended limits with warning (via `highPower` option)

### Advanced Engines
- [x] **SMT (Z3 WASM)** — Theory reasoning (arithmetic, arrays), Equality, Quantifiers.
- [x] **ASP (Clingo)** — Non-monotonic reasoning, defaults, preferences.
- [ ] **Neural-Guided** — LLM-suggested proof paths with validation
- [ ] **Higher-Order Logic** — Quantify over predicates (research)

### Testing & Benchmarks
- [x] **Unit Tests** — 265+ tests passing, 80%+ coverage
- [x] **Pelletier Problems** — P1-P10 benchmark suite (extensible to P1-P75)
- [x] **Symmetry Benchmarks** — Bell number validation tests
- [x] **SAT Model Tests** — Group theory and algebraic structure verification
- [x] **Resilience Tests** — Resource leak detection and complexity limit verification
- [ ] **TPTP Library Subset** — Standard ATP benchmarks

---

## Quick Start

### Installation

```bash
git clone <repository>
cd mcplogic
npm install
npm run build
```

### Running the Server

```bash
npm start
```

### Verification

Run the comprehensive health check to verify build, tests, and engine availability:

```bash
npm run verify
```

### Claude Desktop / MCP Client Configuration

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "mcp-logic": {
      "command": "node",
      "args": ["/path/to/mcplogic/dist/index.js"]
    }
  }
}
```

### CLI Tools

The package includes a CLI for offline usage and verification:

```bash
# Check engine status
mcplogic check

# Prove a theorem from a file
mcplogic prove problem.p

# Find a model
mcplogic model theory.p

# Interactive REPL
mcplogic repl
```

---

## Available Tools

### Core Reasoning Tools

| Tool | Description |
|------|-------------|
| **prove** | Prove statements using resolution with engine selection |
| **check-well-formed** | Validate formula syntax with detailed errors |
| **find-model** | Find finite models satisfying premises |
| **find-counterexample** | Find counterexamples showing statements don't follow |
| **verify-commutativity** | Generate FOL for categorical diagram commutativity |
| **get-category-axioms** | Get axioms for category/functor/monoid/group |
| **translate-text** | Translate natural language to FOL (requires LLM) |

### Session Management Tools

| Tool | Description |
|------|-------------|
| **create-session** | Create a new reasoning session with TTL |
| **assert-premise** | Add a formula to a session's knowledge base |
| **query-session** | Query the accumulated KB with a goal |
| **retract-premise** | Remove a specific premise from the KB |
| **list-premises** | List all premises in a session |
| **clear-session** | Clear all premises (keeps session alive) |
| **delete-session** | Delete a session entirely |

---

## Engine Selection

The `prove` tool supports automatic or explicit engine selection:

```json
{
  "name": "prove",
  "arguments": {
    "premises": ["foo | bar", "-foo"],
    "conclusion": "bar",
    "engine": "auto",
    "include_trace": true
  }
}
```

The `include_trace` option (boolean) enables step-by-step derivation output in the response, useful for debugging or understanding the proof path.

| Engine | Best For | Capabilities |
|--------|----------|--------------|
| `prolog` | Horn clauses, Datalog | Equality, arithmetic, efficient unification |
| `sat` | Propositional, Finite Domain | Boolean logic, CNF solving |
| `z3` | General FOL, SMT | Arithmetic, Quantifiers, Equality |
| `clingo` | Answer Set Programming | Constraints (Experimental) |
| `auto` | Default — selects based on formula | Analyzes clause structure & features |

### Engine Capabilities

| Engine | Strength | Arithmetic | Quantifiers | Equality | Model Size |
|--------|----------|------------|-------------|----------|------------|
| **Z3** | High (SMT) | ✅ | ✅ | ✅ | Large |
| **Clingo** | High (ASP) | ✅ | Limited | ✅ | Large |
| **Prolog** | Medium (Resolution) | ✅ | Limited (Horn) | ✅ | Small/Medium |
| **SAT** | Low (Propositional) | ❌ | ❌ | ❌ | Small |

---

## Formula Syntax

This server uses first-order logic (FOL) syntax compatible with Prover9:

### Quantifiers
- `all x (...)` — Universal quantification (∀x)
- `exists x (...)` — Existential quantification (∃x)

### Connectives
- `->` — Implication (→)
- `<->` — Biconditional (↔)
- `&` — Conjunction (∧)
- `|` — Disjunction (∨)
- `-` — Negation (¬)

### Examples

```
# All men are mortal, Socrates is a man
all x (man(x) -> mortal(x))
man(socrates)

# Transitivity of greater-than
all x all y all z ((greater(x, y) & greater(y, z)) -> greater(x, z))
```

---

## MCP Resources

| Resource URI | Description |
|--------------|-------------|
| `logic://axioms/category` | Category theory axioms |
| `logic://axioms/monoid` | Monoid structure |
| `logic://axioms/group` | Group axioms |
| `logic://axioms/ring` | Ring structure |
| `logic://axioms/lattice` | Lattice structure |
| `logic://axioms/equivalence` | Equivalence relations |
| `logic://axioms/peano` | Peano arithmetic |
| `logic://axioms/set-zfc` | ZFC set theory basics |
| `logic://axioms/propositional` | Propositional tautologies |
| `logic://templates/syllogism` | Aristotelian syllogism patterns |
| `logic://engines` | Available reasoning engines (JSON) |

---

## Verbosity Control

All tools support a `verbosity` parameter:

| Level | Description | Use Case |
|-------|-------------|----------|
| `minimal` | Just success/result | Token-efficient LLM chains |
| `standard` | + message, bindings, engineUsed | Default balance |
| `detailed` | + Prolog program, statistics | Debugging |

---

## Limitations (Current)

1. **Model Size** — Finder limited to domains ≤25 elements (using SAT)
2. **Inference Depth** — Complex proofs may exceed default limit (increase via `inference_limit` or use `iterative` strategy)
3. **Higher-Order** — Only first-order logic supported

Future improvements may address these limitations as real-world usage dictates.

---

## Development

```bash
npm run build     # Compile TypeScript
npm test          # Run test suite
npm run dev       # Development mode with auto-reload
```

---

## License

MIT

---

## Future Directions

Potential enhancements will be driven by real-world usage:

- **Isomorphism Filtering** — Skip equivalent models in exhaustive model enumeration
- [x] **Proof Traces** — Step-by-step derivation output for educational/debugging use cases
- **Demodulation** — Equational term rewriting optimization for equality-heavy workloads
- [x] **Streaming Progress** — Real-time progress notifications for long-running operations
- **Extended Benchmarks** — TPTP library subset and group theory problem suites
- [x] **Advanced Engines** — SMT (Z3), ASP (Clingo)
- [x] **Evolution Engine** — Genetic algorithm for evolving efficient proof strategies
- [ ] **Neural-Guided** — LLM-suggested proof paths with validation

## Troubleshooting

### WASM Engines (Z3 / Clingo)
If you encounter errors related to `z3-solver` or `clingo-wasm`:
1. Ensure your environment supports WebAssembly.
2. In browser environments, ensure the `.wasm` files are served correctly. The `check` command can verify basic functionality in Node.js.
3. If you see `OOM` or memory errors, try running with the default engine (Prolog) or increasing the timeout/inference limits.

### build:browser Failures
Ensure you have run `npm install` to get the latest type definitions. The browser build relies on specific overrides for WASM modules that are handled in `src/engines/*/index.ts`.
