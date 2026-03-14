import { cp, mkdir, rm, access } from 'node:fs/promises';
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
  'manifest.webmanifest',
  'sw.js'
];

for (const relativePath of requiredFiles) {
  try {
    await access(join(sourceDir, relativePath), constants.R_OK);
  } catch {
    throw new Error(`Missing required web asset: web/${relativePath}`);
  }
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(sourceDir, outputDir, { recursive: true });

console.log(`Built static web app into ${outputDir}`);
