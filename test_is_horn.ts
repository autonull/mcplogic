import { parse } from './src/parser/index.js';
import { clausify, isHornFormula } from './src/logic/clausifier.js';
import { createAnd, createNot } from './src/ast/index.js';

function check(premises: string[], conclusion: string) {
    const premiseNodes = premises.map(p => parse(p));
    const conclusionNode = parse(conclusion);
    const negatedConclusion = createNot(conclusionNode);
    const allNodes = [...premiseNodes, negatedConclusion];
    const refutationAST = allNodes.length > 0
        ? allNodes.reduce((acc, node) => createAnd(acc, node))
        : negatedConclusion;

    const clausifyResult = clausify(refutationAST);
    let isHorn = false;
    if (clausifyResult.success && clausifyResult.clauses) {
        console.log("Clauses for", premises, conclusion, ":\n", clausifyResult.clauses.map(c => c.literals.map(l => (l.negated ? '-' : '') + l.predicate).join(' | ')));
        isHorn = isHornFormula(clausifyResult.clauses);
    }
    console.log("isHorn:", isHorn);
}

// 1. Modus Tollens
check(['rains -> ground_gets_wet', 'not_wet(ground)'], 'not_raining(it)');
check(['rains -> ground_gets_wet', '-ground_gets_wet'], '-rains');
// 2. Existential Instantiation Failure
check(['all x (human(x) -> mortal(x))'], 'exists x (human(x) & mortal(x))');
// 1. Syllogistic Reasoning (Invalid argument)
check(['all x (triangle(x) -> have_three_side(x))'], 'something_has_three_sides -> triangle');
