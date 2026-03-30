/**
 * Workspace manager for ClioBrain
 *
 * A workspace is a directory inside Application Support containing:
 * - workspace.json: workspace configuration
 * - brain.db: SQLite database (documents, chunks, embeddings, entities, sessions)
 * - hnsw.index + hnsw.meta.json: HNSW vector index
 * - mcp-access.jsonl: MCP access log
 *
 * All workspaces live under ~/Library/Application Support/cliobrain/workspaces/<slug>/
 */

import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import type { WorkspaceConfig, WorkspaceMetadata } from '../../../backend/types/workspace.js';
import { documentService } from './document-service.js';
import { vaultService } from './vault-service.js';

const WORKSPACE_CONFIG_FILE = 'workspace.json';

class WorkspaceManager {
  private currentWorkspaceDir: string | null = null;
  private currentConfig: WorkspaceConfig | null = null;

  get isLoaded(): boolean {
    return this.currentWorkspaceDir !== null;
  }

  get workspacePath(): string | null {
    return this.currentWorkspaceDir;
  }

  /** All workspaces live here */
  get workspacesRoot(): string {
    const root = path.join(app.getPath('userData'), 'workspaces');
    fs.mkdirSync(root, { recursive: true });
    return root;
  }

  /** Current workspace directory (config + data together) */
  get configDir(): string | null {
    return this.currentWorkspaceDir;
  }

  /** Same as configDir — config and data are now co-located */
  get dataDir(): string | null {
    return this.currentWorkspaceDir;
  }

  get databasePath(): string | null {
    if (!this.currentWorkspaceDir) return null;
    return path.join(this.currentWorkspaceDir, 'brain.db');
  }

  get hnswIndexPath(): string | null {
    if (!this.currentWorkspaceDir) return null;
    return path.join(this.currentWorkspaceDir, 'hnsw.index');
  }

  get config(): WorkspaceConfig | null {
    return this.currentConfig;
  }

  /** Create a URL-safe slug from a workspace name */
  private slugify(name: string): string {
    let slug = name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);

    if (!slug) slug = 'workspace';

    // Ensure uniqueness
    let candidate = slug;
    let counter = 1;
    while (fs.existsSync(path.join(this.workspacesRoot, candidate))) {
      candidate = `${slug}-${counter}`;
      counter++;
    }

    return candidate;
  }

  async create(name: string, language: 'fr' | 'en' | 'de' = 'fr'): Promise<WorkspaceMetadata> {
    // Close any currently loaded workspace first
    if (this.currentWorkspaceDir) {
      await this.close();
    }

    const slug = this.slugify(name);
    const wsDir = path.join(this.workspacesRoot, slug);
    fs.mkdirSync(wsDir, { recursive: true });

    // Create workspace config
    const config: WorkspaceConfig = {
      name,
      createdAt: new Date().toISOString(),
      language,
      watchedFolders: [],
    };

    const configPath = path.join(wsDir, WORKSPACE_CONFIG_FILE);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    console.log(`[WorkspaceManager] Created workspace "${name}" at ${wsDir}`);

    // Load the newly created workspace
    return this.load(wsDir);
  }

  async load(wsDir: string): Promise<WorkspaceMetadata> {
    // Close previous workspace if switching to a different one
    if (this.currentWorkspaceDir && this.currentWorkspaceDir !== wsDir) {
      console.log(`[WorkspaceManager] Closing previous workspace before loading new one`);
      await this.close();
    }

    const configPath = path.join(wsDir, WORKSPACE_CONFIG_FILE);

    if (!fs.existsSync(configPath)) {
      throw new Error(`No ClioBrain workspace found at ${wsDir}`);
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    this.currentConfig = JSON.parse(configContent) as WorkspaceConfig;
    this.currentWorkspaceDir = wsDir;

    // Initialize document service (config + data in same directory)
    console.log(`[WorkspaceManager] Workspace dir: ${wsDir}`);
    await documentService.initialize(wsDir);

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
      path: wsDir,
      createdAt: this.currentConfig.createdAt,
      lastOpenedAt: new Date().toISOString(),
      documentCount: stats?.documentCount,
      vaultNoteCount: stats?.noteCount,
    };

    // Persist lastOpenedAt into workspace config
    this.currentConfig.lastOpenedAt = new Date().toISOString();
    fs.writeFileSync(configPath, JSON.stringify(this.currentConfig, null, 2), 'utf-8');

    // Auto-update Claude Desktop MCP config to point to this workspace
    this.updateClaudeDesktopMcpConfig(wsDir);

    console.log(`[WorkspaceManager] Loaded workspace: ${this.currentConfig.name} at ${wsDir}`);
    return metadata;
  }

  async close(): Promise<void> {
    await vaultService.disconnect();
    documentService.close();
    this.currentWorkspaceDir = null;
    this.currentConfig = null;
    console.log('[WorkspaceManager] Workspace closed');
  }

  updateConfig(updates: Partial<WorkspaceConfig>): void {
    if (!this.currentConfig || !this.currentWorkspaceDir) {
      throw new Error('No workspace loaded');
    }

    this.currentConfig = { ...this.currentConfig, ...updates };

    const configPath = path.join(this.currentWorkspaceDir, WORKSPACE_CONFIG_FILE);
    fs.writeFileSync(configPath, JSON.stringify(this.currentConfig, null, 2), 'utf-8');
  }

  /** List all workspaces in the workspaces root */
  list(): WorkspaceMetadata[] {
    const root = this.workspacesRoot;
    const results: WorkspaceMetadata[] = [];

    let entries: string[];
    try {
      entries = fs.readdirSync(root);
    } catch {
      return [];
    }

    for (const entry of entries) {
      const wsDir = path.join(root, entry);
      const configPath = path.join(wsDir, WORKSPACE_CONFIG_FILE);
      if (!fs.existsSync(configPath)) continue;

      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as WorkspaceConfig;
        results.push({
          name: config.name,
          path: wsDir,
          createdAt: config.createdAt,
          lastOpenedAt: config.lastOpenedAt || config.createdAt,
        });
      } catch {
        // Corrupt config — skip
      }
    }

    // Sort by lastOpenedAt descending (most recent first)
    results.sort((a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime());

    return results;
  }

  /** Delete a workspace and all its data */
  deleteWorkspace(wsDir: string): void {
    // Don't delete the currently loaded workspace
    if (this.currentWorkspaceDir === wsDir) {
      throw new Error('Cannot delete the currently loaded workspace. Close it first.');
    }

    if (fs.existsSync(wsDir)) {
      fs.rmSync(wsDir, { recursive: true });
      console.log(`[WorkspaceManager] Deleted workspace at ${wsDir}`);
    }
  }

  // Keep for backward compatibility — alias for list()
  getRecent(): WorkspaceMetadata[] {
    return this.list();
  }

  removeFromRecent(dirPath: string): void {
    // Now this means delete the workspace
    this.deleteWorkspace(dirPath);
  }

  /**
   * Update Claude Desktop's MCP config so the cliobrain server
   * points to the currently loaded workspace.
   */
  private updateClaudeDesktopMcpConfig(workspacePath: string): void {
    try {
      let configDir: string;
      if (process.platform === 'darwin') {
        configDir = path.join(app.getPath('home'), 'Library', 'Application Support', 'Claude');
      } else if (process.platform === 'win32') {
        configDir = path.join(process.env.APPDATA || path.join(app.getPath('home'), 'AppData', 'Roaming'), 'Claude');
      } else {
        configDir = path.join(process.env.XDG_CONFIG_HOME || path.join(app.getPath('home'), '.config'), 'Claude');
      }

      const configFile = path.join(configDir, 'claude_desktop_config.json');

      let config: any = {};
      if (fs.existsSync(configFile)) {
        config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      }

      if (!config.mcpServers) {
        config.mcpServers = {};
      }

      const mcpScript = path.join(app.getAppPath(), 'scripts', 'mcp-start.sh');

      if (config.mcpServers.cliobrain) {
        config.mcpServers.cliobrain.args = ['--workspace', workspacePath];
      } else {
        config.mcpServers.cliobrain = {
          command: fs.existsSync(mcpScript) ? mcpScript : 'cliobrain-mcp',
          args: ['--workspace', workspacePath],
        };
      }

      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
      console.log(`[WorkspaceManager] Updated Claude Desktop MCP config → workspace: ${workspacePath}`);
    } catch (e) {
      console.warn('[WorkspaceManager] Could not update Claude Desktop MCP config:', e);
    }
  }
}

export const workspaceManager = new WorkspaceManager();
