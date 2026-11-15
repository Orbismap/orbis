#!/usr/bin/env node
// Scaffolds a new aircraft (or other) 3D model into a staging directory:
//   - copies the .glb
//   - updates <staging>/<group>/registry.json (models + types)
//   - appends to <staging>/<group>/CREDITS.json
// Usage:
//   node scripts/add-model.mjs --glb ./a350.glb --id a350 --length 73.8 \
//     --type A359:66.8 --type A35K:73.8 \
//     --title "Airbus A350-1000" --author "OUTPISTON" \
//     --license "CC BY-NC-SA 4.0" --source "https://sketchfab.com/outpiston" \
//     [--group aircraft] [--staging ./models-staging]
//
// Upload afterwards with the data repo's collectors/upload.sh:
//   cd ../orbismap-data && collectors/upload.sh models orbis-assets "public, max-age=31536000, immutable" --collapse-manifest

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const getAll = (k) => { const out = []; for (let i = 0; i < args.length; i++) if (args[i] === k) out.push(args[i + 1]); return out; };

const staging = resolve(get('--staging') || './models-staging');
const group = get('--group') || 'aircraft';
const modelsDir = get('--models-dir') || 'models';
const glbPath = get('--glb');
const id = get('--id') || (glbPath ? basename(glbPath, '.glb') : undefined);
const name = get('--name') || (glbPath ? basename(glbPath) : undefined);
const length = parseFloat(get('--length'));
const types = getAll('--type');
const title = get('--title') || id;
const author = get('--author') || 'unknown';
const license = get('--license') || 'unknown';
const source = get('--source') || '';
const dir = join(staging, modelsDir, group);

if (!glbPath || !id || !Number.isFinite(length)) {
  console.error('required: --glb <path> --id <model-id> --length <metres>');
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
const targetFile = name || basename(glbPath);
copyFileSync(glbPath, join(dir, targetFile));

const regPath = join(dir, 'registry.json');
const reg = existsSync(regPath) ? JSON.parse(readFileSync(regPath, 'utf8')) : { models: {}, types: {} };
reg.models = reg.models || {};
reg.types = reg.types || {};
reg.models[id] = { file: targetFile, length };
for (const t of types) {
  const [code, len] = t.split(':');
  if (!code) continue;
  reg.types[code.trim().toUpperCase()] = [id, len ? parseFloat(len) : length];
}
writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n');

const creditsPath = join(dir, 'CREDITS.json');
const credits = existsSync(creditsPath) ? JSON.parse(readFileSync(creditsPath, 'utf8')) : [];
if (!credits.some((c) => c.file === targetFile)) {
  credits.push({ file: targetFile, title, author, license, source });
}
writeFileSync(creditsPath, JSON.stringify(credits, null, 2) + '\n');

console.log(`added model "${id}" (${targetFile}) to ${dir}`);
console.log(`  models: ${Object.keys(reg.models).length}, types: ${Object.keys(reg.types).length}`);
console.log('upload with:');
console.log(`  cd ${staging === resolve('./models-staging') ? '../orbismap-data' : staging} && collectors/upload.sh models orbis-assets "public, max-age=31536000, immutable" --collapse-manifest`);
console.log('  (or upload the staging dir manually to the orbis-assets bucket under models/)');