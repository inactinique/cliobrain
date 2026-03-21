# ClioBrain

Brainstorming assistant for historians. Chat with your documents, Obsidian notes, and research sources.

## Tech Stack

- **Desktop**: Electron 28 + React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS v4
- **State**: Zustand
- **Database**: SQLite (better-sqlite3)
- **Vector Search**: hnswlib-node (HNSW ANN) + BM25 (natural)
- **LLM**: Ollama (nomic-embed-text for embeddings, configurable chat model)
- **Validation**: Zod
- **i18n**: i18next (fr/en/de)

## Project Structure

```
src/main/          → Electron main process (services, IPC handlers)
src/preload/       → Preload script (typed API bridge)
src/renderer/src/  → React UI (components, stores, i18n)
backend/core/      → Business logic (ingestion, search, RAG, graph, NER)
backend/types/     → Shared TypeScript types
backend/integrations/ → External integrations (Zotero, Tropy, folders)
```

## Development

```bash
npm run dev:full    # Starts main, preload, renderer + Electron
npm run build       # Builds all targets
npm run build:all   # Build + electron-builder package
npm test            # Run vitest
```

## Key Architecture Decisions

- **3 TypeScript configs**: tsconfig.json (renderer/bundler), tsconfig.node.json (main+backend), tsconfig.preload.json (CommonJS)
- **IPC pattern**: 12 handler modules registered in `src/main/ipc/index.ts`, ~65 channels
- **Preload whitelist**: Only approved channels pass through `contextBridge`
- **Services are singletons**: `documentService`, `vaultService`, `chatService`, `configManager`, `workspaceManager`
- **Workspace-scoped**: Database (`brain.db`), HNSW index, and config live in `.cliobrain/` per workspace
- **Obsidian replaces notes**: No built-in note editor. Vault is read-only browsed + exported to.

## Search Pipeline

Query → Ollama embedding → HybridSearch (HNSW dense 60% + BM25 sparse 40%, RRF K=60) → ContextCompressor (3-level) → LLM generation

## Obsidian Integration

- `ObsidianVaultReader`: scans .md files, builds tree, watches via chokidar
- `ObsidianMarkdownParser`: extracts frontmatter, [[wikilinks]], #tags, headings
- `ObsidianVaultIndexer`: section-aware chunking at headings, batch embedding
- `ObsidianExporter`: chat messages → vault .md files with YAML frontmatter
- Wikilinks become graph edges; tags become CONCEPT entity nodes

## Conventions

- French is the default language (for prompts, UI, comments)
- Source types: `file`, `zotero`, `tropy`, `folder`, `obsidian-note`
- Embedding dimension: 768 (nomic-embed-text default)
- Chunk target: ~500 words with sentence boundary overlap
