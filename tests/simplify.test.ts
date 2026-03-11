
import { simplify } from '../src/logic/transform/simplify';
import { ASTNode } from '../src/types/ast';

describe('Simplification', () => {
    // Helper to create AST nodes
    const T = (): ASTNode => ({ type: 'constant', name: 'true' });
    const F = (): ASTNode => ({ type: 'constant', name: 'false' });
    const P = (name: string): ASTNode => ({ type: 'predicate', name, args: [] });
    const Not = (operand: ASTNode): ASTNode => ({ type: 'not', operand });
    const And = (left: ASTNode, right: ASTNode): ASTNode => ({ type: 'and', left, right });
    const Or = (left: ASTNode, right: ASTNode): ASTNode => ({ type: 'or', left, right });

    test('should simplify double negation', () => {
        // !!P -> P
        const ast = Not(Not(P('P')));
        const simplified = simplify(ast);
        expect(simplified).toEqual(P('P'));
    });

    test('should simplify AND with True/False', () => {
        // P & T -> P
        expect(simplify(And(P('P'), T()))).toEqual(P('P'));
        // T & P -> P
        expect(simplify(And(T(), P('P')))).toEqual(P('P'));
        // P & F -> F (strictly P & F is F, but our simplify implementation might just return F)
        // Wait, simplifyAnd returns left/right based on logic.
        // P & F -> F (if right is F, return right (F)). Correct.
        expect(simplify(And(P('P'), F()))).toEqual(F());
    });

    test('should simplify OR with True/False', () => {
        // P | T -> T
        expect(simplify(Or(P('P'), T()))).toEqual(T());
        // P | F -> P
        expect(simplify(Or(P('P'), F()))).toEqual(P('P'));
    });
});
