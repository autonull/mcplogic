import { EngineManager } from './src/engines/manager.js';
const manager = new EngineManager();
async function test() {
    await manager.getEngine('prolog');
    await manager.getEngine('sat');
    await manager.getEngine('z3');
    await manager.getEngine('clingo');

    const engines = manager.getEngines();
    console.log(engines);

    const e = await manager.selectEngine(['rains -> ground_gets_wet', 'not_wet(ground)'], 'not_raining(it)', { engine: 'auto' });
    console.log("Selected:", e.name);
}
test();
