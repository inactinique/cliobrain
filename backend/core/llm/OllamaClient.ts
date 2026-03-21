/**
 * OllamaClient - HTTP client for the Ollama API
 *
 * Handles embedding generation and chat response streaming.
 */

const MAX_TEXT_LENGTH = 2000;

export interface OllamaClientConfig {
  baseURL: string;
  embeddingModel: string;
  chatModel: string;
}

export class OllamaClient {
  private baseURL: string;
  private embeddingModel: string;
  private chatModel: string;

  constructor(config: OllamaClientConfig) {
    this.baseURL = config.baseURL.replace(/\/$/, '');
    this.embeddingModel = config.embeddingModel;
    this.chatModel = config.chatModel;
  }

  // ── Embeddings ──────────────────────────────────────────────────

  async generateEmbedding(text: string): Promise<Float32Array> {
    if (text.length <= MAX_TEXT_LENGTH) {
      return this.embedSingle(text);
    }

    // Split long text at sentence boundaries and average
    const chunks = this.chunkText(text, MAX_TEXT_LENGTH);
    const embeddings: Float32Array[] = [];

    for (const chunk of chunks) {
      embeddings.push(await this.embedSingle(chunk));
    }

    return this.averageEmbeddings(embeddings);
  }

  async generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
    const results: Float32Array[] = [];
    for (const text of texts) {
      results.push(await this.generateEmbedding(text));
    }
    return results;
  }

  private async embedSingle(text: string): Promise<Float32Array> {
    const response = await fetch(`${this.baseURL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embeddingModel, prompt: text }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return new Float32Array(data.embedding);
  }

  // ── Chat Generation ─────────────────────────────────────────────

  async generateResponse(
    prompt: string,
    systemPrompt?: string,
    options?: Record<string, unknown>
  ): Promise<string> {
    const response = await fetch(`${this.baseURL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.chatModel,
        prompt,
        system: systemPrompt,
        stream: false,
        options: {
          temperature: 0.1,
          top_p: 0.85,
          top_k: 40,
          repeat_penalty: 1.1,
          ...options,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama generation error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }

  async *generateResponseStream(
    prompt: string,
    systemPrompt?: string,
    options?: Record<string, unknown>,
    abortSignal?: AbortSignal
  ): AsyncGenerator<string, void, undefined> {
    const response = await fetch(`${this.baseURL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.chatModel,
        prompt,
        system: systemPrompt,
        stream: true,
        options: {
          temperature: 0.1,
          top_p: 0.85,
          top_k: 40,
          repeat_penalty: 1.1,
          ...options,
        },
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`Ollama stream error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.response) {
              yield json.response;
            }
            if (json.done) return;
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ── Utility ────────────────────────────────────────────────────

  async checkAvailability(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`);
      const data = await response.json();
      return (data.models || []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }

  private chunkText(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > maxLength) {
      // Find sentence boundary within the last 200 chars
      let splitIndex = maxLength;
      const lookback = remaining.substring(maxLength - 200, maxLength);
      const lastSentence = Math.max(
        lookback.lastIndexOf('. '),
        lookback.lastIndexOf('! '),
        lookback.lastIndexOf('? '),
        lookback.lastIndexOf('; ')
      );

      if (lastSentence > 0) {
        splitIndex = maxLength - 200 + lastSentence + 2;
      }

      chunks.push(remaining.substring(0, splitIndex));
      remaining = remaining.substring(splitIndex);
    }

    if (remaining.length > 0) {
      chunks.push(remaining);
    }

    return chunks;
  }

  private averageEmbeddings(embeddings: Float32Array[]): Float32Array {
    if (embeddings.length === 0) return new Float32Array(0);
    if (embeddings.length === 1) return embeddings[0];

    const dim = embeddings[0].length;
    const averaged = new Float32Array(dim);

    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) {
        averaged[i] += emb[i];
      }
    }

    const n = embeddings.length;
    for (let i = 0; i < dim; i++) {
      averaged[i] /= n;
    }

    return averaged;
  }
}
