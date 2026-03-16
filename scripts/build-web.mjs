import { cp, mkdir, rm, access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();
const sourceDir = join(projectRoot, 'web');
const outputDir = join(projectRoot, 'dist');

const requiredFiles = [
  'index.html',
  'main.js',
  'game.js',
  'board-renderer.js',
  'styles.css',
  'manifest.webmanifest'
];

for (const relativePath of requiredFiles) {
  try {
    await access(join(sourceDir, relativePath), constants.R_OK);
  } catch {
    throw new Error(`Missing required web asset: web/${relativePath}`);
  }
}

const referencedAssets = await collectReferencedAssets(sourceDir);
for (const relativePath of referencedAssets) {
  try {
    await access(join(sourceDir, relativePath), constants.R_OK);
  } catch {
    throw new Error(`Missing asset referenced by web app: web/${relativePath}`);
  }
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(sourceDir, outputDir, { recursive: true });

console.log(`Built static web app into ${outputDir}`);

async function collectReferencedAssets(rootDir) {
  const htmlRefs = await collectHtmlRefs(join(rootDir, 'index.html'));
  const manifestRefs = await collectManifestRefs(join(rootDir, 'manifest.webmanifest'));
  return [...new Set([...htmlRefs, ...manifestRefs])];
}

async function collectHtmlRefs(filePath) {
  const html = await readFile(filePath, 'utf8');
  const matches = [...html.matchAll(/(?:href|src)="([^"]+)"/g)];
  return matches
    .map((match) => normalizeLocalAsset(match[1]))
    .filter(Boolean);
}

async function collectManifestRefs(filePath) {
  const manifest = JSON.parse(await readFile(filePath, 'utf8'));
  const refs = [];
  if (typeof manifest.start_url === 'string') refs.push(manifest.start_url);
  if (Array.isArray(manifest.icons)) {
    for (const icon of manifest.icons) {
      if (typeof icon?.src === 'string') refs.push(icon.src);
    }
  }
  return refs.map(normalizeLocalAsset).filter(Boolean);
}

function normalizeLocalAsset(value) {
  if (typeof value !== 'string') return null;
  if (/^(https?:|data:|#)/.test(value)) return null;
  const normalized = value.replace(/^\.\//, '');
  if (!normalized) return null;
  return normalized;
}
