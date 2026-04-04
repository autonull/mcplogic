CI notes: Installing native engines for full tests

To run the real Z3 and Clingo engines in CI or dev machines, install the following:

- z3-solver: npm install z3-solver (may require system z3/wasi support)
- clingo-wasm: npm install clingo-wasm

If these packages fail to install in CI, keep fallback behavior enabled — unit tests will exercise fallbacks. Prefer installing on runners where wasm/native support exists.
