# MCP Logic - Master Development Plan

**Mission:** Transform mcplogic into a production-grade, neurosymbolic reasoning platform that's 100% pure TypeScript with zero native build steps.

---

## Executive Summary

**Current State:**
- ✅ 8,500+ lines TypeScript, 265+ tests (80%+ coverage)
- ✅ 4 engines: Prolog, SAT, Z3, Clingo (all WASM)
- ✅ Multi-engine federation with auto-selection
- ✅ Session management, MCP server (17 tools)
- ✅ Arithmetic, equality, symmetry breaking

**Target:** Complete neurosymbolic platform with LLM integration, ontology support, and agentic reasoning.

---

## Phase 0: Foundation & Usability (1-2 hours each) **COMPLETE**

### 0.1 Enhanced CLI REPL
**Purpose:** Enable interactive testing without MCP client

**Implementation:**
```typescript
// src/cli.ts - enhanced REPL
const HELP = `
MCP Logic CLI v${VERSION}

Commands:
  .assert <formula>    Add formula to knowledge base
  .prove <goal>        Prove goal from current KB
  .model               Find model for current KB
  .list                List all premises
  .clear               Clear KB
  .load <file>         Load formulas from file
  .help                Show this help
  .quit                Exit

Examples:
  mcplogic repl
  mcplogic prove problem.p
  mcplogic model theory.p
`;
```

**Done When:**
- [ ] `.help` shows all commands with examples
- [ ] `.load` imports formulas from file
- [ ] Auto-complete for predicates (optional)
- [ ] Syntax highlighting (optional)

---

### 0.2 Error Message Enhancement
**Purpose:** Reduce user frustration with actionable errors

**Implementation:**
```typescript
// src/utils/errors.ts
export function enhanceError(error: ParseError): string {
  return `
Syntax Error: ${error.message}
  Formula: ${error.formula}
  Position: ${error.position}
  
Common patterns:
  - Predicates: lowercase (man(x), not Man(x))
  - Quantifiers: "all x (...)" or "exists x (...)"
  - Operators: -> (implies), & (and), | (or), - (not)

Example: "all x (man(x) -> mortal(x))"
`;
}
```

**Done When:**
- [ ] All parse errors show examples
- [ ] "Did you mean?" suggestions for common typos
- [ ] Links to syntax documentation

---

### 0.3 Example Library
**Purpose:** Provide working examples for common patterns

**Create:** `examples/` directory with:
- `01-socrates.p` - Classic syllogism
- `02-transitivity.p` - Transitivity proof
- `03-model-finding.p` - Find counterexample
- `04-arithmetic.p` - Arithmetic reasoning
- `05-equality.p` - Equality chain
- `06-nonhorn.p` - Non-Horn clause (needs SAT)
- `07-category.p` - Category theory
- `08-group.p` - Group theory

**Done When:**
- [ ] 10+ working examples
- [ ] Each has comments explaining syntax
- [ ] README links to examples

---

### 0.4 Test Fixtures & Helpers
**Purpose:** Reduce test duplication, improve consistency

**Create:** `tests/fixtures.ts`
```typescript
export const FORMULAS = {
  socrates: {
    premises: ['all x (man(x) -> mortal(x))', 'man(socrates)'],
    conclusion: 'mortal(socrates)',
    expected: { found: true }
  },
  horn: {
    premises: ['p(a)', 'all x (p(x) -> q(x))'],
    conclusion: 'q(a)',
    expected: { found: true }
  },
  nonHorn: {
    premises: ['P(a) | Q(a)', '-P(a)'],
    conclusion: 'Q(a)',
    expected: { found: true }
  }
} as const;

export function createTestEngine(opts?: { 
  highPower?: boolean; 
  timeout?: number;
  inferenceLimit?: number;
}) { /* ... */ }
```

**Done When:**
- [ ] 50% of tests use fixtures
- [ ] Test code reduced by 20%

---

## Phase 1: Quick Wins (High Impact, Low Effort) **COMPLETE**

### 1.1 High-Power Mode Flag
**Purpose:** Enable extended limits for complex proofs

**Changes:**
```typescript
// src/types/options.ts
export const DEFAULTS = {
  maxSeconds: 30,
  maxInferences: 5000,
  highPowerMaxSeconds: 300,
  highPowerMaxInferences: 100000,
} as const;

// src/handlers/core.ts
const inferenceLimit = args.highPower 
  ? DEFAULTS.highPowerMaxInferences 
  : (args.inference_limit ?? DEFAULTS.maxInferences);
```

**Done When:**
- [ ] `highPower: true` increases limits
- [ ] Works for `prove` and `find-model`
- [ ] Unit test verifies limits applied
- [ ] README updated

---

### 1.2 Isomorphism Filtering
**Purpose:** Skip equivalent models in enumeration

**Status:** Already implemented in `src/modelFinder.ts:267`

**Done When:**
- [ ] `count: N` returns N non-isomorphic models
- [ ] Test verifies non-isomorphism
- [ ] README line 22: `[ ]` → `[x]`

---

### 1.3 TPTP Benchmark Suite
**Purpose:** Standard ATP benchmarks for regression testing

**Create:** `benchmarks/tptp/` with 10+ problems:
- PUZ001-1 (Dreadbury Mansion)
- SYN001-1 (Simple syllogism)
- NUM001-1 (Arithmetic)
- GRP001-1 (Group theory)

**Done When:**
- [ ] `npm run benchmark:tptp` runs suite
- [ ] Results show pass/fail + timing
- [ ] CI runs on PR

---

## Phase 2: Library Export & Browser Support

### 2.1 NPM Library Export
**Purpose:** Enable use as library (not just MCP server)

**Implementation:**
```typescript
// src/lib.ts - public API
export { createLogicEngine } from './logicEngine';
export { createModelFinder } from './modelFinder';
export { parse } from './parser';
export type { Formula, ProofResult, ModelResult };

// package.json
"exports": {
  ".": "./dist/lib.js",
  "./core": "./dist/core.js"
}
```

**Done When:**
- [ ] `import { createLogicEngine } from '@mcplogic/core'` works
- [ ] TypeScript declarations included
- [ ] Example project compiles and runs
- [ ] No MCP SDK dependency in core

---

### 2.2 Browser/WASM Build
**Purpose:** Enable browser-based reasoning

**Implementation:**
```json
// package.json scripts
"build:browser": "tsc -p tsconfig.browser.json",
"start:playground": "pnpm build:browser && npx serve ."
```

**Done When:**
- [ ] `npm run build:browser` produces working bundle
- [ ] Test HTML page proves simple theorem
- [ ] No Node.js-specific code in browser bundle
- [ ] Playground UI with engine dropdown

---

### 2.3 Web Playground
**Purpose:** Interactive web UI for learning/testing

**Features:**
- Syntax-highlighted formula editor
- Real-time syntax validation
- Engine selection dropdown
- Proof trace visualization
- Model visualization (ASCII/SVG)

**Done When:**
- [ ] Modern dark-mode UI
- [ ] Works 100% offline
- [ ] Deploy to GitHub Pages

---

## Phase 3: AI Integration

### 3.1 Natural Language → FOL Translation
**Purpose:** Make logic accessible to non-experts

**Approach A:** Offline (Transformers.js)
```typescript
// src/llm/translator.ts
import { pipeline } from '@xenova/transformers';

const translator = await pipeline('text2text-generation', 'Xenova/t5-small');

export async function translate(text: string): Promise<TranslationResult> {
  const prompt = `Translate to FOL: "${text}"`;
  const result = await translator(prompt);
  return parseFOL(result[0].generated_text);
}
```

**Approach B:** LLM API (OpenAI/Anthropic)
```typescript
// src/llm/api.ts
export async function translateWithLLM(text: string): Promise<TranslationResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{
        role: 'system',
        content: 'Translate natural language to FOL syntax. Output only FOL.'
      }, {
        role: 'user',
        content: text
      }]
    })
  });
  return parseFOL(response.choices[0].message.content);
}
```

**Done When:**
- [ ] `translate-text` tool accepts natural language
- [ ] Returns structured `{ premises, conclusion }`
- [ ] Validates generated formulas
- [ ] Works offline (Transformers.js fallback)

---

### 3.2 Heuristic Strategy Selection
**Purpose:** Auto-select best engine/strategy for problem

**Implementation:**
```typescript
// src/engines/heuristics.ts
export function selectStrategy(features: FormulaFeatures): EngineChoice {
  const { hasArithmetic, hasQuantifiers, isHorn, domainSize } = features;
  
  if (hasArithmetic && hasQuantifiers) return 'z3';
  if (isHorn) return 'prolog';
  if (domainSize > 10) return 'sat';
  return 'auto';
}
```

**Done When:**
- [ ] Equality-heavy → `iterative` strategy
- [ ] Pure Horn → `prolog` engine
- [ ] Strategy choice logged in verbose output

---

## Phase 4: Neurosymbolic Features

### 4.1 Ontology Support
**Purpose:** Type constraints on predicates

**Implementation:**
```typescript
// src/types/ontology.ts
export interface Ontology {
  types: Set<string>;          // person, number, group
  relationships: Set<string>;  // loves, greater_than
  constraints: Set<string>;    // "loves(person, person)"
  synonyms: Map<string, string>; // human → person
}

// src/session/ontology-validator.ts
export function validatePredicate(
  predicate: string, 
  args: string[], 
  ontology: Ontology
): ValidationResult {
  if (!ontology.relationships.has(predicate)) {
    return { valid: false, error: `Unknown predicate: ${predicate}` };
  }
  // Check type constraints...
}
```

**Done When:**
- [ ] Sessions can have ontology constraints
- [ ] Invalid predicates rejected with clear error
- [ ] Synonym expansion works (`human` → `person`)
- [ ] Ontology can be updated dynamically

---

### 4.2 Agentic Reasoning Loop
**Purpose:** Multi-step reasoning with confidence scoring

**Implementation:**
```typescript
// src/agent/core.ts
export interface ReasoningStep {
  action: 'assert' | 'query' | 'conclude';
  content: string;
  result?: unknown;
  confidence: number;
  timestamp: number;
}

export async function agentReason(
  goal: string,
  premises: string[],
  options: { maxSteps: number; timeout: number }
): Promise<ReasoningResult> {
  const steps: ReasoningStep[] = [];
  
  // Step 1: Attempt proof
  const proof = await prove(premises, goal);
  if (proof.found) {
    return { answer: 'proved', confidence: 1.0, steps };
  }
  
  // Step 2: Find counterexample
  const counter = await findCounterexample(premises, goal);
  if (counter.success) {
    return { answer: 'disproved', confidence: 0.9, steps };
  }
  
  // Step 3: Heuristic exploration
  // ...
  
  return { answer: 'unknown', confidence: 0.3, steps };
}
```

**Done When:**
- [ ] Multi-step reasoning with assert/query/conclude
- [ ] Confidence scoring based on proof success
- [ ] Max steps limit prevents infinite loops
- [ ] Full trace of all reasoning steps

---

## Phase 5: Evolution Engine (Research)

### 5.1 Genetic Optimization of Strategies
**Purpose:** Evolve optimal proof strategies from data

**Architecture:**
```
┌─────────────────┐
│  Problem Set    │
│  (input)        │
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Strategy Pool  │ ←── Genetic Algorithm
│  (population)   │     - Mutation
│  - timeout      │     - Crossover
│  - engine       │     - Selection
│  - heuristics   │
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Validation     │ ←── Fitness Function
│  (success rate) │     - Accuracy
│                 │     - Speed
└─────────────────┘     - Generality
```

**Done When:**
- [ ] `evolution-start` runs genetic algorithm
- [ ] `evolution-list-strategies` shows evolved strategies
- [ ] `evolution-generate-cases` creates test problems
- [ ] Demonstrated improvement on benchmark suite

---

## Phase 6: Documentation & Community

### 6.1 Comprehensive Documentation
**Create:**
- `docs/GETTING_STARTED.md` - 5-minute quickstart
- `docs/EXAMPLES.md` - 20+ solved problems
- `docs/TROUBLESHOOTING.md` - FAQ
- `docs/ARCHITECTURE.md` - System design
- `docs/CONTRIBUTING.md` - How to contribute

**Done When:**
- [ ] All docs written with examples
- [ ] README links to all docs
- [ ] Tutorial notebook (Jupyter/Colab)

---

### 6.2 Performance Optimization
**Immediate wins:**
- [ ] Cache axiom library lookups
- [ ] Lazy-load engines (already partial)
- [ ] Memoize parser results

**Advanced:**
- [ ] Parallel engine execution for auto-select
- [ ] Incremental SAT solving
- [ ] Clause learning across queries

---

## Dependency Graph

```
Phase 0 (Foundation)
├── 0.1 CLI REPL
├── 0.2 Error Messages
├── 0.3 Examples
└── 0.4 Test Fixtures
    │
    v
Phase 1 (Quick Wins)
├── 1.1 High-Power Mode
├── 1.2 Isomorphism (done)
└── 1.3 TPTP Benchmarks
    │
    v
Phase 2 (Ecosystem)
├── 2.1 NPM Library Export
├── 2.2 Browser/WASM Build
└── 2.3 Web Playground
    │
    v
Phase 3 (AI Integration)
├── 3.1 NL → FOL Translation
└── 3.2 Heuristic Selection
    │
    v
Phase 4 (Neurosymbolic)
├── 4.1 Ontology Support
└── 4.2 Agentic Reasoning
    │
    v
Phase 5 (Evolution)
└── 5.1 Genetic Optimization
```

---

## Parallelization Opportunities

**Can run in parallel (no dependencies):**

| Track A | Track B | Track C |
|---------|---------|---------|
| 0.1 CLI | 0.2 Errors | 0.3 Examples |
| 1.1 High-Power | 1.2 Isomorphism | 0.4 Fixtures |
| 2.1 Library | 2.2 Browser | 1.3 TPTP |
| 3.2 Heuristics | 3.1 NL Translation | — |

---

## Recommended Start Order

1. **Phase 0 (all)** - Foundation, enables everything else
2. **Phase 1.1** - Trivial win, immediately useful
3. **Phase 1.2** - Already done, just verify
4. **Phase 1.3** - High visibility, enables testing
5. **Phase 2.1** - Foundation for browser work
6. Continue per dependency graph...

**First command:**
```bash
pnpm run check  # Verify everything works
pnpm run todo   # Review outstanding TODOs
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Test Coverage | 80% | 90% |
| Examples | 0 | 20+ |
| Documentation Pages | 2 | 10+ |
| NPM Downloads/month | 0 | 1000+ |
| GitHub Stars | - | 500+ |
| Active Contributors | 1 | 5+ |

---

## Timeline Estimate

| Phase | Effort | Timeline |
|-------|--------|----------|
| Phase 0 | 4-6 hours | Week 1 |
| Phase 1 | 3-4 hours | Week 1 |
| Phase 2 | 8-12 hours | Week 2-3 |
| Phase 3 | 6-8 hours | Week 3-4 |
| Phase 4 | 10-14 hours | Week 4-6 |
| Phase 5 | 20-40 hours | Week 6-10 |

**Total:** ~50-80 hours over 10 weeks

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| WASM compatibility issues | Test early with browser spike |
| LLM translation quality | Hybrid approach (rules + LLM) |
| Performance regression | Continuous benchmarking |
| Scope creep | Focus on Phase 0 → 1 → 2 first |

---

## Conclusion

This plan transforms mcplogic from a solid FOL engine into a **production-ready neurosymbolic platform** with:

1. **Usability:** CLI, examples, better errors
2. **Accessibility:** NPM library, browser support
3. **Intelligence:** NL translation, heuristics, agentic reasoning
4. **Optimization:** Evolution engine for strategy discovery

**Start today:** `pnpm run check` → Phase 0 → Phase 1 → Success!
