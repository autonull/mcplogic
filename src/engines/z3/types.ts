import { Context, Solver, Bool, Arith, Expr } from 'z3-solver';

export interface Z3Context extends Context<string> {}
export interface Z3Solver extends Solver<string> {}
export interface Z3Bool extends Bool<string> {}
export interface Z3Arith extends Arith<string> {}
export interface Z3Expr extends Expr<string> {}

export type { Context, Solver, Bool, Arith, Expr };
