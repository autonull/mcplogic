import type { ASTNode, ASTNodeType } from '../types/index.js';
import type { Token, TokenType } from '../types/parser.js';
import { createParseError } from '../types/errors.js';

/**
 * Parser for FOL formulas
 *
 * Grammar (EBNF-ish):
 *   formula     = iff
 *   iff         = implies (('<->' implies)*)
 *   implies     = disjunction (('->' implies)?)
 *   disjunction = conjunction (('|' conjunction)*)
 *   conjunction = unary (('&' unary)*)
 *   unary       = '-' unary | quantified | atom
 *   quantified  = ('all' | 'exists') VARIABLE formula
 *   atom        = predicate | '(' formula ')' | term '=' term
 *   predicate   = IDENTIFIER '(' term-list ')'
 *   term        = IDENTIFIER ('(' term-list ')')? | VARIABLE
 *   term-list   = term (',' term)*
 */
export class Parser {
    private tokens: Token[];
    private originalInput: string;
    private pos: number = 0;
    private boundVariables: Set<string> = new Set();

    constructor(tokens: Token[], originalInput: string) {
        this.tokens = tokens;
        this.originalInput = originalInput;
    }

    parse(): ASTNode {
        const result = this.parseFormula();
        if (this.current().type !== 'EOF' && this.current().type !== 'DOT') {
            throw createParseError(
                `Unexpected token '${this.current().value}'`,
                this.originalInput,
                this.current().position
            );
        }
        return result;
    }

    private current(): Token {
        return this.tokens[this.pos] || { type: 'EOF', value: '', position: -1 };
    }

    private peek(offset: number = 0): Token {
        return this.tokens[this.pos + offset] || { type: 'EOF', value: '', position: -1 };
    }

    private advance(): Token {
        return this.tokens[this.pos++];
    }

    private expect(type: TokenType): Token {
        if (this.current().type !== type) {
            throw createParseError(
                `Expected ${type} but got ${this.current().type}`,
                this.originalInput,
                this.current().position
            );
        }
        return this.advance();
    }

    private parseFormula(): ASTNode {
        return this.parseIff();
    }

    private parseIff(): ASTNode {
        let left = this.parseImplies();

        while (this.current().type === 'IFF') {
            this.advance();
            const right = this.parseImplies();
            left = { type: 'iff', left, right };
        }

        return left;
    }

    private parseImplies(): ASTNode {
        let left = this.parseDisjunction();

        if (this.current().type === 'IMPLIES') {
            this.advance();
            const right = this.parseImplies(); // Right associative
            return { type: 'implies', left, right };
        }

        return left;
    }

    private parseDisjunction(): ASTNode {
        let left = this.parseConjunction();

        while (this.current().type === 'OR') {
            this.advance();
            const right = this.parseConjunction();
            left = { type: 'or', left, right };
        }

        return left;
    }

    private parseConjunction(): ASTNode {
        let left = this.parseUnary();

        while (this.current().type === 'AND') {
            this.advance();
            const right = this.parseUnary();
            left = { type: 'and', left, right };
        }

        return left;
    }

    private parseUnary(): ASTNode {
        if (this.current().type === 'NOT') {
            this.advance();
            const operand = this.parseUnary();
            return { type: 'not', operand };
        }

        return this.parseQuantified();
    }

    private parseQuantified(): ASTNode {
        if (this.current().type === 'QUANTIFIER') {
            const quantifier = this.advance().value;
            const varToken = this.expect('VARIABLE');
            const variable = varToken.value;

            this.boundVariables.add(variable);

            // Parse the body - must be in parentheses after quantifier
            const body = this.parseUnary();

            return {
                type: quantifier === 'all' ? 'forall' : 'exists',
                variable,
                body
            };
        }

        return this.parseAtom();
    }

    private parseAtom(): ASTNode {
        // Parenthesized formula
        if (this.current().type === 'LPAREN') {
            this.advance();
            const formula = this.parseFormula();
            this.expect('RPAREN');
            return formula;
        }

        // It could be a relation between terms: term OP term (e.g. x = y, 2 + 2 = 4)
        // Or it could be a predicate: P(x)
        // Since terms can start with variables/constants/numbers, we parse a term first.
        const leftTerm = this.parseTermExpr();

        // If the next token is a relation operator (=, !=, <, >, <=, >=)
        const type = this.current().type;
        if (type === 'EQUALS' || type === 'NOT_EQUALS' || type === 'LT' || type === 'GT' || type === 'LTE' || type === 'GTE') {
            this.advance();
            const rightTerm = this.parseTermExpr();
            let relationNode: ASTNode;

            if (type === 'EQUALS') {
                relationNode = { type: 'equals', left: leftTerm, right: rightTerm };
            } else {
                const opMap: Record<string, string> = {
                    'NOT_EQUALS': '!=',
                    'LT': '<',
                    'GT': '>',
                    'LTE': '<=',
                    'GTE': '>='
                };
                relationNode = {
                    type: 'predicate',
                    name: opMap[type],
                    args: [leftTerm, rightTerm]
                };
            }
            return relationNode;
        }

        // If it's not a relation, it must be a predicate.
        // A predicate in AST is represented as { type: 'predicate', name, args }.
        // If leftTerm is a variable or constant, it's a 0-ary predicate.
        // If leftTerm is a function, it's an n-ary predicate.
        if (leftTerm.type === 'variable' || leftTerm.type === 'constant') {
             return { type: 'predicate', name: leftTerm.name, args: [] };
        } else if (leftTerm.type === 'function') {
             return { type: 'predicate', name: leftTerm.name, args: leftTerm.args };
        }

        throw createParseError(
            `Expected predicate or relation but got term type ${leftTerm.type}`,
            this.originalInput,
            this.current().position
        );
    }

    private parseTermList(): ASTNode[] {
        const terms: ASTNode[] = [];

        if (this.current().type !== 'RPAREN') {
            terms.push(this.parseTermExpr());

            while (this.current().type === 'COMMA') {
                this.advance();
                terms.push(this.parseTermExpr());
            }
        }

        return terms;
    }

    private parseTermExpr(): ASTNode {
        let left = this.parseFactor();

        while (this.current().type === 'PLUS' || this.current().type === 'MINUS') {
            const op = this.advance().type;
            const right = this.parseFactor();
            left = {
                type: 'function',
                name: op === 'PLUS' ? '+' : '-',
                args: [left, right]
            };
        }

        return left;
    }

    private parseFactor(): ASTNode {
        let left = this.parseTerm();

        while (this.current().type === 'MULTIPLY' || this.current().type === 'DIVIDE') {
            const op = this.advance().type;
            const right = this.parseTerm();
            left = {
                type: 'function',
                name: op === 'MULTIPLY' ? '*' : '/',
                args: [left, right]
            };
        }

        return left;
    }

    private parseTerm(): ASTNode {
        // Unary minus
        if (this.current().type === 'MINUS') {
             this.advance();
             const arg = this.parseTerm();
             return { type: 'function', name: 'unary_minus', args: [arg] };
        }

        if (this.current().type === 'LPAREN') {
             this.advance();
             const expr = this.parseTermExpr();
             this.expect('RPAREN');
             return expr;
        }

        if (this.current().type !== 'VARIABLE') {
            throw createParseError(
                `Expected term but got ${this.current().type} '${this.current().value}'`,
                this.originalInput,
                this.current().position
            );
        }

        const name = this.advance().value;

        // Function application
        if (this.current().type === 'LPAREN') {
            this.advance();
            const args = this.parseTermList();
            this.expect('RPAREN');
            return { type: 'function', name, args };
        }

        return this.classifyTerm(name);
    }

    private classifyTerm(name: string): ASTNode {
        // 1. If it's a bound variable, return variable
        if (this.boundVariables.has(name)) {
            return { type: 'variable', name };
        }

        // 2. Convention: Single lowercase letters (x, y, z, a, b...) are treated as free variables
        // This follows Prover9/Mace4 convention where free variables are implicitly universal
        if (name.length === 1 && /[a-z]/.test(name)) {
            return { type: 'variable', name };
        }

        // 3. Otherwise it's a constant (e.g., "socrates", "zero", "sk0")
        return { type: 'constant', name };
    }
}
