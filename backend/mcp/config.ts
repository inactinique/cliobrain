/**
 * MCP server configuration
 *
 * Standalone config reader that works without Electron.
 * Reads workspace config from .cliobrain/workspace.json and
 * replicates the data directory resolution logic from WorkspaceManager.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type { WorkspaceConfig } from '../types/workspace.js';
import { DEFAULT_APP_CONFIG } from '../types/config.js';
import type { AppConfig } from '../types/config.js';

const WORKSPACE_DIR = '.cliobrain';
const WORKSPACE_CONFIG_FILE = 'workspace.json';

export interface McpConfig {
  /** Workspace root path (the directory containing .cliobrain/) */
  workspacePath: string;
  /** .cliobrain/ config directory (inside workspace, cloud-safe) */
  configDir: string;
  /** Local data directory (DB, HNSW index — never cloud-synced) */
  dataDir: string;
  /** Workspace configuration from workspace.json */
  workspace: WorkspaceConfig;
  /** App-level configuration (defaults, since electron-store is unavailable) */
  app: AppConfig;
  /** Path to the MCP access log */
  logPath: string;
}

/**
 * Resolve the local data directory for a given workspace path.
 * Mirrors WorkspaceManager.dataDir logic without depending on Electron's app.getPath().
 */
function resolveDataDir(workspacePath: string): string {
  const hash = crypto.createHash('md5').update(workspacePath).digest('hex').substring(0, 12);

  // Replicate Electron's userData path per platform
  let userDataDir: string;
  const platform = process.platform;
  if (platform === 'darwin') {
    userDataDir = path.join(os.homedir(), 'Library', 'Application Support', 'cliobrain');
  } else if (platform === 'win32') {
    userDataDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'cliobrain');
  } else {
    // Linux / other
    userDataDir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'cliobrain');
  }

  return path.join(userDataDir, 'workspaces', hash);
}

/**
 * Load MCP configuration for a given workspace path.
 * Throws if the workspace doesn't exist or isn't initialized.
 */
export function loadMcpConfig(workspacePath: string): McpConfig {
  const absPath = path.resolve(workspacePath);
  const configDir = path.join(absPath, WORKSPACE_DIR);
  const configFile = path.join(configDir, WORKSPACE_CONFIG_FILE);

  if (!fs.existsSync(configFile)) {
    throw new Error(
      `No ClioBrain workspace found at ${absPath}\n` +
      `Expected ${configFile} to exist. Open this directory in ClioBrain first.`
    );
  }

  const workspaceConfig = JSON.parse(
    fs.readFileSync(configFile, 'utf-8')
  ) as WorkspaceConfig;

  const dataDir = resolveDataDir(absPath);

  // Ensure data directory exists
  fs.mkdirSync(dataDir, { recursive: true });

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
