// Version autonome : un dossier dist-standalone/ (index.html + app.js + app.css + worker.js) qui s'ouvre
// directement dans un navigateur, sans serveur ni installation.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const out = 'dist-standalone';
mkdirSync(out, { recursive: true });
// Le moteur tourne dans un Web Worker (worker.js) ; en file:// le contrôleur se replie sur le fil principal.
const standaloneWorker = {
  name: 'standalone-worker',
  setup(b) {
    b.onResolve({ filter: /^@\/lib\/workerFactory$|\/workerFactory$/ }, () => ({ path: resolve('standalone/workerFactory.ts') }));
  },
};
await build({
  entryPoints: ['src/lib/simulation.worker.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outfile: `${out}/worker.js`,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
await build({
  plugins: [standaloneWorker],
  entryPoints: ['standalone/main.tsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  outfile: `${out}/app.js`,
  alias: { 'next/link': './standalone/link.tsx', 'next/navigation': './standalone/navigation.ts' },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
  logOverride: { 'unsupported-directive': 'silent' },
});
execSync(`npx @tailwindcss/cli -i src/app/globals.css -o ${out}/app.css --minify`, { stdio: 'inherit' });
writeFileSync(
  `${out}/index.html`,
  `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MétroFlow Paris</title>
<meta name="description" content="Simulateur expérimental de gestion du métro parisien (demande synthétique)." />
<link rel="stylesheet" href="app.css" />
</head>
<body>
<div id="root"></div>
<script src="app.js"></script>
</body>
</html>
`,
);
console.log(`Version autonome générée dans ${out}/`);
