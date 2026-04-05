import {
    verifyCommutativity,
    categoryAxioms,
    functorAxioms,
    naturalTransformationCondition,
    monoidAxioms,
    groupAxioms
} from '../axioms/categorical.js';

export interface CommutativityResponse {
    premises: string[];
    conclusion: string;
    note: string;
}

export interface AxiomsResponse {
    concept: string;
    axioms: string[];
}

export function verifyCommutativityHandler(
    args: {
        path_a: string[];
        path_b: string[];
        object_start: string;
        object_end: string;
        with_category_axioms?: boolean;
    }
): CommutativityResponse {
    const { path_a, path_b, object_start, object_end, with_category_axioms = true } = args;

    const { premises, conclusion } = verifyCommutativity(
        path_a,
        path_b,
        object_start,
        object_end
    );

    const allPremises = with_category_axioms
        ? [...categoryAxioms(), ...premises]
        : premises;

    return {
        premises: allPremises,
        conclusion,
        note: "Use the 'prove' tool with these premises and conclusion to verify commutativity",
    };
}

export function getCategoryAxiomsHandler(
    args: {
        concept: string;
        functor_name?: string;
    }
): AxiomsResponse {
    const { concept, functor_name = 'F' } = args;

    let axioms: string[];

    switch (concept) {
        case 'category':
            axioms = categoryAxioms();
            break;
        case 'functor':
            axioms = functorAxioms(functor_name);
            break;
        case 'natural-transformation':
            axioms = naturalTransformationCondition();
            break;
        case 'monoid':
            axioms = monoidAxioms();
            break;
        case 'group':
            axioms = groupAxioms();
            break;
        default:
            axioms = [];
    }

    return { concept, axioms };
}
