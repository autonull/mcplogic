import { ModelFinder, createModelFinder } from './model/index.js';
import { CategoricalHelpers } from './axioms/categorical.js';
import { SessionManager, createSessionManager } from './session/manager.js';
import { FileSessionStorage } from './session/file-storage.js';
import { EngineManager, createEngineManager } from './engines/manager.js';
import {
    Optimizer, Evaluator, StrategyEvolver, CurriculumGenerator,
    JsonPerformanceDatabase, InputRouter, IPerformanceDatabase
} from './evolution/index.js';
import { StandardLLMProvider } from './llm/provider.js';
import { EvolutionStrategy } from './types/evolution.js';
import { HEURISTIC_STRATEGY, LLM_STRATEGY } from './evolution/defaults.js';

export interface ServerContainer {
    modelFinder: ModelFinder;
    categoricalHelpers: CategoricalHelpers;
    sessionManager: SessionManager;
    engineManager: EngineManager;
    llmProvider: StandardLLMProvider;
    perfDb: IPerformanceDatabase;
    optimizer: Optimizer;
    inputRouter: InputRouter;
    curriculumGenerator: CurriculumGenerator;
    strategies: EvolutionStrategy[];
    defaultStrategy: EvolutionStrategy;
    evaluator: Evaluator;
    evolver: StrategyEvolver;
}

export function createContainer(): ServerContainer {
    // Initialize engines and managers
    const modelFinder = createModelFinder();
    const categoricalHelpers = new CategoricalHelpers();
    const engineManager = createEngineManager();

    // Initialize Session Persistence
    // Only use persistence if configured or default to local dir
    const sessionStorage = new FileSessionStorage();

    // Pass engineManager and storage to sessionManager
    const sessionManager = new SessionManager(engineManager, sessionStorage);

    // Initialize Evolution Engine components
    const llmProvider = new StandardLLMProvider();
    const perfDb = new JsonPerformanceDatabase();
    const evaluator = new Evaluator(perfDb, llmProvider);
    const evolver = new StrategyEvolver(llmProvider, perfDb);
    const curriculumGenerator = new CurriculumGenerator(llmProvider, perfDb, 'src/evalCases/generated');

    // Determine default strategy based on environment
    const hasLLMConfig = !!(process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL || process.env.OLLAMA_URL);

    // We start with the Heuristic strategy in the list, but we might set the default to LLM
    const initialStrategies = [HEURISTIC_STRATEGY, LLM_STRATEGY];

    // If LLM is configured, use it as default. Otherwise fallback to heuristic.
    const defaultStrategy = hasLLMConfig ? LLM_STRATEGY : HEURISTIC_STRATEGY;

    const optimizer = new Optimizer(perfDb, evolver, evaluator, {
        populationSize: 5,
        generations: 3,
        mutationRate: 0.3,
        elitismCount: 1,
        evalCasesPath: 'src/evalCases'
    });

    // Initialize Router
    const router = new InputRouter(perfDb, defaultStrategy, llmProvider);

    return {
        modelFinder,
        categoricalHelpers,
        sessionManager,
        engineManager,
        llmProvider,
        perfDb,
        optimizer,
        inputRouter: router,
        curriculumGenerator,
        strategies: initialStrategies,
        defaultStrategy,
        evaluator,
        evolver
    };
}
