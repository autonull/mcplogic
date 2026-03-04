import { ASTNode } from '../../types/ast.js';
import { isArithmeticOperator, isArithmeticPredicate } from '../../axioms/arithmetic.js';
import { Z3Context, Z3Expr, Z3Bool, Z3Arith } from './types.js';

export interface Z3TranslationOptions {
    enableArithmetic?: boolean;
    enableEquality?: boolean;
}

export class Z3Translator {
    private ctx: Z3Context;
    private sort: unknown; // The domain sort
    private options: Z3TranslationOptions;

    // Symbol tables
    private functions: Map<string, unknown> = new Map();
    private predicates: Map<string, unknown> = new Map();
    private constants: Map<string, Z3Expr> = new Map();

    // Bound variables stack for quantifiers
    private boundVars: Map<string, Z3Expr> = new Map();

    constructor(ctx: Z3Context, options: Z3TranslationOptions = {}) {
        this.ctx = ctx;
        this.options = options;

        if (this.options.enableArithmetic) {
            this.sort = this.ctx.Int.sort();
        } else {
            this.sort = this.ctx.Sort.declare('U');
        }
    }

    translate(node: ASTNode): Z3Expr {
        switch (node.type) {
            case 'and':
                return this.ctx.And(
                    this.translate(node.left!) as unknown as Z3Bool,
                    this.translate(node.right!) as unknown as Z3Bool
                );
            case 'or':
                return this.ctx.Or(
                    this.translate(node.left!) as unknown as Z3Bool,
                    this.translate(node.right!) as unknown as Z3Bool
                );
            case 'not':
                return this.ctx.Not(this.translate(node.operand!) as unknown as Z3Bool);
            case 'implies':
                return this.ctx.Implies(
                    this.translate(node.left!) as unknown as Z3Bool,
                    this.translate(node.right!) as unknown as Z3Bool
                );
            case 'iff':
                return this.ctx.Eq(this.translate(node.left!), this.translate(node.right!));
            case 'equals':
                return this.ctx.Eq(this.translate(node.left!), this.translate(node.right!));

            case 'forall':
            case 'exists':
                return this.translateQuantifier(node);

            case 'predicate':
                return this.translatePredicate(node);

            case 'function':
                return this.translateFunction(node);

            case 'variable':
                return this.translateVariable(node);

            case 'constant':
                return this.translateConstant(node);

            default:
                throw new Error(`Unknown AST node type: ${node.type}`);
        }
    }

    private translateQuantifier(node: ASTNode): Z3Expr {
        const varName = node.variable!;
        // Use Const for bound variable definition in quantifiers
        const z3Var = this.ctx.Const(varName, this.sort as Parameters<typeof this.ctx.Const>[1]);

        const prev = this.boundVars.get(varName);
        this.boundVars.set(varName, z3Var);

        const body = this.translate(node.body!) as unknown as Z3Bool;

        if (prev) this.boundVars.set(varName, prev);
        else this.boundVars.delete(varName);

        // ForAll/Exists expects array of Consts
        // We cast to unknown and then to the required type
        if (node.type === 'forall') {
            return this.ctx.ForAll([z3Var as unknown as Parameters<typeof this.ctx.ForAll>[0][0]], body);
        } else {
            return this.ctx.Exists([z3Var as unknown as Parameters<typeof this.ctx.Exists>[0][0]], body);
        }
    }

    private translatePredicate(node: ASTNode): Z3Expr {
        const name = node.name!;
        const args = (node.args || []).map(arg => this.translate(arg));

        // Handle arithmetic predicates
        if (this.options.enableArithmetic && isArithmeticPredicate(name)) {
            const left = args[0] as unknown as Z3Arith;
            const right = args[1] as unknown as Z3Arith;
            switch (name) {
                case 'lt': case 'less': case '<': return this.ctx.LT(left, right);
                case 'gt': case 'greater': case '>': return this.ctx.GT(left, right);
                case 'lte': case 'leq': case '<=': return this.ctx.LE(left, right);
                case 'gte': case 'geq': case '>=': return this.ctx.GE(left, right);
                case '!=': return this.ctx.Not(this.ctx.Eq(left, right));
            }
        }

        if (args.length === 0) {
            return this.ctx.Bool.const(name);
        }

        if (!this.predicates.has(name)) {
            const domain = args.map(() => this.sort as Parameters<typeof this.ctx.Function.declare>[1]);
            // Function.declare(name, ...domain, range)
            const decl = this.ctx.Function.declare(name, ...domain, this.ctx.Bool.sort());
            this.predicates.set(name, decl);
        }

        const decl = this.predicates.get(name) as any;
        return decl.call(...args);
    }

    private translateFunction(node: ASTNode): Z3Expr {
        const name = node.name!;
        const args = (node.args || []).map(arg => this.translate(arg));

        // Handle arithmetic functions
        if (this.options.enableArithmetic && isArithmeticOperator(name)) {
             const left = args[0] as unknown as Z3Arith;
             const right = args[1] as unknown as Z3Arith;
             switch (name) {
                case 'plus': case 'add': case '+': return this.ctx.Sum(left, right);
                case 'minus': case 'sub': case '-': return this.ctx.Sub(left, right);
                case 'times': case 'mul': case '*': return this.ctx.Product(left, right);
                case 'divide': case 'div': case '/': return this.ctx.Div(left, right);
                case 'mod': return this.ctx.Mod(left as unknown as Z3Arith, right as unknown as Z3Arith); // Mod expects Int specifically
                case 'unary_minus': return this.ctx.Neg(left);
            }
        }

        if (args.length === 0) {
            return this.translateConstant(node);
        }

        if (!this.functions.has(name)) {
             const domain = args.map(() => this.sort as Parameters<typeof this.ctx.Function.declare>[1]);
             const decl = this.ctx.Function.declare(name, ...domain, this.sort as Parameters<typeof this.ctx.Function.declare>[1]);
             this.functions.set(name, decl);
        }

        const decl = this.functions.get(name) as any;
        return decl.call(...args);
    }

    private translateVariable(node: ASTNode): Z3Expr {
        const name = node.name!;
        if (this.boundVars.has(name)) {
            return this.boundVars.get(name)!;
        }
        return this.translateConstant(node);
    }

    private translateConstant(node: ASTNode): Z3Expr {
        const name = node.name!;

        if (this.options.enableArithmetic && /^-?\d+$/.test(name)) {
            return this.ctx.Int.val(parseInt(name, 10));
        }

        if (!this.constants.has(name)) {
            const c = this.ctx.Const(name, this.sort as Parameters<typeof this.ctx.Const>[1]);
            this.constants.set(name, c);
        }

        return this.constants.get(name)!;
    }
}
