import { TranslationStrategy, TranslationResult } from '../types/llm.js';
import { parse } from '../parser/index.js';

/**
 * A rule-based translator that handles standard English logical forms.
 * This satisfies the "offline model" requirement without needing a heavy NN.
 */
export class HeuristicTranslator implements TranslationStrategy {
    async translate(text: string): Promise<TranslationResult> {
        const lines = text.split(/[.\n]+/).map(l => l.trim()).filter(l => l);
        const premises: string[] = [];
        let conclusion: string | undefined;
        const errors: string[] = [];

        for (const line of lines) {
            // Check for conclusion markers
            if (line.match(/^(therefore|thus|hence|conclusion:|prove:)/i)) {
                const cleanLine = line.replace(/^(therefore|thus|hence|conclusion:|prove:)[,\s]*/i, '');
                const form = this.parseSentence(cleanLine);
                if (form) {
                    conclusion = form;
                } else {
                    errors.push(`Could not translate conclusion: "${cleanLine}"`);
                }
                continue;
            }

            // Otherwise treat as premise
            const form = this.parseSentence(line);
            if (form) {
                premises.push(form);
            } else {
                errors.push(`Could not translate premise: "${line}"`);
            }
        }

        return { premises, conclusion, errors: errors.length > 0 ? errors : undefined };
    }

    private parseSentence(sentence: string): string | null {
        const s = sentence.toLowerCase()
            .replace(/^(therefore|thus|hence|conclusion:|prove:)[,\s]*/i, '')
            .replace(/[^\w\s\(\),]/g, '')
            .replace(/^,\s*/, '')
            .trim();

        // 0. "There exists ..."
        const existsThat = s.match(/^there exists (a|an|some) (.+?) that (is|are|has) (.+)$/);
        if (existsThat) {
            const sub = this.simplifyAtom(existsThat[2]);
            const pred = this.simplifyAtom(existsThat[4]);
            return `exists x (${sub}(x) & ${pred}(x))`;
        }

        // 1. "Socrates is a man" -> man(socrates)
        // Regex: X is a Y
        const isA = s.match(/^(\w+) is a (\w+)$/);
        if (isA) {
            return `${isA[2]}(${isA[1]})`;
        }

        // 1b. "Socrates is mortal" -> mortal(socrates)
        const isAdj = s.match(/^(\w+) is (\w+)$/);
        if (isAdj) {
            return `${isAdj[2]}(${isAdj[1]})`;
        }

        // 2. "All men are mortal" -> all x (man(x) -> mortal(x))
        // "All birds can fly" -> all x (bird(x) -> can_fly(x))
        // "All birds fly" -> all x (bird(x) -> fly(x))
        const allAre = s.match(/^all (\w+) (are|can )?(.+)$/);
        if (allAre) {
            const sub = this.singularize(allAre[1]);
            const predWords = allAre[3].trim().split(/\s+/);
            const pred = (allAre[2] === 'can ' ? 'can_' : '') + predWords.join('_');
            const finalPred = this.singularize(pred);
            return `all x (${sub}(x) -> ${finalPred}(x))`;
        }

        // 3. "Some men are mortal" -> exists x (man(x) & mortal(x))
        const someAre = s.match(/^some (\w+) are (\w+)$/);
        if (someAre) {
            const sub = this.singularize(someAre[1]);
            const pred = this.singularize(someAre[2]);
            return `exists x (${sub}(x) & ${pred}(x))`;
        }

        // 4. "No men are mortal" -> all x (man(x) -> -mortal(x))
        const noAre = s.match(/^no (\w+) are (\w+)$/);
        if (noAre) {
            const sub = this.singularize(noAre[1]);
            const pred = this.singularize(noAre[2]);
            return `all x (${sub}(x) -> -${pred}(x))`;
        }

        // 5. "If X then Y" (propositional/simple)
        // Handling variables is hard with regex, assuming propositional or 0-arity
        // "If raining then wet" -> raining -> wet
        // "If it rains, the ground gets wet" -> rains -> ground_gets_wet
        // Also handles "If raining, then wet" via regex flexibility on 'then' or comma
        const ifThen = s.match(/^if (.+?)(?:,)(?: then)? (.+)$/);
        if (ifThen) {
            const p = this.simplifyAtom(ifThen[1]);
            const q = this.simplifyAtom(ifThen[2]);
            return `${p} -> ${q}`;
        }
        const ifThenNoComma = s.match(/^if (.+?) then (.+)$/);
        if (ifThenNoComma) {
            const p = this.simplifyAtom(ifThenNoComma[1]);
            const q = this.simplifyAtom(ifThenNoComma[2]);
            return `${p} -> ${q}`;
        }

        // 6. Simple atoms "It is raining" -> raining
        // "John loves Mary" -> loves(john, mary)
        const transitive = s.match(/^(\w+) (\w+s) (\w+)$/);
        if (transitive) {
            // loves -> love
            const rel = transitive[2].replace(/s$/, '');
            return `${rel}(${transitive[1]}, ${transitive[3]})`;
        }

        // 7. General declarative: "It is raining", "The ground is wet", "Penguins are birds"
        // Need to be careful about commas from "Therefore, the ground is wet" which becomes "the ground is wet"
        let cleanS = s.replace(/^therefore[,]?\s+/i, '').trim();
        const isAre = cleanS.match(/^(.+?) (is|are) (.+)$/);
        if (isAre) {
            // Check if it looks like X are Y (plural)
            if (isAre[2] === 'are') {
                let sub = this.singularize(isAre[1].replace(/^,?\s*/, '').trim());
                sub = sub.replace(/^(the\s+|a\s+|an\s+)/i, '').trim().replace(/\s+/g, '_');
                let pred = this.singularize(isAre[3].trim());
                pred = pred.replace(/^(the\s+|a\s+|an\s+)/i, '').trim().replace(/\s+/g, '_');
                if (!sub.includes(' ') && !pred.includes(' ')) {
                    return `all x (${sub}(x) -> ${pred}(x))`;
                }
            } else {
                // "The ground is wet" -> wet(ground)
                // "Socrates is a man" handled above, but if it fell through:
                let sub = isAre[1].replace(/^,?\s*/, '').trim();
                sub = sub.replace(/^(the\s+|a\s+|an\s+)/i, '').trim();
                sub = sub.replace(/\s+/g, '_');
                let pred = isAre[3].replace(/^(a\s+|an\s+)/i, '').trim().replace(/\s+/g, '_');
                return `${pred}(${sub})`;
            }
        }

        // 8. General capability: "Penguins can fly" -> can_fly(penguins) -> wait, "penguins" are plural.
        const can = cleanS.match(/^(.+?) can (.+)$/);
        if (can) {
             let sub = this.singularize(can[1].trim());
             sub = sub.replace(/^(the\s+|a\s+|an\s+)/i, '').trim();
             sub = sub.replace(/^,?\s*/, '').trim().replace(/\s+/g, '_');
             const pred = "can_" + can[2].trim().replace(/\s+/g, '_');
             if (!sub.includes(' ')) {
                 return `all x (${sub}(x) -> ${pred}(x))`;
             }
        }

        // Fallback for simple atoms
        return this.simplifyAtom(sentence);
    }

    private simplifyAtom(sentence: string): string {
        // "it is raining" -> raining, "the ground is wet" -> ground_is_wet
        let s = sentence.toLowerCase().trim();
        s = s.replace(/^(it is|it\'s|there is)\s+/, '');
        s = s.replace(/^(it\s+)/, '');
        s = s.replace(/^(the|a|an)\s+/, '');
        return s.replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_');
    }

    private singularize(word: string): string {
        // Handle common irregularities or just strip 's'
        // 'men' -> 'man'
        if (word === 'men') return 'man';
        if (word === 'women') return 'woman';
        if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
        return word;
    }
}
