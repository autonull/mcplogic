import { EngineManager } from './src/engines/manager.js';
const manager = new EngineManager();
async function run() {
    // 3. Universal Goal Failure - but force SAT
    console.log(await manager.prove(['all x (bird(x) -> can_fly(x))', 'all x (penguin(x) -> bird(x))'], 'all x (penguin(x) -> can_fly(x))', { engine: 'sat' }));

    // 3. Universal Goal Failure - but force Z3
    console.log(await manager.prove(['all x (bird(x) -> can_fly(x))', 'all x (penguin(x) -> bird(x))'], 'all x (penguin(x) -> can_fly(x))', { engine: 'z3' }));

    // 3. Universal Goal Failure - but force Clingo
    console.log(await manager.prove(['all x (bird(x) -> can_fly(x))', 'all x (penguin(x) -> bird(x))'], 'all x (penguin(x) -> can_fly(x))', { engine: 'clingo' }));
}
run();
