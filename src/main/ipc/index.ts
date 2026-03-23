/**
 * IPC Handlers Entry Point
 *
 * Centralizes registration of all IPC handlers organized by domain.
 */

import { setupConfigHandlers } from './handlers/config-handlers.js';
import { setupWorkspaceHandlers } from './handlers/workspace-handlers.js';
import { setupDocumentHandlers } from './handlers/document-handlers.js';
import { setupChatHandlers } from './handlers/chat-handlers.js';
import { setupSearchHandlers } from './handlers/search-handlers.js';
import { setupZoteroHandlers } from './handlers/zotero-handlers.js';
import { setupTropyHandlers } from './handlers/tropy-handlers.js';
import { setupFolderHandlers } from './handlers/folder-handlers.js';
import { setupVaultHandlers } from './handlers/vault-handlers.js';
import { setupGraphHandlers } from './handlers/graph-handlers.js';
import { setupHistoryHandlers } from './handlers/history-handlers.js';
import { setupFilesystemHandlers } from './handlers/filesystem-handlers.js';
import { setupMcpHandlers } from './handlers/mcp-handlers.js';

/**
 * Setup all IPC handlers
 *
 * Registers handlers for:
 * - Configuration and Ollama (5 handlers)
 * - Workspace management (6 handlers)
 * - Document ingestion and management (8 handlers)
 * - Search operations (3 handlers)
 * - Chat and RAG with sessions (6 handlers)
 * - Zotero integration (5 handlers)
 * - Tropy integration (4 handlers)
 * - Folder monitoring (4 handlers)
 * - Obsidian vault (13 handlers)
 * - Knowledge graph (4 handlers)
 * - History and sessions (5 handlers)
 * - Filesystem and dialogs (5 handlers)
 * - MCP server control (4 handlers)
 *
 * Total: ~65 IPC handlers
 */
export function setupIPCHandlers() {
  console.log('[ClioBrain] Setting up IPC handlers...');

  setupConfigHandlers();
  setupWorkspaceHandlers();
  setupDocumentHandlers();
  setupChatHandlers();
  setupSearchHandlers();
  setupZoteroHandlers();
  setupTropyHandlers();
  setupFolderHandlers();
  setupVaultHandlers();
  setupGraphHandlers();
  setupHistoryHandlers();
  setupFilesystemHandlers();
  setupMcpHandlers();

  console.log('[ClioBrain] All IPC handlers registered');
}
