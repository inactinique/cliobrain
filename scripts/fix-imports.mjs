/**
 * Post-build script: Fix .ts imports to .js in compiled output
 * TypeScript compiles import paths as-is, but Node.js ESM requires .js extensions
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const DIST_DIR = 'dist';

function processFile(filePath) {
  if (!filePath.endsWith('.js')) return;

  let content = readFileSync(filePath, 'utf-8');
  const original = content;

  // Fix relative imports missing .js extension
  content = content.replace(
    /(from\s+['"])(\.\.?\/[^'"]*?)(?<!\.js)(['"])/g,
    '$1$2.js$3'
  );

  // Fix dynamic imports
  content = content.replace(
    /(import\s*\(\s*['"])(\.\.?\/[^'"]*?)(?<!\.js)(['"]\s*\))/g,
    '$1$2.js$3'
  );

  if (content !== original) {
    writeFileSync(filePath, content, 'utf-8');
  }
}

function walkDir(dir) {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walkDir(fullPath);
      } else {
        processFile(fullPath);
      }
    }
  } catch (e) {
    // Skip missing directories
  }
}

walkDir(join(DIST_DIR, 'src'));
console.log('[fix-imports] Import paths fixed in dist/src/');
