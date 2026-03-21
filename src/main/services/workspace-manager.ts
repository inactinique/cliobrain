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

  get dataDir(): string | null {
    if (!this.currentWorkspacePath) return null;
    return path.join(this.currentWorkspacePath, WORKSPACE_DIR);
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
    const dataDirPath = path.join(dirPath, WORKSPACE_DIR);
    // Create directories
    fs.mkdirSync(dataDirPath, { recursive: true });

    // Create workspace config
    const config: WorkspaceConfig = {
      name,
      createdAt: new Date().toISOString(),
      language,
      watchedFolders: [],
    };

    const configPath = path.join(dataDirPath, WORKSPACE_CONFIG_FILE);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // Add to recent workspaces
    this.addToRecent(dirPath, name);

    // Load the newly created workspace
    return this.load(dirPath);
  }

  async load(dirPath: string): Promise<WorkspaceMetadata> {
    const dataDirPath = path.join(dirPath, WORKSPACE_DIR);
    const configPath = path.join(dataDirPath, WORKSPACE_CONFIG_FILE);

    if (!fs.existsSync(configPath)) {
      throw new Error(`No ClioBrain workspace found at ${dirPath}`);
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    this.currentConfig = JSON.parse(configContent) as WorkspaceConfig;
    this.currentWorkspacePath = dirPath;

    // Initialize document service (SQLite, HNSW, BM25, Ollama)
    await documentService.initialize(dataDirPath);

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

    // Update recent workspaces
    this.addToRecent(dirPath, this.currentConfig.name);

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
    if (!this.currentConfig || !this.dataDir) {
      throw new Error('No workspace loaded');
    }

    this.currentConfig = { ...this.currentConfig, ...updates };

    const configPath = path.join(this.dataDir, WORKSPACE_CONFIG_FILE);
    fs.writeFileSync(configPath, JSON.stringify(this.currentConfig, null, 2), 'utf-8');
  }

  getRecent(): WorkspaceMetadata[] {
    const recent = configManager.get('recentWorkspaces') as string[] || [];
    return recent
      .filter(p => {
        const configPath = path.join(p, WORKSPACE_DIR, WORKSPACE_CONFIG_FILE);
        return fs.existsSync(configPath);
      })
      .map(p => {
        try {
          const configPath = path.join(p, WORKSPACE_DIR, WORKSPACE_CONFIG_FILE);
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as WorkspaceConfig;
          return {
            name: config.name,
            path: p,
            createdAt: config.createdAt,
            lastOpenedAt: config.createdAt,
          };
        } catch {
          return null;
        }
      })
      .filter((m): m is WorkspaceMetadata => m !== null);
  }

  private addToRecent(dirPath: string, name: string): void {
    const recent = configManager.get('recentWorkspaces') as string[] || [];
    const filtered = recent.filter(p => p !== dirPath);
    filtered.unshift(dirPath);
    configManager.set('recentWorkspaces', filtered.slice(0, 10));
  }
}

export const workspaceManager = new WorkspaceManager();
