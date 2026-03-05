/**
 * MCP Logic Server
 * 
 * MCP server providing tools for first-order logic reasoning.
 * Includes: prove, check-well-formed, find-model, find-counterexample,
 * verify-commutativity, get-category-axioms, and session management tools.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { listResources, getResourceContent } from './resources/index.js';
import { listPrompts, getPrompt } from './prompts/index.js';

import {
    LogicException,
    createGenericError,
    serializeLogicError,
} from './types/index.js';
import * as Handlers from './handlers/index.js';
import * as LLMHandlers from './handlers/llm.js';
import * as AgentHandlers from './handlers/agent.js';
import * as EvolutionHandlers from './handlers/evolution.js';
import { TOOLS } from './tools/definitions.js';
import { createContainer, ServerContainer } from './container.js';
import {
    ProveHandlerArgs,
    CheckWellFormedHandlerArgs,
    FindModelHandlerArgs,
    FindCounterexampleHandlerArgs,
    CreateSessionHandlerArgs,
    AssertPremiseHandlerArgs,
    QuerySessionHandlerArgs,
    RetractPremiseHandlerArgs,
    ListPremisesHandlerArgs,
    ClearSessionHandlerArgs,
    DeleteSessionHandlerArgs,
    TranslateRequest,
    ReasonArgs,
    EvolutionStartArgs,
    EvolutionGenerateCasesArgs,
    VerifyCommutativityHandlerArgs,
    GetCategoryAxiomsHandlerArgs
} from './types/handlers.js';

// Define the progress notification parameters
interface ProgressParams {
    _meta?: {
        progressToken?: string | number;
    };
    [key: string]: unknown;
}

type ToolHandler = (
    args: Record<string, any>,
    container: ServerContainer,
    options?: { onProgress?: (p: number | undefined, m: string) => void }
) => Promise<unknown> | unknown;

const toolHandlers: Record<string, ToolHandler> = {
    // ==================== CORE REASONING TOOLS ====================
    'prove': (args, c, opts) =>
        Handlers.proveHandler(args as unknown as ProveHandlerArgs, c.engineManager, args.verbosity, opts?.onProgress),

    'check-well-formed': (args) =>
        Handlers.checkWellFormedHandler(args as unknown as CheckWellFormedHandlerArgs),

    'find-model': (args, c, opts) =>
        Handlers.findModelHandler(args as unknown as FindModelHandlerArgs, c.modelFinder, args.verbosity, opts?.onProgress),

    'find-counterexample': (args, c, opts) =>
        Handlers.findCounterexampleHandler(args as unknown as FindCounterexampleHandlerArgs, c.modelFinder, args.verbosity, opts?.onProgress),

    'verify-commutativity': (args, c) =>
        Handlers.verifyCommutativityHandler(args as unknown as VerifyCommutativityHandlerArgs, c.categoricalHelpers),

    'get-category-axioms': (args, c) =>
        Handlers.getCategoryAxiomsHandler(args as unknown as GetCategoryAxiomsHandlerArgs, c.categoricalHelpers),

    'translate-text': (args, c) =>
        LLMHandlers.translateTextHandler(args as unknown as TranslateRequest, c.inputRouter),

    'agent-reason': (args) =>
        AgentHandlers.reasonHandler(args as unknown as ReasonArgs),

    // ==================== EVOLUTION TOOLS ====================
    'evolution-start': (args, c) =>
        EvolutionHandlers.startEvolutionHandler(args as unknown as EvolutionStartArgs, c.optimizer, c),

    'evolution-list-strategies': (args, c) =>
        EvolutionHandlers.listStrategiesHandler(args as {}, c.strategies),

    'evolution-generate-cases': (args, c) =>
        EvolutionHandlers.generateCasesHandler(args as unknown as EvolutionGenerateCasesArgs, c.curriculumGenerator),

    // ==================== SESSION MANAGEMENT TOOLS ====================
    'create-session': (args, c) =>
        Handlers.createSessionHandler(args as unknown as CreateSessionHandlerArgs, c.sessionManager),

    'assert-premise': (args, c) =>
        Handlers.assertPremiseHandler(args as unknown as AssertPremiseHandlerArgs, c.sessionManager),

    'query-session': (args, c) =>
        Handlers.querySessionHandler(args as unknown as QuerySessionHandlerArgs, c.sessionManager, c.engineManager, args.verbosity),

    'retract-premise': (args, c) =>
        Handlers.retractPremiseHandler(args as unknown as RetractPremiseHandlerArgs, c.sessionManager),

    'list-premises': (args, c) =>
        Handlers.listPremisesHandler(args as unknown as ListPremisesHandlerArgs, c.sessionManager, args.verbosity),

    'clear-session': (args, c) =>
        Handlers.clearSessionHandler(args as unknown as ClearSessionHandlerArgs, c.sessionManager),

    'delete-session': (args, c) =>
        Handlers.deleteSessionHandler(args as unknown as DeleteSessionHandlerArgs, c.sessionManager),
};

/**
 * Create and configure the MCP server
 */
export function createServer(): Server {
    const server = new Server(
        {
            name: 'mcp-logic',
            version: '1.1.0',
        },
        {
            capabilities: {
                tools: {},
                resources: {},
                prompts: {},
            },
        }
    );

    // Initialize container (DI)
    const container = createContainer();

    // Handle list_tools request
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return { tools: TOOLS };
    });

    // ==================== MCP RESOURCES HANDLERS ====================

    // Handle list_resources request
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return {
            resources: listResources().map(r => ({
                uri: r.uri,
                name: r.name,
                description: r.description,
                mimeType: r.mimeType,
            })),
        };
    });

    // Handle read_resource request
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const { uri } = request.params;
        const content = getResourceContent(uri);

        if (content === null) {
            throw createGenericError('PARSE_ERROR', `Resource not found: ${uri}`);
        }

        return {
            contents: [
                {
                    uri,
                    mimeType: 'text/plain',
                    text: content,
                },
            ],
        };
    });

    // ==================== MCP PROMPTS HANDLERS ====================

    // Handle list_prompts request
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
        return {
            prompts: listPrompts().map(p => ({
                name: p.name,
                description: p.description,
                arguments: p.arguments,
            })),
        };
    });

    // Handle get_prompt request
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        const { name, arguments: promptArgs } = request.params;
        const result = getPrompt(name, promptArgs || {});

        if (result === null) {
            throw createGenericError('PARSE_ERROR', `Prompt not found: ${name}`);
        }

        // Return in MCP format: description + messages array
        return {
            description: result.description,
            messages: result.messages,
        };
    });

    // Handle call_tool request
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: rawArgs } = request.params;
        // Use a mutable copy of args
        const args: Record<string, unknown> = rawArgs ? { ...rawArgs } : {};

        // Ensure default verbosity
        if (!('verbosity' in args)) {
            args.verbosity = 'standard';
        }

        try {
            const handler = toolHandlers[name];
            if (!handler) {
                throw createGenericError('PARSE_ERROR', `Unknown tool: ${name}`);
            }

            // Extract progress token if present
            const paramsWithMeta = request.params as ProgressParams;
            const progressToken = paramsWithMeta._meta?.progressToken;

            const onProgress = progressToken ? (progress: number | undefined, message: string) => {
                server.notification({
                    method: 'notifications/progress',
                    params: {
                        progressToken,
                        data: {
                            progress,
                            total: 1.0,
                            message
                        }
                    }
                });
            } : undefined;

            const result = await handler(args, container, { onProgress });

            // If the handler returned a syntax error object, present it clearly
            if (result && typeof result === 'object' && 'result' in result && result.result === 'syntax_error' && 'validation' in result) {
                 const validation = (result as Record<string, any>).validation;
                 const errorMsgs = validation.formulaResults
                    ?.filter((r: Record<string, any>) => !r.valid)
                    ?.map((r: Record<string, any>) => `Formula "${r.formula}" is invalid: ${r.errors.join(', ')}`)
                    .join('\n');

                 return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                error: errorMsgs || 'Syntax Error',
                                type: 'SyntaxError',
                                details: validation
                            }, null, 2),
                        },
                    ],
                    isError: true,
                 };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        } catch (error) {
            // Handle structured LogicException
            if (error instanceof LogicException) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(serializeLogicError(error.error), null, 2),
                        },
                    ],
                    isError: true,
                };
            }

            // Handle generic errors
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: errorMessage,
                            type: error instanceof Error ? error.constructor.name : 'Error',
                        }),
                    },
                ],
                isError: true,
            };
        }
    });

    return server;
}

/**
 * Run the MCP server
 */
export async function runServer(): Promise<void> {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Keep the server running
    await new Promise(() => { });
}
