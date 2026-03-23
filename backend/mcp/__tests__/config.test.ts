import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadMcpConfig } from '../config.js';

describe('loadMcpConfig', () => {
  it('throws when workspace does not exist', () => {
    expect(() => loadMcpConfig('/tmp/nonexistent-workspace-' + Date.now()))
      .toThrow('No ClioBrain workspace found');
  });

  it('throws when .cliobrain/workspace.json is missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cliobrain-test-'));
    try {
      expect(() => loadMcpConfig(tmpDir))
        .toThrow('No ClioBrain workspace found');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('loads config from a valid workspace', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cliobrain-test-'));
    const clioDir = path.join(tmpDir, '.cliobrain');
    fs.mkdirSync(clioDir, { recursive: true });
    fs.writeFileSync(
      path.join(clioDir, 'workspace.json'),
      JSON.stringify({
        name: 'test-workspace',
        createdAt: '2025-01-01T00:00:00Z',
        language: 'fr',
        watchedFolders: [],
      })
    );

    try {
      const config = loadMcpConfig(tmpDir);

      expect(config.workspacePath).toBe(tmpDir);
      expect(config.configDir).toBe(clioDir);
      expect(config.workspace.name).toBe('test-workspace');
      expect(config.workspace.language).toBe('fr');
      expect(config.logPath).toBe(path.join(clioDir, 'mcp-access.jsonl'));
      expect(config.dataDir).toContain('workspaces');
      expect(fs.existsSync(config.dataDir)).toBe(true);
      // App config uses defaults
      expect(config.app.llm.ollamaEmbeddingModel).toBe('nomic-embed-text');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('resolves relative paths to absolute', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cliobrain-test-'));
    const clioDir = path.join(tmpDir, '.cliobrain');
    fs.mkdirSync(clioDir);
    fs.writeFileSync(
      path.join(clioDir, 'workspace.json'),
      JSON.stringify({ name: 'test', createdAt: '', language: 'en', watchedFolders: [] })
    );

    try {
      const config = loadMcpConfig(tmpDir);
      expect(path.isAbsolute(config.workspacePath)).toBe(true);
      expect(path.isAbsolute(config.dataDir)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
