/**
 * Parser Types
 */

export type TokenType =
    | 'QUANTIFIER'    // all, exists
    | 'VARIABLE'      // x, y, z (lowercase starting)
    | 'CONSTANT'      // socrates, a, b (lowercase in predicate args)
    | 'PREDICATE'     // man, mortal (lowercase with parens)
    | 'FUNCTION'      // f, g (lowercase with parens, nested in predicate)
    | 'IMPLIES'       // ->
    | 'IFF'           // <->
    | 'AND'           // &
    | 'OR'            // |
    | 'NOT'           // -
    | 'EQUALS'        // =
    | 'NOT_EQUALS'    // !=
    | 'LT'            // <
    | 'GT'            // >
    | 'LTE'           // <=
    | 'GTE'           // >=
    | 'PLUS'          // +
    | 'MINUS'         // -
    | 'MULTIPLY'      // *
    | 'DIVIDE'        // /
    | 'LPAREN'        // (
    | 'RPAREN'        // )
    | 'COMMA'         // ,
    | 'DOT'           // .
    | 'EOF';

export interface Token {
    type: TokenType;
    value: string;
    position: number;
}
