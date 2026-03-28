# Contributing to MCP Logic

Thank you for your interest in improving MCP Logic!

## Development Setup

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/angrysky56/mcp-logic.git
    cd mcp-logic
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Build**:
    ```bash
    npm run build
    ```

4.  **Run tests**:
    ```bash
    npm test
    ```

## Project Structure

-   `src/ast/`: Abstract Syntax Tree definitions and factories.
-   `src/engines/`: Reasoning engine implementations (Prover, Model Finder).
    -   `z3/`: Z3 SMT solver integration (WASM).
    -   `clingo/`: Clingo ASP solver integration (WASM).
    -   `prolog/`: Tau-Prolog integration.
    -   `sat/`: MiniSat integration via logic-solver.
-   `src/logic/`: Core logic algorithms (Clausification, Unification, etc.).
-   `src/model/`: Model finding strategies.
-   `src/server.ts`: MCP Server implementation.
-   `tests/`: Unit and integration tests.

## Coding Standards

-   **TypeScript**: Use strict typing. Avoid `any` where possible.
-   **Async/Await**: Prefer async/await over raw Promises.
-   **Resource Management**: Engines using WASM resources (like Z3) must implement `close()` in their `EngineSession` and ensure proper cleanup. Use `try...finally` blocks.
-   **Error Handling**: Use structured `LogicException` with appropriate codes.

## Adding a New Engine

1.  Create a new directory in `src/engines/`.
2.  Implement `ReasoningEngine` interface.
3.  Implement `EngineSession` interface with `close()`.
4.  Register the engine in `src/engines/manager.ts`.
5.  Add tests in `tests/`.

## Testing

Run specific tests:
```bash
npm test tests/z3-engine.test.ts
```

Run browser integration tests (requires Playwright):
```bash
npm run test:browser
```
