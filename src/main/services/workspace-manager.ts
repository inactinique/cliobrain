/**
 * Workspace manager for ClioBrain
 *
 * A workspace is a directory containing a .cliobrain/ folder with:
 * - workspace.json: workspace configuration
 * - brain.db: SQLite database (documents, chunks, embeddings, entities, sessions)
 * - hnsw.index: HNSW vector index
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { app } from 'electron';
import type { WorkspaceConfig, WorkspaceMetadata } from '../../../backend/types/workspace.js';
import { configManager } from './config-manager.js';
import { documentService } from './document-service.js';
import { vaultService } from './vault-service.js';

const WORKSPACE_DIR = '.cliobrain';
const WORKSPACE_CONFIG_FILE = 'workspace.json';

class WorkspaceManager {
  private currentWorkspacePath: string | null = null;
  private currentConfig: WorkspaceConfig | null = null;

  get isLoaded(): boolean {
    return this.currentWorkspacePath !== null;
  }

  get workspacePath(): string | null {
    return this.currentWorkspacePath;
  }

  /**
   * Config dir: .cliobrain/ inside the workspace (synced, lightweight)
   */
  get configDir(): string | null {
    if (!this.currentWorkspacePath) return null;
    return path.join(this.currentWorkspacePath, WORKSPACE_DIR);
  }

  /**
   * Data dir: local storage for DB and indexes (never cloud-synced)
   * Located in ~/Library/Application Support/cliobrain/workspaces/<hash>/
   * This avoids SQLite I/O errors on cloud-synced filesystems (OneDrive, iCloud, Dropbox)
   */
  get dataDir(): string | null {
    if (!this.currentWorkspacePath) return null;
    const hash = crypto.createHash('md5').update(this.currentWorkspacePath).digest('hex').substring(0, 12);
    const localDir = path.join(app.getPath('userData'), 'workspaces', hash);
    fs.mkdirSync(localDir, { recursive: true });
    return localDir;
  }

  get databasePath(): string | null {
    if (!this.dataDir) return null;
    return path.join(this.dataDir, 'brain.db');
  }

  get hnswIndexPath(): string | null {
    if (!this.dataDir) return null;
    return path.join(this.dataDir, 'hnsw.index');
  }

  get config(): WorkspaceConfig | null {
    return this.currentConfig;
  }

  async create(dirPath: string, name: string, language: 'fr' | 'en' | 'de' = 'fr'): Promise<WorkspaceMetadata> {
    const cfgDir = path.join(dirPath, WORKSPACE_DIR);
    fs.mkdirSync(cfgDir, { recursive: true });

    // Create workspace config (lightweight, lives in workspace dir — safe to sync)
    const config: WorkspaceConfig = {
      name,
      createdAt: new Date().toISOString(),
      language,
      watchedFolders: [],
    };

    const configPath = path.join(cfgDir, WORKSPACE_CONFIG_FILE);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // Add to recent workspaces
    this.addToRecent(dirPath, name);

    // Load the newly created workspace
    return this.load(dirPath);
  }

  async load(dirPath: string): Promise<WorkspaceMetadata> {
    // Close previous workspace if switching to a different one
    if (this.currentWorkspacePath && this.currentWorkspacePath !== dirPath) {
      console.log(`[WorkspaceManager] Closing previous workspace before loading new one`);
      await this.close();
    }

    const cfgDir = path.join(dirPath, WORKSPACE_DIR);
    const configPath = path.join(cfgDir, WORKSPACE_CONFIG_FILE);

    if (!fs.existsSync(configPath)) {
      throw new Error(`No ClioBrain workspace found at ${dirPath}`);
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    this.currentConfig = JSON.parse(configContent) as WorkspaceConfig;
    this.currentWorkspacePath = dirPath;

    // Initialize document service with LOCAL data dir (not cloud-synced)
    const localDataDir = this.dataDir!;
    console.log(`[WorkspaceManager] Local data dir: ${localDataDir}`);
    await documentService.initialize(localDataDir);

    // Auto-connect Obsidian vault if configured
    if (this.currentConfig.obsidian?.vaultPath) {
      try {
        await vaultService.connect(
          this.currentConfig.obsidian.vaultPath,
          documentService.store!,
          documentService.hnsw!,
          documentService.bm25!,
          documentService.ollama!
        );
        console.log(`[WorkspaceManager] Vault connected: ${this.currentConfig.obsidian.vaultPath}`);
      } catch (e) {
        console.warn('[WorkspaceManager] Failed to auto-connect vault:', e);
      }
    }

    const stats = documentService.getStatistics();
    const metadata: WorkspaceMetadata = {
      name: this.currentConfig.name,
      path: dirPath,
      createdAt: this.currentConfig.createdAt,
      lastOpenedAt: new Date().toISOString(),
      documentCount: stats?.documentCount,
      vaultNoteCount: stats?.noteCount,
    };

    // Persist lastOpenedAt into workspace config
    this.currentConfig.lastOpenedAt = new Date().toISOString();
    const configFilePath = path.join(cfgDir, WORKSPACE_CONFIG_FILE);
    fs.writeFileSync(configFilePath, JSON.stringify(this.currentConfig, null, 2), 'utf-8');

    // Update recent workspaces
    this.addToRecent(dirPath, this.currentConfig.name);

    // Auto-update Claude Desktop MCP config to point to this workspace
    this.updateClaudeDesktopMcpConfig(dirPath);

    console.log(`[WorkspaceManager] Loaded workspace: ${this.currentConfig.name} at ${dirPath}`);
    return metadata;
  }

  async close(): Promise<void> {
    await vaultService.disconnect();
    documentService.close();
    this.currentWorkspacePath = null;
    this.currentConfig = null;
    console.log('[WorkspaceManager] Workspace closed');
  }

  updateConfig(updates: Partial<WorkspaceConfig>): void {
    if (!this.currentConfig || !this.configDir) {
      throw new Error('No workspace loaded');
    }

    this.currentConfig = { ...this.currentConfig, ...updates };

    const configPath = path.join(this.configDir, WORKSPACE_CONFIG_FILE);
    fs.writeFileSync(configPath, JSON.stringify(this.currentConfig, null, 2), 'utf-8');
  }

  getRecent(): WorkspaceMetadata[] {
    const recent = configManager.get('recentWorkspaces') as string[] || [];

    // Filter out workspaces that no longer exist on disk
    const validPaths: string[] = [];
    const results: WorkspaceMetadata[] = [];

    for (const p of recent) {
      const configPath = path.join(p, WORKSPACE_DIR, WORKSPACE_CONFIG_FILE);
      if (!fs.existsSync(configPath)) continue;
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as WorkspaceConfig;
        validPaths.push(p);
        results.push({
          name: config.name,
          path: p,
          createdAt: config.createdAt,
          lastOpenedAt: config.lastOpenedAt || config.createdAt,
        });
      } catch {
        // Corrupt config — skip
      }
    }

    // Persist the cleaned list if stale entries were removed
    if (validPaths.length !== recent.length) {
      configManager.set('recentWorkspaces', validPaths);
    }

    return results;
  }

  removeFromRecent(dirPath: string): void {
    const recent = configManager.get('recentWorkspaces') as string[] || [];
    configManager.set('recentWorkspaces', recent.filter(p => p !== dirPath));
  }

  /**
   * Update Claude Desktop's MCP config so the cliobrain server
   * points to the currently loaded workspace.
   * Safe: only touches the "cliobrain" entry, preserves everything else.
   */
  private updateClaudeDesktopMcpConfig(workspacePath: string): void {
    try {
      // Resolve Claude Desktop config path per platform
      let configDir: string;
      if (process.platform === 'darwin') {
        configDir = path.join(app.getPath('home'), 'Library', 'Application Support', 'Claude');
      } else if (process.platform === 'win32') {
        configDir = path.join(process.env.APPDATA || path.join(app.getPath('home'), 'AppData', 'Roaming'), 'Claude');
      } else {
        configDir = path.join(process.env.XDG_CONFIG_HOME || path.join(app.getPath('home'), '.config'), 'Claude');
      }

      const configFile = path.join(configDir, 'claude_desktop_config.json');

      // Read existing config or start fresh
      let config: any = {};
      if (fs.existsSync(configFile)) {
        config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      }

      if (!config.mcpServers) {
        config.mcpServers = {};
      }

      // Resolve the mcp-start.sh path from ClioBrain's installation
      const mcpScript = path.join(app.getAppPath(), 'scripts', 'mcp-start.sh');

      if (config.mcpServers.cliobrain) {
        // Update existing entry — only change the workspace arg, keep the command
        config.mcpServers.cliobrain.args = ['--workspace', workspacePath];
      } else {
        // Create new entry
        config.mcpServers.cliobrain = {
          command: fs.existsSync(mcpScript) ? mcpScript : 'cliobrain-mcp',
          args: ['--workspace', workspacePath],
        };
      }

      // Write back — preserve formatting
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
      console.log(`[WorkspaceManager] Updated Claude Desktop MCP config → workspace: ${workspacePath}`);
    } catch (e) {
      // Non-critical — Claude Desktop may not be installed
      console.warn('[WorkspaceManager] Could not update Claude Desktop MCP config:', e);
    }
  }

  private addToRecent(dirPath: string, name: string): void {
    const recent = configManager.get('recentWorkspaces') as string[] || [];
    const filtered = recent.filter(p => p !== dirPath);
    filtered.unshift(dirPath);
    configManager.set('recentWorkspaces', filtered.slice(0, 10));
  }
}

export const workspaceManager = new WorkspaceManager();
