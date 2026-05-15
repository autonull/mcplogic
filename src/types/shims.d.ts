declare module 'clingo-wasm';

declare module 'z3-solver' {
  export function init(...args: any[]): Promise<any>;
  export type Context<T = any> = any;
  export type Solver<T = any> = any;
  export type Bool<T = any> = any;
  export type Arith<T = any> = any;
  export type Expr<T = any> = any;
  export type Sort = any;
  export default any;
}
