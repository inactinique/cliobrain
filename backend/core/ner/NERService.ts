/**
 * NERService - LLM-based Named Entity Recognition
 *
 * Extracts entities (persons, places, dates, organizations, events, concepts)
 * from document chunks using Ollama. Multilingual (fr/en/de).
 */

import type { OllamaClient } from '../llm/OllamaClient.js';
import type { Entity, EntityType, EntityMention } from '../../types/entity.js';
import crypto from 'crypto';

const NER_PROMPT_FR = `Extrais les entités nommées du texte suivant. Retourne un tableau JSON avec les champs : name, type, mention_text.
Types possibles : PERSON, LOCATION, DATE, ORGANIZATION, EVENT, CONCEPT.

Texte :
---
{TEXT}
---

Réponds UNIQUEMENT avec un tableau JSON, sans explication :
[{"name": "...", "type": "...", "mention_text": "..."}]`;

const NER_PROMPT_EN = `Extract named entities from the following text. Return a JSON array with fields: name, type, mention_text.
Possible types: PERSON, LOCATION, DATE, ORGANIZATION, EVENT, CONCEPT.

Text:
---
{TEXT}
---

Reply ONLY with a JSON array, no explanation:
[{"name": "...", "type": "...", "mention_text": "..."}]`;

const NER_PROMPT_DE = `Extrahiere benannte Entitäten aus dem folgenden Text. Gib ein JSON-Array mit den Feldern zurück: name, type, mention_text.
Mögliche Typen: PERSON, LOCATION, DATE, ORGANIZATION, EVENT, CONCEPT.

Text:
---
{TEXT}
---

Antworte NUR mit einem JSON-Array, ohne Erklärung:
[{"name": "...", "type": "...", "mention_text": "..."}]`;

const PROMPTS: Record<string, string> = { fr: NER_PROMPT_FR, en: NER_PROMPT_EN, de: NER_PROMPT_DE };
const MAX_TEXT_LENGTH = 3000;

interface RawEntity {
  name: string;
  type: string;
  mention_text?: string;
}

export class NERService {
  private ollamaClient: OllamaClient;
  private language: string;

  constructor(ollamaClient: OllamaClient, language: string = 'fr') {
    this.ollamaClient = ollamaClient;
    this.language = language;
  }

  /**
   * Extract entities from a text chunk
   */
  async extractEntities(
    text: string,
    chunkId: string,
    documentId: string
  ): Promise<{ entities: Entity[]; mentions: EntityMention[] }> {
    const truncated = text.length > MAX_TEXT_LENGTH ? text.substring(0, MAX_TEXT_LENGTH) : text;
    const prompt = (PROMPTS[this.language] || PROMPTS.fr).replace('{TEXT}', truncated);

    let response: string;
    try {
      response = await this.ollamaClient.generateResponse(prompt, undefined, {
        temperature: 0,
        num_predict: 1024,
      });
    } catch (e) {
      console.error('[NER] LLM call failed:', e);
      return { entities: [], mentions: [] };
    }

    const rawEntities = this.parseResponse(response);
    const entities: Entity[] = [];
    const mentions: EntityMention[] = [];

    for (const raw of rawEntities) {
      if (!raw.name || !raw.type) continue;

      const entityType = this.normalizeType(raw.type);
      if (!entityType) continue;

      const normalizedName = this.normalizeName(raw.name);
      const entityId = crypto.createHash('md5').update(`${entityType}:${normalizedName}`).digest('hex');

      entities.push({
        id: entityId,
        name: raw.name,
        type: entityType,
        normalizedName,
        aliases: [],
        createdAt: new Date().toISOString(),
      });

      mentions.push({
        id: crypto.randomUUID(),
        entityId,
        chunkId,
        documentId,
        context: raw.mention_text || raw.name,
      });
    }

    // Deduplicate entities by ID
    const uniqueEntities = Array.from(
      new Map(entities.map(e => [e.id, e])).values()
    );

    return { entities: uniqueEntities, mentions };
  }

  /**
   * Parse the LLM JSON response with fallback
   */
  private parseResponse(response: string): RawEntity[] {
    // Try to extract JSON array from response
    const match = response.match(/\[[\s\S]*\]/);
    if (!match) return [];

    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Try line-by-line JSON objects
      try {
        const objects: RawEntity[] = [];
        const lines = response.split('\n');
        for (const line of lines) {
          const objMatch = line.match(/\{[^}]+\}/);
          if (objMatch) {
            objects.push(JSON.parse(objMatch[0]));
          }
        }
        return objects;
      } catch {
        // Give up
      }
    }

    return [];
  }

  /**
   * Normalize entity type string to our enum
   */
  private normalizeType(type: string): EntityType | null {
    const upper = type.toUpperCase().trim();
    const valid: EntityType[] = ['PERSON', 'LOCATION', 'DATE', 'ORGANIZATION', 'EVENT', 'CONCEPT'];
    if (valid.includes(upper as EntityType)) return upper as EntityType;

    // Common aliases
    if (upper === 'PER' || upper === 'PERSONNE') return 'PERSON';
    if (upper === 'LOC' || upper === 'LIEU' || upper === 'GPE' || upper === 'PLACE') return 'LOCATION';
    if (upper === 'ORG') return 'ORGANIZATION';
    if (upper === 'EVT' || upper === 'ÉVÉNEMENT') return 'EVENT';

    return null;
  }

  /**
   * Normalize entity name for deduplication
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
