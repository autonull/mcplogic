import { EngineManager } from './src/engines/manager.js';
const manager = new EngineManager();
async function run() {
    // 1. Modus Tollens Failure
    // Premises: ["rains -> ground_gets_wet", "not_wet(ground)"]
    // Conclusion: "not_raining(it)"
    console.log(await manager.prove(['rains -> ground_gets_wet', 'not_wet(ground)'], 'not_raining(it)', { engine: 'auto' }));

    // 2. Existential Instantiation Failure
    // Premises: ["all x (human(x) -> mortal(x))"]
    // Conclusion: "exists x (human(x) & mortal(x))"
    console.log(await manager.prove(['all x (human(x) -> mortal(x))'], 'exists x (human(x) & mortal(x))', { engine: 'auto' }));

    // 3. Universal Goal Failure
    // Premises: ["all x (bird(x) -> can_fly(x))", "all x (penguin(x) -> bird(x))"]
    // Conclusion: "all x (penguin(x) -> can_fly(x))"
    console.log(await manager.prove(['all x (bird(x) -> can_fly(x))', 'all x (penguin(x) -> bird(x))'], 'all x (penguin(x) -> can_fly(x))', { engine: 'auto' }));

    // Invalid Arguments Correctly Identified
    // 1. Affirming the Consequent
    // Premises: ["number_is_divisible_by_4 -> even", "even(6)"]
    // Conclusion: "divisible_by_4(6)"
    console.log(await manager.prove(['number_is_divisible_by_4 -> even', 'even(6)'], 'divisible_by_4(6)', { engine: 'auto' }));

    // Mixed Results
    // 1. Syllogistic Reasoning
    // Premises: ["all x (triangle(x) -> have_three_side(x))"]
    // Conclusion: "something_has_three_sides -> triangle"
    console.log(await manager.prove(['all x (triangle(x) -> have_three_side(x))'], 'something_has_three_sides -> triangle', { engine: 'auto' }));
}
run();
