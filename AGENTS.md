# Code Guidelines

- Elegant
- Consolidated
- Consistent
- Organized
- Deeply deduplicated: Don't repeat yourself (DRY)

- Abstract
- Modularized
- Parameterized

- Terse syntax
    - Ternary, switch, nullish coalescing (`??`), optional chaining (`?.`), template literals
    - Destructuring for cleaner object/array access
    - Adhere to reasonable JavaScript code guidelines
    - Don't arbitrarily change method functions to arrow functions. Keep the original function declaration style unless
      there's a specific
      technical reason related to 'this' binding. Use arrow functions for callbacks and utility functions only.
    - Consider modern JavaScript language syntax

- Few comments: rely on self-documenting code.  Do not remove JSDocs containing essential Type details

- Purpose: professional, not explanatory/educational

- Unit testing: avoid Mocks; test objects directly. Write focused, deterministic tests. Test behavior, not
  implementation.

- Error handling: Use specific error types, log with context, avoid empty catch blocks, prefer early returns,
  handle errors at appropriate abstraction level

- Performance: Avoid object creation in hot paths, use Set for membership, cache expensive operations, minimize I/O,
  be mindful of deep copying

- Naming: Use descriptive names, consistent patterns for similar concepts, avoid abbreviations, follow project
  conventions

- Imports: Group and sort (stdlib, third-party, local), use consistent paths, avoid wildcards, prefer named imports

- Code structure: Keep functions focused (single responsibility), limit function length, organize methods logically,
  prefer composition over inheritance, maintain consistent class structure
