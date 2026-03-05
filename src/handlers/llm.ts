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
         finalResult.errors?.push("The internal LLM is not configured, so the server fell back to basic heuristic regex translation which failed on this complex input.");
         finalResult.errors?.push("Graceful Fallback Instruction: As the host AI assistant, please translate the user's natural language into First-Order Logic (FOL) yourself using your own reasoning capabilities, and then directly call the 'prove' or 'find-model' tools with the resulting FOL formulas.");
    }

    return finalResult;
}
