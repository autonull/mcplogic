#!/usr/bin/env node
/**
 * Verification Script
 * Runs build, tests, and CLI check command to verify installation.
 */

import { execSync } from 'child_process';

function run(command: string, description: string) {
    console.log(`\n=== ${description} ===`);
    try {
        execSync(command, { stdio: 'inherit' });
        console.log(`✓ ${description} Passed`);
    } catch (e) {
        console.error(`✗ ${description} Failed`);
        process.exit(1);
    }
}

console.log('Starting Verification...');

// 1. Build
run('npm run build', 'Build (TypeScript)');

// 2. Tests
// Run a subset of critical tests if full suite is too slow, or all.
// For verification, robustness tests + Z3/Clingo are key.
run('npm test tests/robustness.test.ts tests/z3-engine.test.ts tests/clingo-engine.test.ts', 'Critical Tests');

// 3. CLI Check
run('./dist/cli.js check', 'CLI Engine Check');

console.log('\n✨ All Checks Passed! System is ready.');
