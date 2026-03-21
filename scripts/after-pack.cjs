/**
 * electron-builder after-pack hook
 * Ensures native modules are properly rebuilt for the target platform
 */

const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  const appDir = context.appOutDir;
  const platform = context.electronPlatformName;

  console.log(`[after-pack] Platform: ${platform}`);
  console.log(`[after-pack] App directory: ${appDir}`);

  // Native modules that need rebuilding:
  // - better-sqlite3
  // - hnswlib-node
  // These are handled by electron-builder's asarUnpack + install-app-deps
};
