/**
 * MCP access logger
 *
 * Append-only JSONL log of all MCP interactions.
 * Each line records what was shared with an external model, when, and by which client.
 * This is the "contre-archivage" mechanism: the historian can audit their own AI usage.
 *
 * Uses synchronous writes — MCP interactions are low volume and
 * reliability matters more than throughput for an audit log.
 */

import fs from 'fs';

export interface McpLogEntry {
  timestamp: string;
  /** 'tool' | 'resource' | 'prompt' */
  type: 'tool' | 'resource' | 'prompt';
  /** Name of the tool, resource URI, or prompt name */
  name: string;
  /** Input parameters (the request) */
  input: Record<string, unknown>;
  /** Summary of what was returned (not the content itself) */
  outputSummary: {
    itemCount?: number;
    totalChars?: number;
    truncated?: boolean;
  };
  /** Client info if available from MCP protocol */
  clientInfo?: {
    name?: string;
    version?: string;
  };
}

export class McpLogger {
  private logPath: string;
  private opened = false;

  constructor(logPath: string) {
    this.logPath = logPath;
  }

  /** Mark the logger as ready */
  open(): void {
    this.opened = true;
  }

  /** Log an MCP interaction (synchronous append) */
  log(entry: Omit<McpLogEntry, 'timestamp'>): void {
    const fullEntry: McpLogEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };

    const line = JSON.stringify(fullEntry) + '\n';
    fs.appendFileSync(this.logPath, line, 'utf-8');
  }

  /** Close the logger */
  close(): void {
    this.opened = false;
  }
}
