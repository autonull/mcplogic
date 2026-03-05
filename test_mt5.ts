import { EngineManager } from './src/engines/manager.js';
const manager = new EngineManager();
async function run() {
    // 1. Modus Tollens
    console.log(await manager.prove(['P -> Q', '-Q'], '-P', { engine: 'auto' }));

    // Test Exact User input for Modus Tollens:
    // Premises: ["rains -> ground_gets_wet", "-ground_gets_wet"]
    // Conclusion: "-rains"
    console.log(await manager.prove(['rains -> ground_gets_wet', '-ground_gets_wet'], '-rains', { engine: 'auto' }));
}
run();
