#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { createEngineManager, EngineSelection } from './engines/manager.js';
import { createModelFinder } from './model/index.js';
import { parse } from './parser/index.js';
import { DEFAULTS } from './types/index.js';
import { ReasoningAgent } from './agent/core.js';

const VERSION = '1.1.1';
const HELP = `
MCP Logic CLI v${VERSION}

Usage:
  mcplogic prove <file.p>     Prove last line from preceding premises
  mcplogic model <file.p>     Find model satisfying all lines
  mcplogic validate <file.p>  Check syntax of all lines
  mcplogic check              Verify engine availability
  mcplogic benchmark [dir]    Run TPTP benchmarks (default: benchmarks/tptp)
  mcplogic repl               Interactive mode

Options:
  --engine=<name>    Select reasoning engine (auto, prolog, sat, z3, clingo, race)
  --high-power, -H   Enable extended limits (300s, 100k inferences)
  --help, -h         Show this help
  --version, -v      Show version

Examples:
  mcplogic prove --engine=z3 problem.p
  mcplogic model --high-power theory.p
  mcplogic repl
`;

const args = process.argv.slice(2);
const highPower = args.includes('--high-power') || args.includes('-H');

let engine: string | undefined;
const cleanArgs: string[] = [];

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--engine=')) {
        engine = arg.split('=')[1];
    } else if (arg === '--engine') {
        if (i + 1 < args.length) {
            engine = args[i + 1];
            i++;
        }
    } else if (!arg.startsWith('-')) {
        cleanArgs.push(arg);
    }
}

const VALID_ENGINES = ['auto', 'prolog', 'sat', 'z3', 'clingo', 'race'];
if (engine && !VALID_ENGINES.includes(engine)) {
    console.error(`Error: Invalid engine '${engine}'. Valid options are: ${VALID_ENGINES.join(', ')}`);
    process.exit(1);
}

const commandName = cleanArgs[0];
const fileName = cleanArgs[1];

async function main() {
    if (args.includes('--help') || args.includes('-h') || !commandName) {
        console.log(HELP);
        return;
    }

    if (args.includes('--version') || args.includes('-v')) {
        console.log(VERSION);
        return;
    }

    if (commandName === 'repl') {
        return runRepl(highPower);
    }

    if (commandName === 'check') {
        return runCheck();
    }

    if (commandName === 'benchmark') {
        return handleBenchmark(fileName);
    }

    // Commands that require a file or special handling
    const limit = highPower ? DEFAULTS.highPowerMaxInferences : DEFAULTS.maxInferences;
    const timeout = highPower ? DEFAULTS.highPowerMaxSeconds * 1000 : DEFAULTS.maxSeconds * 1000;

    switch (commandName) {
        case 'prove':
            return handleProve(fileName, timeout, limit);
        case 'model':
            return handleModel(fileName, timeout, limit, highPower);
        case 'validate':
            return handleValidate(fileName);
        default:
            console.error(`Unknown command: ${commandName}`);
            console.log(HELP);
            process.exit(1);
    }
}

function readInputFile(file?: string): string[] {
    if (!file) {
        console.error('Error: file argument required');
        process.exit(1);
    }
    const content = readFileSync(file, 'utf-8');
    return content.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#') && !l.startsWith('%'));
}

async function handleProve(file: string | undefined, timeout: number, limit: number) {
    const lines = readInputFile(file);
    const premises = lines.slice(0, -1);
    const conclusion = lines[lines.length - 1];
    console.log(`Proving: ${conclusion}`);
    console.log(`From ${premises.length} premises...`);
    if (engine) console.log(`Engine: ${engine}`);

    const engineManager = createEngineManager(timeout, limit);
    const start = Date.now();
    const result = await engineManager.prove(premises, conclusion, {
        engine: engine as EngineSelection,
        includeTrace: true,
        maxSeconds: timeout / 1000,
        maxInferences: limit
    });
    const elapsed = Date.now() - start;

    console.log(result.success ? '✓ PROVED' : '✗ NOT PROVED');
    console.log(`Engine: ${result.engineUsed || 'unknown'}`);
    console.log(`Time: ${elapsed}ms`);
    if (result.inferenceSteps) console.log('\nTrace:\n' + result.inferenceSteps.join('\n'));
    process.exit(result.success ? 0 : 1);
}

async function handleModel(file: string | undefined, timeout: number, limit: number, highPower: boolean) {
    const lines = readInputFile(file);
    console.log(`Finding model for ${lines.length} formulas...`);
    const finder = createModelFinder(timeout, highPower ? 25 : 10);
    const start = Date.now();
    const result = await finder.findModel(lines);
    const elapsed = Date.now() - start;

    console.log(result.success ? '✓ MODEL FOUND' : '✗ NO MODEL');
    console.log(`Time: ${elapsed}ms`);
    if (result.model) console.log('\n' + JSON.stringify(result.model, null, 2));
    process.exit(result.success ? 0 : 1);
}

function handleValidate(file: string | undefined) {
    const lines = readInputFile(file);
    let allValid = true;
    for (const stmt of lines) {
        try {
            parse(stmt);
            console.log(`✓ ${stmt}`);
        } catch (e) {
            console.log(`✗ ${stmt}`);
            console.log(`  Error: ${(e as Error).message}`);
            allValid = false;
        }
    }
    process.exit(allValid ? 0 : 1);
}

async function handleBenchmark(dir?: string) {
    const targetDir = dir || path.join(process.cwd(), 'benchmarks', 'tptp');
    if (!existsSync(targetDir)) {
        console.error(`Benchmark directory ${targetDir} not found.`);
        console.error('If running from source, try "npm run benchmark:setup".');
        console.error('Otherwise, provide a path to a directory containing .p files.');
        process.exit(1);
    }

    const files = readdirSync(targetDir).filter(f => f.endsWith('.p'));
    const manager = createEngineManager();

    console.log(`Running ${files.length} benchmarks from ${targetDir}...`);

    let passed = 0;
    let failed = 0;

    for (const file of files) {
        const content = readFileSync(path.join(targetDir, file), 'utf-8');
        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('%'));
        const premises = lines.slice(0, -1);
        const conclusion = lines[lines.length - 1];

        process.stdout.write(`Benchmarking ${file}... `);
        const start = Date.now();
        try {
            // Using a shorter timeout for quick benchmarks via CLI
            const result = await manager.prove(premises, conclusion, {
                engine: 'auto',
                maxSeconds: 10
            });
            const time = Date.now() - start;
            if (result.success) {
                console.log(`PASS (${time}ms) [${result.engineUsed}]`);
                passed++;
            } else {
                console.log(`FAIL (${time}ms) [${result.engineUsed}]`);
                failed++;
            }
        } catch (e) {
            console.log(`ERROR (${(e as Error).message})`);
            failed++;
        }
    }

    await manager.close();
    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    process.exit(failed > 0 ? 1 : 0);
}

async function runCheck() {
    console.log(`MCP Logic v${VERSION} - System Check\n`);
    const manager = createEngineManager();
    const engines = manager.getEngines();

    console.log(`Detected ${engines.length} engine configurations:`);
    for (const e of engines) {
        process.stdout.write(`- ${e.name.padEnd(20)} ... `);
        try {
            const engine = await manager.getEngine(e.name);
            // Run a trivial proof
            const res = await engine.prove(['p'], 'p');
            if (res.result === 'proved') {
                console.log('OK ✓');
            } else {
                console.log(`FAIL ✗ (Unexpected result: ${res.result})`);
            }
        } catch (err) {
            console.log(`FAIL ✗ (${(err as Error).message})`);
        }
    }
    await manager.close();
}

async function runRepl(highPower: boolean) {
    const timeout = highPower ? 300000 : 30000;
    // Use ReasoningAgent instead of raw EngineManager
    const agent = new ReasoningAgent({ timeout, verbose: true });

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'mcplogic> '
    });

    console.log(`MCP Logic REPL v${VERSION}${highPower ? ' [HIGH-POWER]' : ''}`);
    console.log('Commands: .assert <formula>, .prove <goal>, .list, .clear, .quit, .help\n');
    rl.prompt();

    rl.on('line', async (line) => {
        const trimmed = line.trim();

        if (trimmed === '.help') {
            console.log('Commands:');
            console.log('  .assert <formula>   Add a premise to the session');
            console.log('  .tell <text>        Translate natural language and assert');
            console.log('  .prove <goal>       Try to prove goal from premises');
            console.log('  .list               List current premises');
            console.log('  .clear              Clear all premises');
            console.log('  .quit, .exit, .q    Exit REPL');
            console.log('  .help               Show this help');
        } else if (trimmed.startsWith('.tell ')) {
            const text = trimmed.slice(6).trim();
            try {
                const formulas = await agent.translate(text);
                for (const f of formulas) {
                    agent.assert(f);
                    console.log(`✓ Asserted: ${f}`);
                }
                console.log(`(${agent.getPremises().length} total premises)`);
            } catch (e) {
                console.log(`✗ Translation error: ${(e as Error).message}`);
            }
        } else if (trimmed.startsWith('.assert ')) {
            const formula = trimmed.slice(8).trim();
            try {
                agent.assert(formula);
                console.log(`✓ Asserted (${agent.getPremises().length} total)`);
            } catch (e) {
                console.log(`✗ ${(e as Error).message}`);
            }
        } else if (trimmed.startsWith('.prove ')) {
            const goal = trimmed.slice(7).trim();
            try {
                console.log(`Reasoning...`);
                const result = await agent.prove(goal);

                if (result.answer === 'True') {
                    console.log('✓ Proved (TRUE)');
                } else if (result.answer === 'False') {
                    console.log('✗ Disproved (FALSE) - Counterexample found');
                } else {
                    console.log('? Unknown (Cannot prove or disprove)');
                }

                // Show trace/explanation if available
                if (result.steps.length > 0) {
                    console.log('\nSteps:');
                    result.steps.forEach(s => {
                        console.log(`- [${s.action.type}] ${s.action.content} -> ${s.action.explanation || ''}`);
                    });
                }
            } catch (e) {
                console.log(`✗ ${(e as Error).message}`);
            }
        } else if (trimmed === '.list') {
            const premises = agent.getPremises();
            if (premises.length === 0) {
                console.log('(no premises)');
            } else {
                premises.forEach((p, i) => console.log(`${i + 1}. ${p}`));
            }
        } else if (trimmed === '.clear') {
            agent.clear();
            console.log('Cleared.');
        } else if (trimmed === '.quit' || trimmed === '.exit' || trimmed === '.q') {
            rl.close();
            return;
        } else if (trimmed && !trimmed.startsWith('.')) {
            console.log('Unknown command. Use .assert, .prove, .list, .clear, or .quit');
        }
        rl.prompt();
    });

    rl.on('close', () => process.exit(0));
}

main().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
