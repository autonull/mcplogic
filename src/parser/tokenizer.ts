import type { Token, TokenType } from '../types/parser.js';
import { createParseError } from '../types/errors.js';

/**
 * Tokenizer for FOL formulas
 */
export class Tokenizer {
    private input: string;
    private pos: number = 0;
    private tokens: Token[] = [];

    constructor(input: string) {
        this.input = input;
    }

    tokenize(): Token[] {
        while (this.pos < this.input.length) {
            this.skipWhitespace();
            if (this.pos >= this.input.length) break;

            const char = this.input[this.pos];

            // Multi-character operators
            if (this.input.slice(this.pos, this.pos + 3) === '<->') {
                this.addToken('IFF', '<->', this.pos);
                this.pos += 3;
                continue;
            }
            if (this.input.slice(this.pos, this.pos + 2) === '->') {
                this.addToken('IMPLIES', '->', this.pos);
                this.pos += 2;
                continue;
            }
            if (this.input.slice(this.pos, this.pos + 2) === '!=') {
                this.addToken('NOT_EQUALS', '!=', this.pos);
                this.pos += 2;
                continue;
            }
            if (this.input.slice(this.pos, this.pos + 2) === '<=') {
                this.addToken('LTE', '<=', this.pos);
                this.pos += 2;
                continue;
            }
            if (this.input.slice(this.pos, this.pos + 2) === '>=') {
                this.addToken('GTE', '>=', this.pos);
                this.pos += 2;
                continue;
            }

            // Single character tokens
            switch (char) {
                case '(':
                    this.addToken('LPAREN', '(', this.pos);
                    this.pos++;
                    continue;
                case ')':
                    this.addToken('RPAREN', ')', this.pos);
                    this.pos++;
                    continue;
                case '&':
                    this.addToken('AND', '&', this.pos);
                    this.pos++;
                    continue;
                case '|':
                    this.addToken('OR', '|', this.pos);
                    this.pos++;
                    continue;
                case '-':
                    // Distinguish between NOT (usually prefixing a predicate/quantifier) and MINUS (arithmetic)
                    // Simple heuristic: if the previous token was a variable/constant/RPAREN, it's a MINUS
                    if (this.tokens.length > 0) {
                        const lastType = this.tokens[this.tokens.length - 1].type;
                        if (lastType === 'VARIABLE' || lastType === 'CONSTANT' || lastType === 'RPAREN') {
                            this.addToken('MINUS', '-', this.pos);
                            this.pos++;
                            continue;
                        }
                    }
                    this.addToken('NOT', '-', this.pos);
                    this.pos++;
                    continue;
                case '=':
                    this.addToken('EQUALS', '=', this.pos);
                    this.pos++;
                    continue;
                case '<':
                    this.addToken('LT', '<', this.pos);
                    this.pos++;
                    continue;
                case '>':
                    this.addToken('GT', '>', this.pos);
                    this.pos++;
                    continue;
                case '+':
                    this.addToken('PLUS', '+', this.pos);
                    this.pos++;
                    continue;
                case '*':
                    this.addToken('MULTIPLY', '*', this.pos);
                    this.pos++;
                    continue;
                case '/':
                    this.addToken('DIVIDE', '/', this.pos);
                    this.pos++;
                    continue;
                case ',':
                    this.addToken('COMMA', ',', this.pos);
                    this.pos++;
                    continue;
                case '.':
                    this.addToken('DOT', '.', this.pos);
                    this.pos++;
                    continue;
            }

            // Identifiers (predicates, variables, quantifiers, constants) and Numbers
            if (/[a-zA-Z0-9_]/.test(char)) {
                const start = this.pos;
                while (this.pos < this.input.length && /[a-zA-Z0-9_]/.test(this.input[this.pos])) {
                    this.pos++;
                }
                const value = this.input.slice(start, this.pos);

                // Check for quantifiers
                if (value === 'all' || value === 'exists') {
                    this.tokens.push({ type: 'QUANTIFIER', value, position: start });
                } else {
                    // Will be classified as PREDICATE, VARIABLE, or CONSTANT during parsing
                    this.tokens.push({ type: 'VARIABLE', value, position: start });
                }
                continue;
            }

            throw createParseError(`Unexpected character '${char}'`, this.input, this.pos);
        }

        this.tokens.push({ type: 'EOF', value: '', position: this.pos });
        return this.tokens;
    }

    private skipWhitespace(): void {
        while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
            this.pos++;
        }
    }

    private addToken(type: TokenType, value: string, position: number): void {
        this.tokens.push({ type, value, position });
    }
}
