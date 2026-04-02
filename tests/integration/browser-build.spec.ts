
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Browser Compatibility', () => {
    test('should load library and prove theorem', async ({ page }) => {
        // Capture browser console logs
        page.on('console', msg => console.log('BROWSER:', msg.text()));
        page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

        // Serve files
        await page.route('**/*', async (route) => {
            const url = new URL(route.request().url());

            if (url.pathname === '/') {
                await route.fulfill({
                    body: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Browser Test</title>
                        <script>
                            // Polyfill process
                            window.process = {
                                env: { NODE_ENV: 'production' },
                                platform: 'browser',
                                browser: true,
                                version: 'v16.0.0',
                                binding: function(name) { return {}; },
                                cwd: function() { return '/'; },
                                nextTick: function(cb) { setTimeout(cb, 0); },
                                argv: []
                            };
                            window.Buffer = { isBuffer: () => false };
                            window.global = window;
                            window.global._ = window._;

                            // Polyfill module/require
                            window.module = { exports: {} };
                            window.exports = window.module.exports;
                            window.require = function(name) {
                                if (name === './minisat.js') return window.minisat;
                                if (name === './minisat_wrapper.js') return window.minisat_wrapper;
                                return {};
                            };
                        </script>

                        <!-- Load tau-prolog -->
                        <script src="/dist-browser/vendor/tau-prolog/core.js"></script>
                        <script>
                            // Capture tau-prolog export
                            window.pl = window.module.exports;
                            console.log('Tau-Prolog loaded:', window.pl);

                            // Reset module for next script
                            window.module = { exports: {} };
                            window.exports = window.module.exports;
                        </script>

                        <!-- Load logic-solver deps -->
                        <script src="/dist-browser/vendor/logic-solver/minisat.js"></script>
                        <script src="/dist-browser/vendor/logic-solver/minisat_wrapper.js"></script>
                        <script>
                            window.minisat = {};
                            window.minisat_wrapper = {};
                            // Logic-solver might need _
                            window._ = {
                                extend: function(obj) {
                                    for (var i = 1; i < arguments.length; i++) {
                                        var source = arguments[i];
                                        for (var prop in source) {
                                            obj[prop] = source[prop];
                                        }
                                    }
                                    return obj;
                                },
                                clone: function(obj) { return {...obj}; },
                                isArray: Array.isArray,
                                isObject: function(obj) { return typeof obj === 'object' && obj !== null; },
                                isFunction: function(obj) { return typeof obj === 'function'; },
                                isString: function(obj) { return typeof obj === 'string'; },
                                isNumber: function(obj) { return typeof obj === 'number'; },
                                isBoolean: function(obj) { return typeof obj === 'boolean'; },
                                isUndefined: function(obj) { return typeof obj === 'undefined'; },
                                keys: Object.keys,
                                has: function(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); },
                                defaults: function(obj) {
                                    for (var i = 1; i < arguments.length; i++) {
                                        var source = arguments[i];
                                        for (var prop in source) {
                                            if (obj[prop] === void 0) obj[prop] = source[prop];
                                        }
                                    }
                                    return obj;
                                }
                            };
                            window.global = window;
                            window.global._ = window._;
                        </script>

                        <!-- Load logic-solver -->
                        <script src="/dist-browser/vendor/logic-solver/logic-solver.js"></script>
                        <script>
                            // Capture logic-solver export
                            window.Logic = window.module.exports;
                            console.log('Logic-Solver loaded:', window.Logic);
                        </script>

                        <script type="importmap">
                        {
                            "imports": {
                                "tau-prolog": "/vendor-wrappers/tau-prolog.js",
                                "logic-solver": "/vendor-wrappers/logic-solver.js",
                                "z3-solver": "/vendor-wrappers/z3-solver.js",
                                "clingo-wasm": "/vendor-wrappers/clingo-wasm.js",
                                "fs/promises": "/vendor-wrappers/fs-promises.js",
                                "fs": "/vendor-wrappers/fs.js",
                                "path": "/vendor-wrappers/path.js",
                                "crypto": "/vendor-wrappers/crypto.js"
                            }
                        }
                        </script>
                    </head>
                    <body>
                        <pre id="output">Running...</pre>
                        <script type="module">
                            import { createLogicEngine } from '/dist-browser/lib.js';

                            const output = document.getElementById('output');

                            async function run() {
                                try {
                                    console.log('Creating engine...');
                                    const engine = createLogicEngine();
                                    const premises = ['all x (man(x) -> mortal(x))', 'man(socrates)'];
                                    const conclusion = 'mortal(socrates)';

                                    output.textContent = 'Proving...';
                                    console.log('Starting proof...');
                                    const result = await engine.prove(premises, conclusion);
                                    console.log('Proof result:', result);

                                    if (result.success && result.result === 'proved') {
                                        output.textContent = 'SUCCESS: ' + result.message;
                                    } else {
                                        output.textContent = 'FAILED: ' + JSON.stringify(result);
                                    }
                                } catch (e) {
                                    console.error('Execution error:', e);
                                    output.textContent = 'ERROR: ' + e.message + '\\n' + e.stack;
                                }
                            }

                            run();
                        </script>
                    </body>
                    </html>
                    `,
                    contentType: 'text/html'
                });
                return;
            }
            if (url.pathname === '/vendor-wrappers/crypto.js') {
                await route.fulfill({
                    body: 'export const randomUUID = () => "uuid"; export default { randomUUID };',
                    contentType: 'application/javascript'
                });
                return;
            }
            if (url.pathname === '/vendor-wrappers/path.js') {
                await route.fulfill({
                    body: 'export default { join: () => "", resolve: () => "" };',
                    contentType: 'application/javascript'
                });
                return;
            }
            if (url.pathname === '/vendor-wrappers/fs-promises.js' || url.pathname === '/vendor-wrappers/fs.js') {
                await route.fulfill({
                    body: 'export default { mkdir: async () => {}, writeFile: async () => {}, readFile: async () => "{}", unlink: async () => {}, readdir: async () => [] };',
                    contentType: 'application/javascript'
                });
                return;
            }

            // Serve vendor wrappers
            if (url.pathname === '/vendor-wrappers/tau-prolog.js') {
                await route.fulfill({
                    body: 'export default window.pl;',
                    contentType: 'application/javascript'
                });
                return;
            }
            if (url.pathname === '/vendor-wrappers/logic-solver.js') {
                await route.fulfill({
                    body: 'export default window.Logic;',
                    contentType: 'application/javascript'
                });
                return;
            }
            if (url.pathname === '/vendor-wrappers/z3-solver.js' || url.pathname === '/vendor-wrappers/clingo-wasm.js') {
                await route.fulfill({
                    body: 'export const init = async () => ({ Context: function(){} }); export const run = async () => {};',
                    contentType: 'application/javascript'
                });
                return;
            }

            // Serve static files
            if (url.pathname.startsWith('/dist-browser/')) {
                const relativePath = url.pathname.substring(1); // remove leading /
                const filePath = path.resolve(process.cwd(), relativePath);

                if (fs.existsSync(filePath)) {
                    await route.fulfill({
                        path: filePath,
                        contentType: 'application/javascript'
                    });
                } else {
                    console.log('404:', filePath);
                    await route.continue();
                }
                return;
            }

            await route.continue();
        });

        await page.goto('http://localhost:3000/');

        // Wait for success message
        await expect(page.locator('#output')).toContainText('SUCCESS: Proved: mortal(socrates)', { timeout: 10000 });
    });
});
