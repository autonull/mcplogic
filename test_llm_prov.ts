import { StandardLLMProvider } from './src/llm/provider.js';
const p = new StandardLLMProvider();
async function run() {
    try {
        console.log(await p.complete([{role: 'user', content: 'hello'}]));
    } catch(e) {
        console.error(e);
    }
}
run();
