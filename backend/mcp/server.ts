/**
 * ClioBrain MCP Server
 *
 * Exposes the ClioBrain corpus as tools, resources, and prompts
 * via the Model Context Protocol (stdio transport).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpConfig } from './config.js';
import type { McpServices } from './services.js';
import { McpLogger } from './logger.js';

// Phase 2: Tools
import { registerSearchDocuments } from './tools/searchDocuments.js';
import { registerExploreGraph } from './tools/exploreGraph.js';
import { registerSearchZotero } from './tools/searchZotero.js';
import { registerSearchObsidian } from './tools/searchObsidian.js';
import { registerGetEntityContext } from './tools/getEntityContext.js';

// Phase 3: Resources
import { registerWorkspaceStats } from './resources/workspaceStats.js';
import { registerWorkspaceTags } from './resources/workspaceTags.js';
import { registerWorkspaceRecent } from './resources/workspaceRecent.js';

// Phase 4: Prompts
import { registerSerendipity } from './prompts/serendipity.js';
import { registerHistorioCheck } from './prompts/historioCheck.js';

// Version matches package.json
const VERSION = '0.1.0';

export interface ClioBrainMcpServer {
  server: McpServer;
  logger: McpLogger;
}

/**
 * Create and configure the MCP server with all tools registered.
 */
export function createMcpServer(config: McpConfig, services: McpServices): ClioBrainMcpServer {
  const server = new McpServer({
    name: 'cliobrain',
    version: VERSION,
  });

  // Initialize access logger
  const logger = new McpLogger(config.logPath);
  logger.open();

  // --- Phase 2: Tools ---
  registerSearchDocuments(server, services, logger);
  registerExploreGraph(server, services, logger);
  registerSearchZotero(server, services, logger);
  registerSearchObsidian(server, services, logger);
  registerGetEntityContext(server, services, logger);

  // --- Phase 3: Resources ---
  registerWorkspaceStats(server, services, logger);
  registerWorkspaceTags(server, services, logger);
  registerWorkspaceRecent(server, services, logger);

  // --- Phase 4: Prompts ---
  registerSerendipity(server, services, logger);
  registerHistorioCheck(server, services, logger);

  console.error(`[ClioBrain MCP] Server created for workspace: ${config.workspace.name}`);
  console.error(`[ClioBrain MCP] Data dir: ${config.dataDir}`);
  console.error(`[ClioBrain MCP] Log: ${config.logPath}`);
  console.error(`[ClioBrain MCP] Tools: search_documents, explore_graph, search_zotero, search_obsidian, get_entity_context`);
  console.error(`[ClioBrain MCP] Resources: workspace/stats, workspace/tags, workspace/recent`);
  console.error(`[ClioBrain MCP] Prompts: serendipity, historiographical_check`);

  return { server, logger };
}
