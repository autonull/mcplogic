
import { skolemize } from '../src/logic/transform/skolemize.js';
import { ASTNode } from '../src/types/index.js';
import { SkolemEnv } from '../src/types/clause.js';

describe('Skolemization', () => {
    // Helper to create AST nodes
    const P = (name: string, args: ASTNode[] = []): ASTNode => ({ type: 'predicate', name, args });
    const Exists = (variable: string, body: ASTNode): ASTNode => ({ type: 'exists', variable, body });
    const Forall = (variable: string, body: ASTNode): ASTNode => ({ type: 'forall', variable, body });
    const Var = (name: string): ASTNode => ({ type: 'variable', name });

    let env: SkolemEnv;

    beforeEach(() => {
        env = {
            counter: 0,
            skolemMap: new Map(),
            universalVars: [],
            generatedSkolems: new Map()
        };
    });

    test('should replace existentially quantified variable with Skolem constant', () => {
        // exists x P(x) -> P(sk0)
        const ast = Exists('x', P('P', [Var('x')]));
        const result = skolemize(ast, env);

        expect(result.type).toBe('predicate');
        expect((result as any).args[0].type).toBe('constant');
        expect((result as any).args[0].name).toBe('sk0');
    });

    test('should replace existentially quantified variable with Skolem function', () => {
        // forall y exists x P(x, y) -> forall y P(sk0(y), y)
        const ast = Forall('y', Exists('x', P('P', [Var('x'), Var('y')])));
        const result = skolemize(ast, env);

        expect(result.type).toBe('forall');
        // Check body
        const body = (result as any).body;
        expect(body.type).toBe('predicate');
        const args = body.args;
        expect(args[0].type).toBe('function');
        expect(args[0].name).toBe('sk0');
        expect(args[0].args[0].name).toBe('y');
        expect(args[1].name).toBe('y');
    });
});
