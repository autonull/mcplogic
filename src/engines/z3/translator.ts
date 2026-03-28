import { ASTNode } from '../../types/ast.js';
import { isArithmeticOperator, isArithmeticPredicate } from '../../axioms/arithmetic.js';
import { Z3Context, Z3Expr, Z3Bool, Z3Int } from './types.js';

export interface Z3TranslationOptions {
    enableArithmetic?: boolean;
    enableEquality?: boolean;
}

export class Z3Translator {
    private ctx: Z3Context;
    private sort: any; // The domain sort (Int or Uninterpreted)
    private options: Z3TranslationOptions;

    // Symbol tables
    private functions: Map<string, any> = new Map();
    private predicates: Map<string, any> = new Map();
    private constants: Map<string, Z3Expr> = new Map();

    // Bound variables stack for quantifiers
    private boundVars: Map<string, Z3Expr> = new Map();

    constructor(ctx: Z3Context, options: Z3TranslationOptions = {}) {
        this.ctx = ctx;
        this.options = options;

        // Define the universal sort
        if (this.options.enableArithmetic) {
            this.sort = this.ctx.Int.sort();
        } else {
            // Use Sort.declare for uninterpreted sort
            this.sort = this.ctx.Sort.declare('U');
        }
    }

    translate(node: ASTNode): Z3Expr {
        switch (node.type) {
            case 'and':
                return this.ctx.And(this.translate(node.left!), this.translate(node.right!));
            case 'or':
                return this.ctx.Or(this.translate(node.left!), this.translate(node.right!));
            case 'not':
                return this.ctx.Not(this.translate(node.operand!));
            case 'implies':
                return this.ctx.Implies(this.translate(node.left!), this.translate(node.right!));
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

        // Create a fresh bound variable
        // Use string name directly if Symbol is not available or not required
        const z3Var = this.ctx.Const(varName, this.sort);

        // Push to scope
        const prev = this.boundVars.get(varName);
        this.boundVars.set(varName, z3Var);

        const body = this.translate(node.body!);

        // Pop scope
        if (prev) this.boundVars.set(varName, prev);
        else this.boundVars.delete(varName);

        if (node.type === 'forall') {
            return this.ctx.ForAll([z3Var], body);
        } else {
            return this.ctx.Exists([z3Var], body);
        }
    }

    private translatePredicate(node: ASTNode): Z3Expr {
        const name = node.name!;
        const args = node.args!.map(arg => this.translate(arg));

        // Handle arithmetic predicates
        if (this.options.enableArithmetic && isArithmeticPredicate(name)) {
            const left = args[0];
            const right = args[1];
            switch (name) {
                case 'lt': case 'less': return this.ctx.LT(left, right);
                case 'gt': case 'greater': return this.ctx.GT(left, right);
                case 'lte': case 'leq': return this.ctx.LE(left, right);
                case 'gte': case 'geq': return this.ctx.GE(left, right);
            }
        }

        // Standard predicate
        if (args.length === 0) {
            return this.ctx.Bool.const(name);
        }

        if (!this.predicates.has(name)) {
            // Declare it using ctx.Function.declare
            const domain = args.map(() => this.sort);
            const decl = this.ctx.Function.declare(name, ...domain, this.ctx.Bool.sort());
            this.predicates.set(name, decl);
        }

        const decl = this.predicates.get(name);
        return decl.call(...args);
    }

    private translateFunction(node: ASTNode): Z3Expr {
        const name = node.name!;
        const args = node.args!.map(arg => this.translate(arg));

        // Handle arithmetic functions
        if (this.options.enableArithmetic && isArithmeticOperator(name)) {
            const left = args[0];
            const right = args[1];
             switch (name) {
                case 'plus': case 'add': return this.ctx.Sum(left, right);
                case 'minus': case 'sub': return this.ctx.Sub(left, right);
                case 'times': case 'mul': return this.ctx.Product(left, right);
                case 'divide': case 'div': return this.ctx.Div(left, right);
            }
            if (name === 'mod') {
                return this.ctx.Mod(left, right);
            }
        }

        // Standard function
        if (args.length === 0) {
            return this.ctx.Const(name, this.sort);
        }

        if (!this.functions.has(name)) {
             const domain = args.map(() => this.sort);
             const decl = this.ctx.Function.declare(name, ...domain, this.sort);
             this.functions.set(name, decl);
        }

        const decl = this.functions.get(name);
        return decl.call(...args);
    }

    private translateVariable(node: ASTNode): Z3Expr {
        const name = node.name!;

        // Check if bound
        if (this.boundVars.has(name)) {
            return this.boundVars.get(name)!;
        }

        // Free variable -> Constant
        return this.translateConstant(node);
    }

    private translateConstant(node: ASTNode): Z3Expr {
        const name = node.name!;

        // Numeric constant?
        if (this.options.enableArithmetic && /^-?\d+$/.test(name)) {
            return this.ctx.Int.val(parseInt(name, 10));
        }

        if (!this.constants.has(name)) {
            const c = this.ctx.Const(name, this.sort);
            this.constants.set(name, c);
        }

        return this.constants.get(name);
    }
}
