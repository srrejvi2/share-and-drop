import { build } from 'esbuild';
import { mkdir, cp, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await build({entryPoints:['src/app.js','src/hash-worker.js'],bundle:true,minify:true,format:'esm',target:'es2022',outdir:'dist/assets',legalComments:'eof'});
console.log('Built S&D');
