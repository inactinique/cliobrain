import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { McpLogger } from '../logger.js';

describe('McpLogger', () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles) {
      try { fs.unlinkSync(f); } catch { /* ok */ }
    }
    tmpFiles.length = 0;
  });

  function tmpLogPath(): string {
    const p = path.join(os.tmpdir(), `mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
    tmpFiles.push(p);
    return p;
  }

  it('writes JSONL entries with timestamps', () => {
    const logPath = tmpLogPath();
    const logger = new McpLogger(logPath);
    logger.open();

    logger.log({
      type: 'tool',
      name: 'search_documents',
      input: { query: 'test query' },
      outputSummary: { itemCount: 5, totalChars: 1000 },
    });

    logger.close();

    const content = fs.readFileSync(logPath, 'utf-8').trim();
    const entry = JSON.parse(content);

    expect(entry.type).toBe('tool');
    expect(entry.name).toBe('search_documents');
    expect(entry.input.query).toBe('test query');
    expect(entry.outputSummary.itemCount).toBe(5);
    expect(entry.timestamp).toBeDefined();
    expect(new Date(entry.timestamp).getTime()).toBeGreaterThan(0);
  });

  it('appends multiple entries', () => {
    const logPath = tmpLogPath();
    const logger = new McpLogger(logPath);
    logger.open();

    logger.log({ type: 'tool', name: 'tool1', input: {}, outputSummary: {} });
    logger.log({ type: 'resource', name: 'res1', input: {}, outputSummary: {} });
    logger.log({ type: 'prompt', name: 'prompt1', input: {}, outputSummary: {} });

    logger.close();

    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(3);

    const entries = lines.map(l => JSON.parse(l));
    expect(entries[0].name).toBe('tool1');
    expect(entries[1].type).toBe('resource');
    expect(entries[2].type).toBe('prompt');
  });

  it('works without open() via direct append', () => {
    const logPath = tmpLogPath();
    const logger = new McpLogger(logPath);
    // Don't call open()

    logger.log({ type: 'tool', name: 'test', input: {}, outputSummary: {} });

    const content = fs.readFileSync(logPath, 'utf-8').trim();
    expect(JSON.parse(content).name).toBe('test');
  });

  it('includes client info when provided', () => {
    const logPath = tmpLogPath();
    const logger = new McpLogger(logPath);

    logger.log({
      type: 'tool',
      name: 'search',
      input: {},
      outputSummary: {},
      clientInfo: { name: 'Claude Desktop', version: '1.0' },
    });

    const entry = JSON.parse(fs.readFileSync(logPath, 'utf-8').trim());
    expect(entry.clientInfo.name).toBe('Claude Desktop');
  });
});
