import { EngineManager } from './src/engines/manager.js';
const manager = new EngineManager();
async function run() {
    console.log(await manager.prove(['P -> Q', '-Q'], '-P', { engine: 'auto' }));
}
run();
