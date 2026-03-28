import { Context, Solver, Bool, Int, Expr } from 'z3-solver';

export interface Z3Context extends Context<string> {}
export interface Z3Solver extends Solver<string> {}
export interface Z3Bool extends Bool<string> {}
export interface Z3Int extends Int<string> {}
export interface Z3Expr extends Expr<string> {}

export { Context, Solver, Bool, Int, Expr };
