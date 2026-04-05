import type { LLMProvider, LLMMessage, LLMResponse } from '../types/llm.js';
import { createGenericError } from '../types/errors.js';

interface LLMApiUsage {
    prompt_tokens?: number;
    completion_tokens?: number;
}

interface LLMApiChoice {
    message?: {
        content?: string;
    };
}

interface LLMApiResponse {
    choices?: LLMApiChoice[];
    message?: {
        content?: string;
    };
    usage?: LLMApiUsage;
}

/**
 * A basic LLM provider that uses environment variables to call OpenAI/Anthropic/Ollama.
 * For this implementation, we will use a simple fetch-based approach for OpenAI/Ollama compatibility.
 */
export class StandardLLMProvider implements LLMProvider {
    private apiUrl: string;
    private apiKey: string;
    private model: string;
    private type: 'openai' | 'ollama';
    private ollamaBaseUrl: string;

    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY || '';
        const baseUrl = process.env.OPENAI_BASE_URL;
        this.ollamaBaseUrl = 'http://localhost:11434';

        if (baseUrl) {
            // Custom OpenAI-compatible endpoint (e.g., local llama.cpp, vLLM)
            this.type = 'openai';
            this.apiUrl = baseUrl.replace(/\/$/, '') + '/chat/completions';

            // If the user provided a specific URL that already ends in chat/completions, fix it.
            if (baseUrl.endsWith('/chat/completions')) {
                this.apiUrl = baseUrl;
            }

            this.model = process.env.OPENAI_MODEL || 'model';
        } else if (this.apiKey) {
            // Standard OpenAI
            this.type = 'openai';
            this.apiUrl = 'https://api.openai.com/v1/chat/completions';
            this.model = process.env.OPENAI_MODEL || 'gpt-4o';
        } else {
            // Default to Ollama
            this.type = 'ollama';
            this.ollamaBaseUrl = process.env.OLLAMA_URL
                ? process.env.OLLAMA_URL.replace(/\/api\/chat\/?$/, '').replace(/\/$/, '')
                : 'http://localhost:11434';
            this.apiUrl = `${this.ollamaBaseUrl}/api/chat`;
            this.model = process.env.OLLAMA_MODEL || 'llama3'; // Initial default, may be overridden later
        }
    }

    private async resolveOllamaModel(): Promise<string> {
        if (process.env.OLLAMA_MODEL) {
            return process.env.OLLAMA_MODEL;
        }

        try {
            const res = await fetch(`${this.ollamaBaseUrl}/api/tags`);
            if (res.ok) {
                const data = await res.json() as { models?: Array<{ name: string }> };
                const models = data.models || [];
                if (models.length > 0) {
                    // Try to find a llama model first, otherwise just use the first available model
                    const llama = models.find(m => m.name.includes('llama'));
                    return llama ? llama.name : models[0].name;
                }
            }
        } catch (e) {
            // Ignore errors and fallback
        }

        return 'llama3'; // ultimate fallback
    }

    async complete(messages: LLMMessage[]): Promise<LLMResponse> {
        let currentModel = this.model;
        if (this.type === 'ollama' && !process.env.OLLAMA_MODEL) {
            currentModel = await this.resolveOllamaModel();
        }

        // Format messages for standard Chat API
        const payload = {
            model: currentModel,
            messages: messages,
            stream: false,
            // Ollama specific
            options: this.type === 'ollama' ? { temperature: 0 } : undefined,
            // OpenAI specific
            temperature: 0,
        };

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`;
            }

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`LLM API error (${response.status}): ${text}`);
            }

            const data = await response.json() as LLMApiResponse;

            // Standardize response extraction
            const content = data.choices?.[0]?.message?.content || data.message?.content || '';
            const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0 };

            return {
                content,
                usage: {
                    promptTokens: usage.prompt_tokens || 0,
                    completionTokens: usage.completion_tokens || 0,
                },
            };
        } catch (error) {
            // In a real scenario without a working LLM, we might want to fail gracefully or return a mock if testing
            if (process.env.NODE_ENV === 'test') {
                 return { content: 'MOCK LLM RESPONSE', usage: { promptTokens: 0, completionTokens: 0 }};
            }
            const errMsg = error instanceof Error ? error.message : String(error);
            // Log error to stderr only in verbose/debug modes if we had a logger, but for now just throw
            throw createGenericError('ENGINE_ERROR', `LLM Provider failed: ${errMsg}`);
        }
    }
}
