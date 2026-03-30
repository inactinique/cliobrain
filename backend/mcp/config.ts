/**
 * MCP server configuration
 *
 * Standalone config reader that works without Electron.
 * Workspace directory contains workspace.json, brain.db, and HNSW index
 * all in the same directory under Application Support.
 *
 * Also supports legacy layout (.cliobrain/ subdirectory + hash-based data dir)
 * for backward compatibility with existing workspaces.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type { WorkspaceConfig } from '../types/workspace.js';
import { DEFAULT_APP_CONFIG } from '../types/config.js';
import type { AppConfig } from '../types/config.js';

const WORKSPACE_CONFIG_FILE = 'workspace.json';

export interface McpConfig {
  /** Workspace directory path */
  workspacePath: string;
  /** Config directory (same as workspace dir in new layout) */
  configDir: string;
  /** Data directory (same as workspace dir in new layout) */
  dataDir: string;
  /** Workspace configuration from workspace.json */
  workspace: WorkspaceConfig;
  /** App-level configuration (defaults, since electron-store is unavailable) */
  app: AppConfig;
  /** Path to the MCP access log */
  logPath: string;
}

/**
 * Resolve legacy data directory (hash-based, separate from config).
 * Used for backward compatibility with workspaces created before the refactor.
 */
function resolveLegacyDataDir(workspacePath: string): string {
  const hash = crypto.createHash('md5').update(workspacePath).digest('hex').substring(0, 12);

  let userDataDir: string;
  const platform = process.platform;
  if (platform === 'darwin') {
    userDataDir = path.join(os.homedir(), 'Library', 'Application Support', 'cliobrain');
  } else if (platform === 'win32') {
    userDataDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'cliobrain');
  } else {
    userDataDir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'cliobrain');
  }

  return path.join(userDataDir, 'workspaces', hash);
}

/**
 * Load MCP configuration for a given workspace path.
 *
 * Supports two layouts:
 * 1. New: workspace.json is directly in the given directory (Application Support workspace dir)
 * 2. Legacy: workspace.json is in <path>/.cliobrain/ (user-chosen directory)
 */
export function loadMcpConfig(workspacePath: string): McpConfig {
  const absPath = path.resolve(workspacePath);

  // Try new layout: workspace.json directly in the directory
  let configFile = path.join(absPath, WORKSPACE_CONFIG_FILE);
  let configDir = absPath;
  let dataDir = absPath;

  if (!fs.existsSync(configFile)) {
    // Try legacy layout: .cliobrain/workspace.json
    const legacyConfigDir = path.join(absPath, '.cliobrain');
    const legacyConfigFile = path.join(legacyConfigDir, WORKSPACE_CONFIG_FILE);

    if (fs.existsSync(legacyConfigFile)) {
      configFile = legacyConfigFile;
      configDir = legacyConfigDir;
      dataDir = resolveLegacyDataDir(absPath);
      fs.mkdirSync(dataDir, { recursive: true });
    } else {
      throw new Error(
        `No ClioBrain workspace found at ${absPath}\n` +
        `Expected ${configFile} to exist. Open this directory in ClioBrain first.`
      );
    }
  }

  const workspaceConfig = JSON.parse(
    fs.readFileSync(configFile, 'utf-8')
  ) as WorkspaceConfig;

  const logPath = path.join(configDir, 'mcp-access.jsonl');

  return {
    workspacePath: absPath,
    configDir,
    dataDir,
    workspace: workspaceConfig,
    app: DEFAULT_APP_CONFIG,
    logPath,
  };
}
