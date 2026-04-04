/**
 * Structured Error System for MCPLogic
 * 
 * Provides machine-readable errors with codes, spans, and suggestions.
 */

/**
 * Error codes for logic operations
 */
export type LogicErrorCode =
  | 'PARSE_ERROR'           // Syntax errors in formula
  | 'INFERENCE_LIMIT'       // Hit max inference steps
  | 'UNSATISFIABLE'         // Contradiction detected
  | 'TIMEOUT'               // Operation exceeded time limit
  | 'NO_MODEL'              // Model finder exhausted search
  | 'INVALID_DOMAIN'        // Model finder domain constraint
  | 'SESSION_NOT_FOUND'     // Session ID not found
  | 'SESSION_LIMIT'         // Max sessions reached
  | 'ENGINE_ERROR'          // Internal Prolog error
  | 'CLAUSIFICATION_ERROR'  // Error during CNF conversion
  | 'CLAUSIFICATION_BLOWUP' // CNF blowup exceeded limits
  | 'INVALID_PREDICATE'     // Predicate not allowed by ontology
  | 'MATH_ERROR';           // Math utility errors

/**
 * Source location span for error reporting
 */
export interface ErrorSpan {
  start: number;
  end: number;
  line?: number;
  col?: number;
}

/**
 * Structured error with code, message, span, and suggestions
 */
export interface LogicError {
  code: LogicErrorCode;
  message: string;
  span?: ErrorSpan;
  suggestion?: string;
  context?: string;          // The problematic formula/term
  details?: Record<string, unknown>;
}

/**
 * Exception class wrapping LogicError for throw/catch patterns
 */
export class LogicException extends Error {
  public readonly error: LogicError;

  constructor(error: LogicError) {
    super(error.message);
    this.name = 'LogicException';
    this.error = error;

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LogicException);
    }
  }

  /**
   * Serialize error for MCP response
   */
  toJSON(): LogicError {
    return this.error;
  }
}

/**
 * Documentation link for syntax help
 */
export const SYNTAX_DOCS_URL = 'https://github.com/anomalyco/mcplogic#syntax-reference';

/**
 * Common syntax error patterns and their suggestions
 */
const SYNTAX_SUGGESTIONS: Array<{
  pattern: RegExp;
  suggestion: string;
  example?: string;
}> = [
  {
    pattern: /\([^)]*$/,
    suggestion: "Unbalanced parentheses - missing closing ')'",
    example: "P(x, y"
  },
  {
    pattern: /^[^(]*\)/,
    suggestion: "Unbalanced parentheses - missing opening '('",
    example: "x, y)"
  },
  {
    pattern: /\bAll\b/,
    suggestion: "Use lowercase 'all' for universal quantifier",
    example: "All x (man(x) -> mortal(x))"
  },
  {
    pattern: /\bExists\b/,
    suggestion: "Use lowercase 'exists' for existential quantifier",
    example: "exists x (king(x))"
  },
  {
    pattern: /->\s*$/,
    suggestion: "Incomplete implication - missing consequent after '->'",
    example: "man(socrates) ->"
  },
  {
    pattern: /<->\s*$/,
    suggestion: "Incomplete biconditional - missing right side after '<->'",
    example: "P(x) <->"
  },
  {
    pattern: /&\s*$/,
    suggestion: "Incomplete conjunction - missing right operand after '&'",
    example: "P(x) &"
  },
  {
    pattern: /\|\s*$/,
    suggestion: "Incomplete disjunction - missing right operand after '|'",
    example: "P(x) |"
  },
  {
    pattern: /^\s*-\s*$/,
    suggestion: "Incomplete negation - missing operand after '-'",
    example: "-"
  },
  {
    pattern: /\ball\s+[A-Z]/,
    suggestion: "Quantified variables should be lowercase",
    example: "all X (P(X)) -> all x (P(x))"
  },
  {
    pattern: /\bexists\s+[A-Z]/,
    suggestion: "Quantified variables should be lowercase",
    example: "exists X (P(X)) -> exists x (P(x))"
  },
  {
    pattern: /[a-z]+\s*\(\s*\)/,
    suggestion: "Predicate has empty argument list",
    example: "P() -> P(x)"
  },
  {
    pattern: /,,/,
    suggestion: "Double comma in argument list",
    example: "P(x,,y) -> P(x, y)"
  },
  {
    pattern: /\b[Nn]ot\b/,
    suggestion: "Use '-' for negation, not 'not' or 'Not'",
    example: "not P(x) -> -P(x)"
  },
  {
    pattern: /\b[A-Z][a-z]/,
    suggestion: "Predicates should be lowercase, constants uppercase",
    example: "Man(socrates) -> man(socrates)"
  },
  {
    pattern: /=\s*[^=]/,
    suggestion: "Use '=' for equality, '==' is not supported",
    example: "x == y -> x = y"
  },
];

/**
 * Get a suggestion for a syntax error based on the input
 */
export function getSuggestion(input: string, _position?: number): string | undefined {
  for (const { pattern, suggestion } of SYNTAX_SUGGESTIONS) {
    if (pattern.test(input)) {
      return suggestion;
    }
  }
  return undefined;
}

/**
 * Create a parse error with optional span and suggestion
 */
export function createParseError(
  message: string,
  input: string,
  position?: number
): LogicException {
  const span = position !== undefined ? {
    start: position,
    end: position + 1,
    line: getLineNumber(input, position),
    col: getColumnNumber(input, position),
  } : undefined;

  return new LogicException({
    code: 'PARSE_ERROR',
    message,
    span,
    suggestion: getSuggestion(input, position),
    context: input,
  });
}

/**
 * Create an inference limit error
 */
export function createInferenceLimitError(
  limit: number,
  context?: string
): LogicException {
  return new LogicException({
    code: 'INFERENCE_LIMIT',
    message: `Inference limit of ${limit} steps exceeded`,
    suggestion: 'Try increasing the inference_limit parameter for complex proofs',
    context,
    details: { limit },
  });
}

/**
 * Create a no model error
 */
export function createNoModelError(
  maxDomainSize: number,
  searchedSizes: number[]
): LogicException {
  return new LogicException({
    code: 'NO_MODEL',
    message: `No model found in domains up to size ${maxDomainSize}`,
    suggestion: 'The premises may be unsatisfiable, or try a larger domain size',
    details: { maxDomainSize, searchedSizes },
  });
}

/**
 * Create a session not found error
 */
export function createSessionNotFoundError(sessionId: string): LogicException {
  return new LogicException({
    code: 'SESSION_NOT_FOUND',
    message: `Session '${sessionId}' not found or expired`,
    suggestion: 'Create a new session with create-session tool',
    details: { sessionId },
  });
}

/**
 * Create a session limit error
 */
export function createSessionLimitError(maxSessions: number): LogicException {
  return new LogicException({
    code: 'SESSION_LIMIT',
    message: `Maximum session limit of ${maxSessions} reached`,
    suggestion: 'Delete unused sessions or wait for sessions to expire',
    details: { maxSessions },
  });
}

/**
 * Create an engine error
 */
export function createEngineError(
  message: string,
  details?: Record<string, unknown>
): LogicException {
  return new LogicException({
    code: 'ENGINE_ERROR',
    message: `Engine error: ${message}`,
    details,
  });
}

/**
 * Create an unsatisfiable error
 */
export function createUnsatisfiableError(
  message: string = 'The premises are unsatisfiable'
): LogicException {
  return new LogicException({
    code: 'UNSATISFIABLE',
    message,
    suggestion: 'Check for contradictory premises',
  });
}

/**
 * Create a timeout error
 */
export function createTimeoutError(
  limitMs: number,
  operation: string = 'Operation'
): LogicException {
  return new LogicException({
    code: 'TIMEOUT',
    message: `${operation} timed out after ${limitMs}ms`,
    suggestion: 'Try simplifying the problem or increasing the timeout',
    details: { limitMs },
  });
}

/**
 * Create an invalid domain error
 */
export function createInvalidDomainError(
  message: string
): LogicException {
  return new LogicException({
    code: 'INVALID_DOMAIN',
    message,
    suggestion: 'Ensure domain size is positive and within limits',
  });
}

/**
 * Create a clausification error
 */
export function createClausificationError(
  message: string,
  details?: Record<string, unknown>
): LogicException {
  return new LogicException({
    code: 'CLAUSIFICATION_ERROR',
    message: `Clausification failed: ${message}`,
    details,
  });
}

/**
 * Get line number from position in string
 */
function getLineNumber(input: string, position: number): number {
  const lines = input.substring(0, position).split('\n');
  return lines.length;
}

/**
 * Get column number from position in string
 */
function getColumnNumber(input: string, position: number): number {
  const lastNewline = input.lastIndexOf('\n', position - 1);
  return position - lastNewline;
}

/**
 * Serialize a LogicError for JSON output (handles Map/Set if present)
 */
export function serializeLogicError(error: LogicError): object {
  return {
    code: error.code,
    message: error.message,
    ...(error.span && { span: error.span }),
    ...(error.suggestion && { suggestion: error.suggestion }),
    ...(error.context && { context: error.context }),
    ...(error.details && { details: error.details }),
  };
}

/**
 * Generic error factory for simple error creation
 */
export function createError(
  code: LogicErrorCode,
  message: string,
  details?: Record<string, unknown>
): LogicError {
  return {
    code,
    message,
    details,
  };
}

/**
 * Create a generic logic error exception.
 * Use this when no specific factory is available.
 */
export function createGenericError(
  code: LogicErrorCode,
  message: string,
  details?: Record<string, unknown>
): LogicException {
  return new LogicException({
    code,
    message,
    details,
  });
}

export function enhanceError(error: LogicError | LogicException): string {
  const err = error instanceof LogicException ? error.error : error;
  let result = `\x1b[31m${err.code}: ${err.message}\x1b[0m`;
  
  if (err.span) {
    result += `\nPosition: line ${err.span.line}, col ${err.span.col}`;
  }
  
  if (err.context) {
    result += `\nFormula: ${err.context}`;
  }
  
  if (err.suggestion) {
    const matched = SYNTAX_SUGGESTIONS.find(s => 
      err.context && s.pattern.test(err.context)
    );
    result += `\n\nTip: ${err.suggestion}`;
    if (matched?.example) {
      result += `\nExample: "${matched.example}"`;
    }
  }
  
  result += `\n\nSyntax Reference: ${SYNTAX_DOCS_URL}`;
  
  if (err.details && Object.keys(err.details).length > 0) {
    result += `\n\nDetails: ${JSON.stringify(err.details)}`;
  }
  
  return result;
}
