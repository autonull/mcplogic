
import { createEngineManager } from '../src/engines/manager';
import { Clause, Literal } from '../src/types/clause';
import { ASTNode } from '../src/types/ast';

describe('Z3 checkSat', () => {
    // Helper to create AST nodes
    const constant = (name: string): ASTNode => ({ type: 'constant', name });

    // Helper to create Literals
    const lit = (predicate: string, args: ASTNode[], negated: boolean): Literal => ({
        predicate,
        args,
        negated
    });

    test('should solve satisfiable set of clauses', async () => {
        const manager = createEngineManager();

        try {
            // P(a) | Q(a)
        const clause1: Clause = {
            literals: [
                lit('P', [constant('a')], false),
                lit('Q', [constant('a')], false)
            ]
        };

        // -P(a)
        const clause2: Clause = {
            literals: [
                lit('P', [constant('a')], true)
            ]
        };

            const result = await manager.checkSat([clause1, clause2], 'z3');
            expect(result.sat).toBe(true);
        } finally {
            await manager.close();
        }
    });

    test('should solve unsatisfiable set of clauses', async () => {
        const manager = createEngineManager();

        try {
            // P(a)
        const clause1: Clause = {
            literals: [
                lit('P', [constant('a')], false)
            ]
        };

        // -P(a)
        const clause2: Clause = {
            literals: [
                lit('P', [constant('a')], true)
            ]
        };

            const result = await manager.checkSat([clause1, clause2], 'z3');
            expect(result.sat).toBe(false);
        } finally {
            await manager.close();
        }
    });

    test('should solve clauses with equality', async () => {
        const manager = createEngineManager();

        try {
            // a = b
        const clause1: Clause = {
            literals: [
                lit('=', [constant('a'), constant('b')], false)
            ]
        };

        // -(a = b)
        const clause2: Clause = {
            literals: [
                lit('=', [constant('a'), constant('b')], true)
            ]
        };

            const result = await manager.checkSat([clause1, clause2], 'z3');
            expect(result.sat).toBe(false);
        } finally {
            await manager.close();
        }
    });
});
