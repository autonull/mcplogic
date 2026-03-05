import { EngineManager } from './src/engines/manager.js';
const manager = new EngineManager();
async function run() {
    // 1. Modus Tollens Failure
    // Premises: ["rains -> ground_gets_wet", "not_wet(ground)"]
    // Conclusion: "not_raining(it)"
    console.log(await manager.prove(['rains -> ground_gets_wet', '-ground_gets_wet'], '-rains', { engine: 'auto' }));
}
run();
