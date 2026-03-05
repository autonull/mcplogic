import { spawn } from 'child_process';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

export async function createMcpClient(envOverride: Record<string, string> = {}) {
    const env = { ...process.env, ...envOverride };

    const transport = new StdioClientTransport({
        command: 'npx',
        args: ['tsx', '-e', 'import { runServer } from "./src/server.ts"; runServer();'],
        env: env as any
    });

    const client = new Client(
        { name: 'mcp-logic-client', version: '1.0.0' },
        { capabilities: {} }
    );

    await client.connect(transport);
    return { client, transport };
}

export async function translateText(client: Client, text: string, validate: boolean = true) {
    const result = await client.callTool({
        name: 'translate-text',
        arguments: { text, validate }
    });

    // Parse the result
    const content = (result as any).content[0];
    if (content.type !== 'text') {
        throw new Error('Unexpected content type from translate-text');
    }

    return JSON.parse(content.text);
}

export async function proveGoal(client: Client, premises: string[], goal: string) {
    const result = await client.callTool({
        name: 'prove',
        arguments: { premises, conclusion: goal }
    });

    const content = (result as any).content[0];
    if ((result as any).isError) {
        throw new Error(`Prover error: ${content.text}`);
    }

    return JSON.parse(content.text);
}

export async function findModel(client: Client, formulas: string[]) {
    const result = await client.callTool({
        name: 'find-model',
        arguments: { premises: formulas }
    });

    const content = (result as any).content[0];
    return JSON.parse(content.text);
}
