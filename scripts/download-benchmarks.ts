/**
 * Script to download TPTP benchmarks
 */

import fs from 'fs';
import path from 'path';
import https from 'https';

const BENCHMARK_DIR = path.join(process.cwd(), 'benchmarks', 'tptp');
const PROBLEMS = [
    { domain: 'PUZ', name: 'PUZ001+1.p', url: 'https://tptp.org/cgi-bin/SeeTPTP?Category=Problems&Domain=PUZ&File=PUZ001+1.p' },
    { domain: 'GRP', name: 'GRP001-1.p', url: 'https://tptp.org/cgi-bin/SeeTPTP?Category=Problems&Domain=GRP&File=GRP001-1.p' },
    { domain: 'SYN', name: 'SYN001+1.p', url: 'https://tptp.org/cgi-bin/SeeTPTP?Category=Problems&Domain=SYN&File=SYN001+1.p' },
];

async function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        // The TPTP URL might be an HTML wrapper or raw.
        // Actually, https://tptp.org/cgi-bin/SeeTPTP returns HTML.
        // Raw problems are usually at https://raw.githubusercontent.com/TPTP/TPTP/master/Problems/...
        // Or via GitHub mirror. Let's use a reliable raw source if possible.
        // A reliable mirror is: https://raw.githubusercontent.com/TPTP/TPTP/master/Problems/[Domain]/[File]

        // Adjust URL
        const domain = path.basename(dest).substring(0, 3);
        const filename = path.basename(dest);
        const rawUrl = `https://raw.githubusercontent.com/TPTP/TPTP/master/Problems/${domain}/${filename}`;

        https.get(rawUrl, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${rawUrl}: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function main() {
    if (!fs.existsSync(BENCHMARK_DIR)) {
        fs.mkdirSync(BENCHMARK_DIR, { recursive: true });
    }

    console.log(`Downloading ${PROBLEMS.length} benchmarks to ${BENCHMARK_DIR}...`);

    for (const prob of PROBLEMS) {
        const dest = path.join(BENCHMARK_DIR, prob.name);
        if (fs.existsSync(dest)) {
            console.log(`- ${prob.name} (already exists)`);
            continue;
        }
        try {
            await downloadFile(prob.url, dest);
            console.log(`- ${prob.name} (downloaded)`);
        } catch (e) {
            console.error(`- ${prob.name} (failed: ${e})`);
        }
    }
}

main().catch(console.error);
