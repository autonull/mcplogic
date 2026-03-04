import { HeuristicTranslator } from '../llm/translator.js';
import { TranslateRequest, TranslateResult } from '../types/llm.js';
import { parse } from '../parser/index.js';
import { InputRouter } from '../evolution/index.js';

const fallbackTranslator = new HeuristicTranslator();

export async function translateTextHandler(
    args: TranslateRequest,
    inputRouter?: InputRouter
): Promise<TranslateResult> {
    const translator = inputRouter
        ? await inputRouter.getTranslator(args.text)
        : fallbackTranslator;

    const result = await translator.translate(args.text);

    // Validation
    const errors: string[] = result.errors || [];
    const shouldValidate = args.validate ?? true;

    if (shouldValidate) {
        for (const p of result.premises) {
            try {
                parse(p);
            } catch (e) {
                errors.push(`Invalid premise generated: "${p}" - ${(e as Error).message}`);
            }
        }
        if (result.conclusion) {
            try {
                parse(result.conclusion);
            } catch (e) {
                errors.push(`Invalid conclusion generated: "${result.conclusion}" - ${(e as Error).message}`);
            }
        }
    }

    const finalResult: TranslateResult = {
        success: errors.length === 0,
        premises: result.premises,
        conclusion: result.conclusion,
        errors: errors.length > 0 ? errors : undefined
    };

    if (errors.length > 0 && fallbackTranslator instanceof HeuristicTranslator && !inputRouter) {
         // Provide a more user-friendly error if they are using the rule-based translator
         finalResult.errors?.push("Note: The translation is currently limited to basic logical forms. Try rephrasing your input into simpler sentences like 'All X are Y' or 'X is Y'.");
    }

    return finalResult;
}
