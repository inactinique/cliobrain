/**
 * AgentOrchestrator - ReAct-style agent with tool-use loop
 *
 * Implements Reasoning + Acting: the LLM reasons about what to do,
 * calls tools, observes results, and iterates until it has an answer.
 */

import type { OllamaClient } from '../llm/OllamaClient.js';
import type { SearchResult } from '../../types/document.js';
import { getAgentSystemPrompt, type PromptLanguage } from '../llm/SystemPrompts.js';

export interface AgentTool {
  name: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface AgentStep {
  type: 'thought' | 'action' | 'observation' | 'answer';
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  durationMs?: number;
}

export interface AgentResult {
  answer: string;
  steps: AgentStep[];
  sources: SearchResult[];
  totalDurationMs: number;
  iterations: number;
}

const MAX_ITERATIONS = 5;

export class AgentOrchestrator {
  private ollamaClient: OllamaClient;
  private tools: Map<string, AgentTool> = new Map();
  private collectedSources: SearchResult[] = [];
  private language: PromptLanguage;

  constructor(ollamaClient: OllamaClient, language: PromptLanguage = 'fr') {
    this.ollamaClient = ollamaClient;
    this.language = language;
  }

  registerTool(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  async run(userQuery: string, conversationHistory?: string): Promise<AgentResult> {
    const startTime = Date.now();
    const steps: AgentStep[] = [];
    this.collectedSources = [];

    const systemPrompt = getAgentSystemPrompt(this.language);

    // Build initial prompt with conversation history
    let prompt = '';
    if (conversationHistory) {
      prompt += `Historique de la conversation :\n${conversationHistory}\n\n`;
    }
    prompt += `Question de l'utilisateur : ${userQuery}\n\n`;
    prompt += `Raisonne étape par étape. Utilise les outils si nécessaire.`;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      // Add previous steps to prompt
      if (steps.length > 0) {
        prompt += '\n\nÉtapes précédentes :\n';
        for (const step of steps) {
          if (step.type === 'thought') prompt += `Pensée : ${step.content}\n`;
          if (step.type === 'action') prompt += `Action : ${step.toolName}(${JSON.stringify(step.toolArgs)})\n`;
          if (step.type === 'observation') prompt += `Observation : ${step.content}\n`;
        }
        prompt += '\nContinue ton raisonnement :';
      }

      // Get LLM response
      let response: string;
      try {
        response = await this.ollamaClient.generateResponse(prompt, systemPrompt, {
          temperature: 0.1,
          num_predict: 1024,
        });
      } catch (e) {
        console.error('[Agent] LLM call failed:', e);
        break;
      }

      // Parse the response
      const parsed = this.parseAgentResponse(response);

      if (parsed.answer) {
        // Agent has a final answer
        steps.push({ type: 'thought', content: parsed.thought || '' });
        steps.push({ type: 'answer', content: parsed.answer });

        return {
          answer: parsed.answer,
          steps,
          sources: this.collectedSources,
          totalDurationMs: Date.now() - startTime,
          iterations: iteration + 1,
        };
      }

      if (parsed.action && parsed.actionInput) {
        // Agent wants to call a tool
        steps.push({ type: 'thought', content: parsed.thought || '' });

        const tool = this.tools.get(parsed.action);
        if (!tool) {
          steps.push({
            type: 'observation',
            content: `Outil "${parsed.action}" non disponible. Outils disponibles : ${Array.from(this.tools.keys()).join(', ')}`,
          });
          continue;
        }

        // Execute tool
        const toolStart = Date.now();
        try {
          const result = await tool.execute(parsed.actionInput);
          steps.push({
            type: 'action',
            content: `${parsed.action}(${JSON.stringify(parsed.actionInput)})`,
            toolName: parsed.action,
            toolArgs: parsed.actionInput,
            durationMs: Date.now() - toolStart,
          });
          steps.push({ type: 'observation', content: result });
        } catch (e) {
          steps.push({
            type: 'observation',
            content: `Erreur lors de l'exécution de ${parsed.action}: ${e}`,
          });
        }
      } else {
        // Couldn't parse — treat the response as a direct answer
        return {
          answer: response,
          steps,
          sources: this.collectedSources,
          totalDurationMs: Date.now() - startTime,
          iterations: iteration + 1,
        };
      }
    }

    // Max iterations reached — return best effort
    const lastThought = steps.filter(s => s.type === 'observation').pop();
    return {
      answer: lastThought?.content || 'Je n\'ai pas pu trouver une réponse complète avec les outils disponibles.',
      steps,
      sources: this.collectedSources,
      totalDurationMs: Date.now() - startTime,
      iterations: MAX_ITERATIONS,
    };
  }

  /**
   * Add sources collected during tool execution
   */
  addSources(sources: SearchResult[]): void {
    for (const source of sources) {
      if (!this.collectedSources.some(s => s.chunk.id === source.chunk.id)) {
        this.collectedSources.push(source);
      }
    }
  }

  /**
   * Parse the LLM's JSON response (with fallback for malformed output)
   */
  private parseAgentResponse(response: string): {
    thought?: string;
    action?: string;
    actionInput?: Record<string, unknown>;
    answer?: string;
  } {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          thought: parsed.thought,
          action: parsed.action,
          actionInput: parsed.action_input,
          answer: parsed.answer,
        };
      } catch {
        // JSON parse failed — try partial extraction
      }
    }

    // Fallback: try to extract thought/answer from plain text
    const thoughtMatch = response.match(/(?:thought|pensée|réflexion)\s*:\s*(.+?)(?:\n|$)/i);
    const answerMatch = response.match(/(?:answer|réponse|antwort)\s*:\s*([\s\S]+)/i);

    if (answerMatch) {
      return { thought: thoughtMatch?.[1], answer: answerMatch[1].trim() };
    }

    // If nothing parseable, treat the whole response as an answer
    return { answer: response.trim() };
  }
}
