import {
    Verbosity,
    ModelResponse,
} from '../types/index.js';
import { ModelFinder, createModelFinder } from '../model/index.js';
import { buildModelResponse } from '../utils/response.js';

export async function findModelHandler(
    args: {
        premises: string[];
        domain_size?: number;
        max_domain_size?: number;
        use_sat?: boolean | 'auto';
        enable_symmetry?: boolean;
        count?: number;
    },
    defaultFinder: ModelFinder,
    verbosity: Verbosity,
    onProgress?: (progress: number | undefined, message: string) => void
): Promise<ModelResponse> {
    const { premises, domain_size, max_domain_size, use_sat, enable_symmetry, count } = args;

    // Create finder with custom max domain size if specified (default 25 if not provided)
    const finder = max_domain_size ? createModelFinder(undefined, max_domain_size) : defaultFinder;

    // Determine bounds. If domain_size is set, use it as both min and max (exact search).
    // Note: ModelFinder currently iterates from 1 to maxDomainSize.
    // To support exact search, we rely on the fact that if a small model exists, it's usually returned.
    // If the user *specifically* wants to skip small sizes, our current ModelFinder doesn't explicitly support 'minDomainSize' via options,
    // but the performance impact is usually negligible.
    // We will use domain_size as the max bound if present.

    const options = {
        useSAT: use_sat,
        enableSymmetry: enable_symmetry,
        maxDomainSize: domain_size ?? max_domain_size,
        count,
        onProgress
    };

    const modelResult = await finder.findModel(premises, options);
    return buildModelResponse(modelResult, verbosity);
}

export async function findCounterexampleHandler(
    args: {
        premises: string[];
        conclusion: string;
        domain_size?: number;
        max_domain_size?: number;
        use_sat?: boolean | 'auto';
        enable_symmetry?: boolean;
    },
    defaultFinder: ModelFinder,
    verbosity: Verbosity,
    onProgress?: (progress: number | undefined, message: string) => void
): Promise<ModelResponse> {
    const { premises, conclusion, domain_size, max_domain_size, use_sat, enable_symmetry } = args;
    // Create finder with custom max domain size if specified
    const finder = max_domain_size ? createModelFinder(undefined, max_domain_size) : defaultFinder;

    const options = {
        useSAT: use_sat,
        enableSymmetry: enable_symmetry,
        maxDomainSize: domain_size ?? max_domain_size,
        onProgress
    };

    const modelResult = await finder.findCounterexample(premises, conclusion, options);
    return buildModelResponse(modelResult, verbosity);
}
