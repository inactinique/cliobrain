# Plan d'implémentation : serveur MCP pour ClioBrain

## Contexte

ClioBrain est un assistant de brainstorming pour historiens, construit avec Electron + React + TypeScript + Vite. Il indexe des documents locaux (PDFs, notes Obsidian, références Zotero, images) et permet un chat local via Ollama.

L'objectif est d'ajouter une couche MCP (Model Context Protocol) pour que ClioBrain puisse servir de source de données à des modèles frontier externes (Claude Desktop, Claude Code dans VS Code, ou tout client MCP compatible). Cela permet de combiner l'indexation locale (souveraineté des données) avec la puissance de raisonnement d'un modèle distant — tout en gardant le contrôle sur ce qui sort de la machine.

**Principe éthique fondamental** : le serveur MCP est inactif par défaut. L'utilisateur l'active explicitement. Chaque appel est loggé localement (quels fragments envoyés, quand, à quel client). La connexion est révocable à tout moment.

## Prérequis

- Installer le SDK TypeScript MCP : `npm install @modelcontextprotocol/sdk`
- Zod est déjà dans les dépendances du projet (validation des schémas)

## Architecture cible

```
backend/
  mcp/
    server.ts          → Point d'entrée du serveur MCP (McpServer + transport stdio)
    tools/
      searchDocuments.ts   → Recherche hybride dans le corpus indexé
      exploreGraph.ts      → Navigation dans le graphe de connaissances
      searchZotero.ts      → Recherche dans les références Zotero
      searchObsidian.ts    → Recherche dans le vault Obsidian (tags, wikilinks)
      getEntityContext.ts  → Contexte complet d'une entité NER
    resources/
      workspaceStats.ts    → Statistiques du workspace
      workspaceTags.ts     → Tags et concepts avec fréquences
      workspaceRecent.ts   → Documents récemment modifiés
    prompts/
      serendipity.ts       → Template de brainstorming par connexions inattendues
      historioCheck.ts     → Confrontation d'une hypothèse au corpus
    logger.ts              → Journal local de toutes les interactions MCP
    config.ts              → Configuration et activation/désactivation du serveur
src/main/
  ipc/
    mcpHandlers.ts         → Canaux IPC pour contrôler le serveur MCP depuis l'UI
src/renderer/src/
  components/
    McpPanel.tsx           → Interface de contrôle du serveur MCP (on/off, logs)
```

## Phase 1 : Squelette du serveur MCP

### 1.1 — Créer `backend/mcp/server.ts`

Ce fichier initialise le serveur MCP avec le SDK TypeScript officiel.

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
```

- Créer une instance `McpServer` avec le nom `"cliobrain"`, version tirée du `package.json`.
- Déclarer les capabilities : `tools: {}`, `resources: {}`, `prompts: {}`.
- Le transport est **stdio** (stdin/stdout) : le serveur tourne comme un processus Node local que le client MCP lance.
- Le serveur doit accepter un argument `--workspace` pour savoir quel workspace ClioBrain ouvrir (chemin vers le dossier `.cliobrain/`).

### 1.2 — Créer `backend/mcp/config.ts`

- Lire la configuration du workspace via le `configManager` existant.
- Ajouter une clé de configuration `mcp.enabled` (boolean, défaut `false`).
- Ajouter une clé `mcp.logPath` (chemin vers le fichier de log MCP, défaut `.cliobrain/mcp-access.jsonl`).

### 1.3 — Créer `backend/mcp/logger.ts`

Journal local au format JSONL (une ligne JSON par interaction). Chaque entrée contient :
- `timestamp` (ISO 8601)
- `tool` ou `resource` appelé
- `input` (les paramètres de la requête)
- `output_summary` (nombre de chunks renvoyés, taille totale, PAS le contenu — pour éviter la duplication de données)
- `client_info` (si disponible via le protocole MCP)

Ce logger est crucial : il permet à l'utilisateur de savoir exactement ce qui a été partagé avec un modèle externe.

## Phase 2 : Les tools (actions)

Chaque tool est un fichier qui exporte une fonction d'enregistrement prenant le `McpServer` en paramètre. Utiliser Zod pour les schémas d'entrée (le SDK MCP supporte Zod nativement).

### 2.1 — `tools/searchDocuments.ts`

**Objectif** : Recherche hybride dans tout le corpus indexé.

**Paramètres d'entrée** (schéma Zod) :
- `query` (string, requis) — la requête en langage naturel
- `limit` (number, optionnel, défaut 10) — nombre max de résultats
- `sourceTypes` (array de strings, optionnel) — filtrer par type : `file`, `zotero`, `tropy`, `folder`, `obsidian-note`
- `minScore` (number, optionnel, défaut 0.3) — score minimum de pertinence

**Implémentation** : appeler le pipeline de recherche hybride existant (HybridSearch : HNSW dense 60% + BM25 sparse 40%, RRF K=60), puis le ContextCompressor à 3 niveaux. Réutiliser directement les services de `backend/core/`.

**Sortie** : tableau d'objets contenant :
- `content` (le texte du chunk)
- `source` (nom du fichier/note/référence d'origine)
- `sourceType` (file, zotero, obsidian-note, etc.)
- `score` (score de pertinence)
- `metadata` (auteur, date, tags si disponibles)

### 2.2 — `tools/exploreGraph.ts`

**Objectif** : Navigation dans le graphe de connaissances Graphology.

**Paramètres d'entrée** :
- `entity` (string, requis) — nom de l'entité ou du concept à explorer
- `depth` (number, optionnel, défaut 1) — profondeur de traversée (1 = voisins directs, 2 = voisins des voisins)
- `maxNodes` (number, optionnel, défaut 20) — limite de nœuds renvoyés
- `mode` (enum, optionnel) — `"neighbors"` (défaut), `"community"` (communauté Louvain), `"path"` (chemin entre deux entités)
- `target` (string, optionnel) — pour le mode `"path"`, l'entité cible

**Implémentation** : utiliser les méthodes Graphology existantes dans `backend/core/graph`. Pour le mode `community`, appeler la détection Louvain. Pour le mode `path`, utiliser un parcours BFS/Dijkstra.

**Sortie** : objet contenant :
- `nodes` (tableau d'entités avec type, fréquence, communauté)
- `edges` (tableau de relations avec poids et type)
- `communities` (si mode community : les clusters identifiés)

### 2.3 — `tools/searchZotero.ts`

**Objectif** : Interroger les références Zotero du workspace.

**Paramètres d'entrée** :
- `query` (string, optionnel) — recherche textuelle
- `author` (string, optionnel) — filtrer par auteur
- `tags` (array de strings, optionnel) — filtrer par tags Zotero
- `collection` (string, optionnel) — nom de la collection
- `year` (number, optionnel) — année de publication
- `limit` (number, optionnel, défaut 20)

**Implémentation** : utiliser l'intégration Zotero existante dans `backend/integrations/`.

**Sortie** : tableau de références avec titre, auteurs, année, tags, DOI/URL si disponible, et les annotations/notes associées.

### 2.4 — `tools/searchObsidian.ts`

**Objectif** : Recherche structurelle dans le vault Obsidian.

**Paramètres d'entrée** :
- `query` (string, optionnel) — texte libre
- `tags` (array de strings, optionnel) — filtrer par #tags
- `linkedTo` (string, optionnel) — notes liées via [[wikilinks]] à cette note
- `frontmatterKey` (string, optionnel) — clé de frontmatter à chercher
- `frontmatterValue` (string, optionnel) — valeur correspondante
- `limit` (number, optionnel, défaut 20)

**Implémentation** : utiliser `ObsidianVaultReader` et `ObsidianMarkdownParser` existants.

**Sortie** : tableau de notes avec titre, chemin, tags, wikilinks sortants, extrait du contenu, frontmatter.

### 2.5 — `tools/getEntityContext.ts`

**Objectif** : Contexte complet d'une entité NER (personne, lieu, concept, événement).

**Paramètres d'entrée** :
- `entity` (string, requis) — nom de l'entité
- `entityType` (string, optionnel) — `PERSON`, `LOCATION`, `CONCEPT`, `EVENT`, etc.

**Implémentation** : croiser NER existant, graphe de connaissances, et recherche dans les chunks indexés.

**Sortie** :
- `occurrences` (nombre de mentions dans le corpus)
- `documents` (les documents où l'entité apparaît, avec extraits)
- `related_entities` (entités voisines dans le graphe, avec type de relation)
- `tags` (tags Obsidian/Zotero associés)

## Phase 3 : Les resources (données en lecture seule)

Les resources MCP sont des URI que le client peut consulter. Elles fournissent du contexte au modèle sans qu'il ait besoin d'appeler un tool.

### 3.1 — `resources/workspaceStats.ts`

**URI** : `cliobrain://workspace/stats`

**Contenu** : objet JSON avec :
- Nombre total de documents indexés (par type)
- Nombre de notes Obsidian
- Nombre de références Zotero
- Nombre d'entités dans le graphe
- Nombre de chunks dans l'index vectoriel
- Date de dernière indexation
- Langues détectées dans le corpus

### 3.2 — `resources/workspaceTags.ts`

**URI** : `cliobrain://workspace/tags`

**Contenu** : tableau de `{ tag: string, count: number, type: "obsidian" | "zotero" | "ner" }`, trié par fréquence décroissante. Permet au modèle de connaître l'univers conceptuel du corpus.

### 3.3 — `resources/workspaceRecent.ts`

**URI** : `cliobrain://workspace/recent`

**Contenu** : les 20 documents les plus récemment ajoutés ou modifiés, avec titre, type, date de modification, et un extrait (100 premiers mots). Permet au modèle de savoir ce qui est "frais" dans la réflexion de l'utilisateur.

## Phase 4 : Les prompts (templates de brainstorming)

Les prompts MCP sont des templates que le client peut proposer à l'utilisateur. Ils structurent l'interaction.

### 4.1 — `prompts/serendipity.ts`

**Nom** : `serendipity`
**Description** : "Découvrir des connexions inattendues dans le corpus de recherche"

**Arguments** :
- `theme` (string, requis) — le thème ou la question de départ
- `scope` (enum, optionnel) — `"corpus_only"` (chercher uniquement dans le corpus), `"corpus_and_beyond"` (croiser corpus et connaissances générales du modèle)

**Messages générés** :
```
Rôle système : Tu es un interlocuteur de brainstorming pour un historien. 
Ton objectif est de produire des connexions inattendues et fécondes — pas des résumés.

L'utilisateur travaille sur le thème : {theme}

Voici les éléments pertinents trouvés dans son corpus de recherche :
[résultat de search_documents sur le thème]

Voici la carte conceptuelle autour de ce thème :
[résultat de explore_graph sur le thème]

Instructions : 
1. Identifie des rapprochements non évidents entre les éléments du corpus.
2. Propose au moins une connexion avec un champ ou un concept extérieur au corpus.
3. Formule des questions que l'historien ne s'est peut-être pas encore posées.
4. Sois spéculatif mais rigoureux — chaque suggestion doit être argumentable.
```

### 4.2 — `prompts/historioCheck.ts`

**Nom** : `historiographical_check`
**Description** : "Confronter une hypothèse de travail au corpus de recherche"

**Arguments** :
- `hypothesis` (string, requis) — l'hypothèse à tester
- `strictness` (enum, optionnel) — `"exploratory"` (chercher large), `"strict"` (chercher des contradictions directes)

**Messages générés** :
```
L'utilisateur soumet l'hypothèse suivante : {hypothesis}

Voici les éléments du corpus qui pourraient être pertinents :
[résultat de search_documents sur l'hypothèse]

Instructions :
1. Classe les éléments trouvés en trois catégories : 
   éléments qui soutiennent, qui contredisent, qui nuancent l'hypothèse.
2. Identifie les lacunes : quels types de sources manquent dans le corpus 
   pour tester cette hypothèse correctement ?
3. Suggère des reformulations de l'hypothèse si les sources invitent à la nuancer.
```

## Phase 5 : Intégration dans Electron

### 5.1 — Point d'entrée standalone

Créer un script `backend/mcp/cli.ts` qui peut être lancé indépendamment d'Electron :

```bash
node dist/backend/mcp/cli.js --workspace /chemin/vers/mon/workspace
```

Ce script :
1. Initialise les services ClioBrain (SQLite, HNSW, etc.) pour le workspace donné
2. Crée le serveur MCP
3. Enregistre tous les tools, resources et prompts
4. Connecte le transport stdio
5. Commence à écouter

C'est ce script que Claude Desktop ou Claude Code appellera.

### 5.2 — Configuration Claude Desktop

Après le build, l'utilisateur ajoute dans sa config Claude Desktop (`claude_desktop_config.json`) :

```json
{
  "mcpServers": {
    "cliobrain": {
      "command": "node",
      "args": [
        "/chemin/vers/cliobrain/dist/backend/mcp/cli.js",
        "--workspace",
        "/chemin/vers/mon/workspace"
      ]
    }
  }
}
```

### 5.3 — Configuration Claude Code (VS Code)

Dans `.vscode/mcp.json` ou dans les settings VS Code :

```json
{
  "servers": {
    "cliobrain": {
      "command": "node",
      "args": [
        "/chemin/vers/cliobrain/dist/backend/mcp/cli.js",
        "--workspace",
        "/chemin/vers/mon/workspace"
      ]
    }
  }
}
```

### 5.4 — Interface UI dans Electron (optionnel, Phase 5 seulement)

Ajouter un panneau `McpPanel.tsx` dans l'interface ClioBrain qui :
- Montre si le serveur MCP est configuré et actif
- Affiche le log des interactions MCP en temps réel (lu depuis `.cliobrain/mcp-access.jsonl`)
- Permet de visualiser quels fragments ont été partagés
- Offre un bouton pour copier la configuration Claude Desktop/Code

## Phase 6 : Tests

### 6.1 — Tests unitaires

Pour chaque tool, écrire un test avec vitest qui :
- Crée un workspace temporaire avec des données de test
- Appelle le tool avec des paramètres connus
- Vérifie la structure et la cohérence de la sortie

### 6.2 — Test d'intégration avec MCP Inspector

Le SDK MCP fournit un outil d'inspection : `npx @modelcontextprotocol/inspector`. L'utiliser pour vérifier que :
- Le serveur démarre correctement
- Les tools sont listés avec leurs schémas
- Les resources sont accessibles
- Les prompts sont disponibles

Ajouter un script dans `package.json` :
```json
"mcp:inspect": "npx @modelcontextprotocol/inspector node dist/backend/mcp/cli.js -- --workspace ./test-workspace"
```

### 6.3 — Test end-to-end avec Claude Desktop

Test manuel :
1. Configurer Claude Desktop avec le serveur ClioBrain
2. Ouvrir une conversation
3. Demander : "Quels sont les documents récents dans mon corpus ?" → devrait appeler `workspace://recent`
4. Demander : "Cherche dans mes notes tout ce qui concerne [un sujet présent dans le workspace]" → devrait appeler `search_documents`
5. Vérifier que le log MCP a enregistré les interactions

## Ordre d'implémentation recommandé

1. **Phase 1** (squelette) — en premier, pour avoir un serveur qui démarre
2. **Phase 2.1** (`searchDocuments`) — le tool le plus important, tester immédiatement avec MCP Inspector
3. **Phase 3.1** (`workspaceStats`) — la resource la plus simple, pour valider le pattern
4. **Phase 5.1 + 5.2** (CLI + config Claude Desktop) — tester le flux complet avec un vrai client
5. **Phase 1.3** (logger) — dès que le flux fonctionne, ajouter le logging
6. **Phase 2.2 à 2.5** (autres tools) — un par un
7. **Phase 3.2, 3.3** (autres resources)
8. **Phase 4** (prompts) — les prompts dépendent des tools, donc en dernier
9. **Phase 5.4** (UI) — optionnel, quand tout le reste fonctionne
10. **Phase 6** (tests formels)

## Notes techniques

- **tsconfig** : le serveur MCP tourne dans le même contexte Node que le main process Electron. Utiliser `tsconfig.node.json` existant pour la compilation.
- **Singletons** : les services (`documentService`, `vaultService`, etc.) sont des singletons. Le CLI MCP doit les initialiser dans le bon ordre, comme le fait le main process Electron.
- **Chunks** : l'embedding dimension est 768 (nomic-embed-text). Le chunking cible ~500 mots avec overlap aux limites de phrases. Ces paramètres ne changent pas.
- **i18n** : le serveur MCP peut fonctionner en français (langue par défaut de ClioBrain). Les descriptions des tools et prompts doivent être en anglais (convention MCP pour l'interopérabilité), mais les contenus renvoyés sont dans la langue du corpus.

## Note sur la sécurité et l'éthique

Ce serveur MCP est conçu pour un usage personnel sur une machine locale. Le transport stdio garantit que la communication ne passe pas par le réseau. Les données ne quittent la machine que sous forme de réponses aux requêtes du client MCP — c'est-à-dire des fragments de texte pertinents, pas le corpus entier.

Le logger (`mcp-access.jsonl`) constitue un dispositif de **contre-archivage** : l'utilisateur conserve la trace de ce qui a été partagé avec un modèle externe, quand, et dans quel contexte. C'est un choix épistémologique autant que technique — l'historien qui utilise un outil IA doit pouvoir retracer son propre usage.

Le serveur est **substituable** : MCP est un protocole ouvert, le jour où un modèle européen ou open-source supporte MCP comme client, il suffit de changer la configuration du client sans toucher au serveur. L'architecture de ClioBrain ne dépend d'aucun fournisseur de modèle spécifique.
