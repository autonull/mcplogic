# Adding a New Reasoning Engine

This guide describes how to integrate a new reasoning backend into `mcplogic`.

## 1. Interface Implementation

Implement the `ReasoningEngine` interface (`src/engines/interface.ts`):

```typescript
export interface ReasoningEngine {
    readonly name: string;
    readonly capabilities: EngineCapabilities;

    // Core proving method
    prove(premises: string[], conclusion: string, opts?: EngineProveOptions): Promise<ProveResult>;

    // SAT checking method (optional/stub)
    checkSat(clauses: Clause[]): Promise<SatResult>;

    // Session creation (optional)
    createSession?(): Promise<EngineSession>;

    // Lazy initialization (optional)
    init?(): Promise<void>;
}
```

## 2. Directory Structure

Create a new directory in `src/engines/<engine_name>`:
- `index.ts`: Main engine class export.
- `session.ts`: Session implementation (if stateful).
- `translator.ts`: Logic to translate FOL AST to engine input format.

## 3. Registration

Register the engine in `src/engines/manager.ts`:

```typescript
// Register New Engine
this.registry.set('my-engine', {
    factory: async () => {
        const { MyEngine } = await import('./my-engine/index.js');
        return new MyEngine();
    },
    capabilities: {
        horn: true,
        fullFol: true,
        // ... capabilities
    },
    actualName: 'my-engine'
});
```

## 4. Testing

Add integration tests in `tests/engines/<engine_name>.test.ts`.
Update `benchmarks/fol_suite.ts` to include the new engine.
