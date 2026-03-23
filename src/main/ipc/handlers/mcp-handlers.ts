/**
 * MCP IPC Handlers
 *
 * Controls the MCP server from the Electron UI:
 * - Get status and configuration
 * - Read access logs
 * - Generate config snippets for Claude Desktop / Claude Code
 */

import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { workspaceManager } from '../../services/workspace-manager.js';
import { successResponse, errorResponse } from '../utils/error-handler.js';

export function setupMcpHandlers() {
  // Get MCP server status and info
  ipcMain.handle('mcp:get-status', async () => {
    try {
      if (!workspaceManager.isLoaded || !workspaceManager.workspacePath) {
        return successResponse({ available: false, reason: 'No workspace loaded' });
      }

      const configDir = workspaceManager.configDir!;
      const logPath = path.join(configDir, 'mcp-access.jsonl');
      const logExists = fs.existsSync(logPath);

      // Count log entries if log exists
      let logEntryCount = 0;
      let lastAccess: string | null = null;
      if (logExists) {
        const content = fs.readFileSync(logPath, 'utf-8').trim();
        if (content) {
          const lines = content.split('\n');
          logEntryCount = lines.length;
          try {
            const lastEntry = JSON.parse(lines[lines.length - 1]);
            lastAccess = lastEntry.timestamp || null;
          } catch { /* ignore */ }
        }
      }

      return successResponse({
        available: true,
        workspacePath: workspaceManager.workspacePath,
        logPath,
        logExists,
        logEntryCount,
        lastAccess,
      });
    } catch (error) {
      return errorResponse(error);
    }
  });

  // Read MCP access logs (last N entries)
  ipcMain.handle('mcp:get-logs', async (_event, limit: number = 50) => {
    try {
      if (!workspaceManager.configDir) {
        return successResponse([]);
      }

      const logPath = path.join(workspaceManager.configDir, 'mcp-access.jsonl');
      if (!fs.existsSync(logPath)) {
        return successResponse([]);
      }

      const content = fs.readFileSync(logPath, 'utf-8').trim();
      if (!content) return successResponse([]);

      const lines = content.split('\n');
      const entries = lines
        .slice(-limit)
        .map(line => {
          try { return JSON.parse(line); }
          catch { return null; }
        })
        .filter(Boolean)
        .reverse(); // Most recent first

      return successResponse(entries);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // Generate Claude Desktop config snippet
  ipcMain.handle('mcp:get-claude-desktop-config', async () => {
    try {
      if (!workspaceManager.workspacePath) {
        return errorResponse('No workspace loaded');
      }

      // Resolve the CLI path relative to the app
      const cliPath = path.resolve(
        path.dirname(process.execPath),
        '..', 'Resources', 'app', 'dist', 'backend', 'mcp', 'cli.js'
      );

      const config = {
        mcpServers: {
          cliobrain: {
            command: 'node',
            args: [cliPath, '--workspace', workspaceManager.workspacePath],
          },
        },
      };

      return successResponse(JSON.stringify(config, null, 2));
    } catch (error) {
      return errorResponse(error);
    }
  });

  // Generate Claude Code (VS Code) config snippet
  ipcMain.handle('mcp:get-claude-code-config', async () => {
    try {
      if (!workspaceManager.workspacePath) {
        return errorResponse('No workspace loaded');
      }

      const cliPath = path.resolve(
        path.dirname(process.execPath),
        '..', 'Resources', 'app', 'dist', 'backend', 'mcp', 'cli.js'
      );

      const config = {
        servers: {
          cliobrain: {
            command: 'node',
            args: [cliPath, '--workspace', workspaceManager.workspacePath],
          },
        },
      };

      return successResponse(JSON.stringify(config, null, 2));
    } catch (error) {
      return errorResponse(error);
    }
  });
}
