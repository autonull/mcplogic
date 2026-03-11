/**
 * MCP Logic - Library Entry Point
 *
 * Exports the core functionality of the library for use in other projects.
 * This file should NOT import @modelcontextprotocol/sdk or any other
 * server-specific dependencies.
 */

// Core Engine (Prolog)
export { createLogicEngine, LogicEngine } from './engines/prolog/engine.js';

// Engine Manager (Federation)
export { createEngineManager, EngineManager } from './engines/manager.js';

// Engines
export { Z3Engine } from './engines/z3/index.js';
export { ClingoEngine } from './engines/clingo/index.js';
export { createSATEngine, SATEngine } from './engines/sat/index.js';
export { createPrologEngine, PrologEngine } from './engines/prolog/index.js';

// Model Finder
export { createModelFinder, ModelFinder } from './model/index.js';

// Evolution Engine
export { CurriculumGenerator } from './evolution/curriculumGenerator.js';
export { Evaluator } from './evolution/evaluator.js';
export { StrategyEvolver } from './evolution/strategyEvolver.js';
export { InputRouter } from './evolution/inputRouter.js';

// Parser
export { parse } from './parser/index.js';

// Types and Interfaces
export * from './types/index.js';

// Constants
export { DEFAULTS } from './types/options.js';

// Axioms
export * from './axioms/index.js';
