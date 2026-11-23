import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { displayVersion } from './src/model/appVersion';

/** The `gfde` command (CLI, MCP server, local API) as one Node file: dist-cli/gfde.mjs.
 * Uses the app's own calculation code (src/calc, src/model); no React, no Electron.
 * The installed app carries it in resources/gfde (package.json extraResources), run by the app as Node. */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(displayVersion(pkg.version)) },
  publicDir: false,
  // The built-in DWG / DXF reader (src/engines/cad): its WebAssembly is inlined, so the CLI stays one file.
  assetsInclude: ['**/*.wasm'],
  build: {
    outDir: 'dist-cli',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    ssr: 'src/headless/main.ts',
    // The licence texts of the libraries in the file: the installed app carries it without node_modules (NOTICE.md).
    license: { fileName: 'third-party-licences.md' },
    rollupOptions: {
      external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
      output: { entryFileNames: 'gfde.mjs', banner: '#!/usr/bin/env node', codeSplitting: false }
    }
  },
  // Bundle the dependencies into the one file, so it runs without node_modules.
  ssr: { noExternal: true, target: 'node' }
});
