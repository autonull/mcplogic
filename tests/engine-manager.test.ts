/**
 * Engine Manager Tests
 * 
 * Tests for the engine manager with automatic engine selection.
 * Note: Use multi-character predicate names to avoid confusion with variables.
 */

import { EngineManager, createEngineManager } from '../src/engines/manager';
import { clausify, isHornFormula } from '../src/logic/clausifier';

describe('EngineManager', () => {
    let manager: EngineManager;

    beforeEach(() => {
        manager = createEngineManager();
    });

    describe('engine access', () => {
        it('should provide access to Prolog engine', async () => {
            const prolog = await manager.getPrologEngine();
            expect(prolog.name).toBe('prolog/tau-prolog');
        });

        it('should provide access to SAT engine', async () => {
            const sat = await manager.getSATEngine();
            expect(sat.name).toBe('sat/minisat');
        });

        it('should provide access to Z3 engine', async () => {
            const z3 = await manager.getZ3Engine();
            expect(z3.name).toBe('z3');
        });

        it('should provide access to Clingo engine', async () => {
            const clingo = await manager.getClingoEngine();
            expect(clingo.name).toBe('clingo');
        });

        it('should list available engines', () => {
            const engines = manager.getEngines();
            expect(engines.length).toBe(4);
            expect(engines.map(e => e.name)).toContain('prolog/tau-prolog');
            expect(engines.map(e => e.name)).toContain('sat/minisat');
            expect(engines.map(e => e.name)).toContain('z3');
            expect(engines.map(e => e.name)).toContain('clingo');
        });
    });

    describe('explicit engine selection', () => {
        it('should use Prolog when explicitly requested', async () => {
            const result = await manager.prove(
                ['man(socrates)', 'all x (man(x) -> mortal(x))'],
                'mortal(socrates)',
                { engine: 'prolog' }
            );
            expect(result.success).toBe(true);
            expect(result.engineUsed).toBe('prolog/tau-prolog');
        });

        it('should use SAT when explicitly requested', async () => {
            const result = await manager.prove(
                ['foo', 'foo -> bar'],
                'bar',
                { engine: 'sat' }
            );
            expect(result.success).toBe(true);
            expect(result.engineUsed).toBe('sat/minisat');
        });

        it('should use Z3 when explicitly requested', async () => {
            const result = await manager.prove(
                ['p -> q', 'p'],
                'q',
                { engine: 'z3' }
            );
            expect(result.success).toBe(true);
            expect(result.engineUsed).toBe('z3');
        });
    });

    describe('automatic engine selection', () => {
        it('should use Prolog for Horn formulas (auto mode)', async () => {
            // This is a Horn formula (single positive literal per clause)
            const result = await manager.prove(
                ['man(socrates)', 'all x (man(x) -> mortal(x))'],
                'mortal(socrates)',
                { engine: 'auto' }
            );
            expect(result.success).toBe(true);
            expect(result.engineUsed).toBe('prolog/tau-prolog');
        });

        it('should use Z3 or SAT for non-Horn formulas (auto mode)', async () => {
            // foo ∨ bar (two positive literals = non-Horn)
            // Using explicit disjunction in premises forces non-Horn
            const result = await manager.prove(
                ['foo | bar', '-foo'],
                'bar',
                { engine: 'auto' }
            );
            expect(result.success).toBe(true);
            // Z3 is prioritized over SAT now
            expect(['z3', 'sat/minisat']).toContain(result.engineUsed);
        });

        it('should use Z3 for arithmetic (auto mode)', async () => {
            // Use functional syntax to avoid parser limitations if any
            // plus(x, y) = 3
            // equals(plus(x, y), 3)
            // But verify parser supports '=' infix which it should.
            const result = await manager.prove(
                ['x = 1', 'y = 2'],
                'plus(x, y) = 3',
                { engine: 'auto', enableArithmetic: true }
            );
            expect(result.success).toBe(true);
            expect(result.engineUsed).toBe('z3');
        });

        it('should default to auto mode', async () => {
            const result = await manager.prove(
                ['foo', 'foo -> bar'],
                'bar'
                // No engine specified - should default to auto
            );
            expect(result.success).toBe(true);
            expect(result.engineUsed).toBeDefined();
        });
    });

    describe('prove operations', () => {
        it('should prove modus ponens', async () => {
            const result = await manager.prove(
                ['foo', 'foo -> bar'],
                'bar'
            );
            expect(result.success).toBe(true);
            expect(result.result).toBe('proved');
        });

        it('should prove Socrates syllogism', async () => {
            const result = await manager.prove(
                ['man(socrates)', 'all x (man(x) -> mortal(x))'],
                'mortal(socrates)'
            );
            expect(result.success).toBe(true);
        });

        it('should fail to prove non-theorem', async () => {
            const result = await manager.prove(
                ['foo'],
                'bar'
            );
            expect(result.success).toBe(false);
        });

        it('should handle complex formulas via SAT', async () => {
            // Non-Horn formula uses SAT engine
            const result = await manager.prove(
                ['alpha | beta', 'alpha -> gamma', 'beta -> gamma'],
                'gamma',
                { engine: 'sat' }  // Explicitly use SAT for non-Horn
            );
            expect(result.success).toBe(true);
        });
    });

    describe('checkSat operations', () => {
        it('should check satisfiability with auto engine', async () => {
            const clausifyResult = clausify('foo & bar');
            expect(clausifyResult.success).toBe(true);

            const satResult = await manager.checkSat(clausifyResult.clauses!);
            expect(satResult.sat).toBe(true);
        });

        it('should detect unsatisfiability', async () => {
            const clausifyResult = clausify('foo & -foo');
            expect(clausifyResult.success).toBe(true);

            const satResult = await manager.checkSat(clausifyResult.clauses!);
            expect(satResult.sat).toBe(false);
        });

        it('should use specified engine for checkSat', async () => {
            const clausifyResult = clausify('foo');
            expect(clausifyResult.success).toBe(true);

            const satResult = await manager.checkSat(clausifyResult.clauses!, 'sat');
            expect(satResult.sat).toBe(true);
        });
    });

    describe('options forwarding', () => {
        it('should forward verbosity to Prolog engine', async () => {
            const result = await manager.prove(
                ['man(socrates)', 'all x (man(x) -> mortal(x))'],
                'mortal(socrates)',
                { engine: 'prolog', verbosity: 'detailed' }
            );
            expect(result.success).toBe(true);
            expect(result.statistics).toBeDefined();
        });

        it('should forward verbosity to SAT engine', async () => {
            const result = await manager.prove(
                ['foo'],
                'foo',
                { engine: 'sat', verbosity: 'detailed' }
            );
            expect(result.success).toBe(true);
            expect(result.statistics).toBeDefined();
        });

        it('should support minimal verbosity', async () => {
            const result = await manager.prove(
                ['foo'],
                'foo',
                { verbosity: 'minimal' }
            );
            expect(result.success).toBe(true);
            expect(result.result).toBe('proved');
            expect(result.message).toBeUndefined();
        });
    });
});
