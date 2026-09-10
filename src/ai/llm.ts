import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  temperature?: number;
  json?: boolean;
  model?: string;
  maxTokens?: number;
}

export class LLMService {
  private groqClient: OpenAI | null = null;
  private openaiClient: OpenAI | null = null;
  private geminiClient: GoogleGenAI | null = null;

  constructor() {
    if (env.GROQ_API_KEY) {
      this.groqClient = new OpenAI({
        apiKey: env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      });
    }

    if (env.OPENAI_API_KEY) {
      this.openaiClient = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
      });
    }

    if (env.GEMINI_API_KEY) {
      this.geminiClient = new GoogleGenAI({
        apiKey: env.GEMINI_API_KEY,
      });
    }
  }

  /**
   * Cleans and parses JSON from model output, handling markdown fences and formatting.
   */
  public parseJSON<T = any>(text: string): T {
    if (!text || typeof text !== 'string') {
      throw new Error('Cannot parse empty or non-string response as JSON');
    }

    const cleaned = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

    const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) {
      throw new Error(`No JSON object or array found in model response: ${text.slice(0, 200)}`);
    }

    return JSON.parse(match[0]) as T;
  }

  private cachedGroqModels: string[] | null = null;
  private lastGroqFetch = 0;

  private async getAvailableGroqModels(): Promise<string[]> {
    const now = Date.now();
    if (this.cachedGroqModels && now - this.lastGroqFetch < 1000 * 60 * 60) {
      return this.cachedGroqModels;
    }
    if (!this.groqClient) return [];

    try {
      const list = await this.groqClient.models.list();
      const chatModels = list.data
        .map((m) => m.id)
        .filter((id) => !id.includes('whisper') && !id.includes('embed') && !id.includes('tts'));

      if (chatModels.length > 0) {
        // Prioritize llama, qwen, mixtral, deepseek
        chatModels.sort((a, b) => {
          const score = (m: string) => {
            if (m.includes('llama-3.3')) return 10;
            if (m.includes('llama-4')) return 9;
            if (m.includes('llama-3.2')) return 8;
            if (m.includes('deepseek')) return 7;
            if (m.includes('qwen')) return 6;
            if (m.includes('mixtral')) return 5;
            return 1;
          };
          return score(b) - score(a);
        });

        this.cachedGroqModels = chatModels;
        this.lastGroqFetch = now;
        return chatModels;
      }
    } catch (err: any) {
      console.warn(`[LLM] Failed to query active Groq models: ${err.message}`);
    }

    return [
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'llama-3.3-70b-specdec',
      'llama-3.2-3b-preview',
      'llama-3.2-11b-vision-preview',
      'mixtral-8x7b-32768',
      'deepseek-r1-distill-llama-70b',
      'gemma2-9b-it',
      'qwen-qwq-32b',
    ];
  }

  /**
   * Execute chat completion with provider fallback: Groq -> OpenAI -> Gemini.
   */
  public async chatCompletion(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<string> {
    const temperature = options.temperature ?? 0.3;

    // 1. Try Groq first (high speed, free tier)
    if (this.groqClient) {
      try {
        const availableGroq = await this.getAvailableGroqModels();
        const modelsToTry: string[] = [];
        if (options.model) modelsToTry.push(options.model);
        for (const m of availableGroq) {
          if (!modelsToTry.includes(m)) modelsToTry.push(m);
        }

        for (const model of modelsToTry) {
          try {
            const response = await this.groqClient.chat.completions.create({
              model,
              messages: messages as any[],
              temperature,
              max_tokens: options.maxTokens || 2048,
              ...(options.json ? { response_format: { type: 'json_object' as const } } : {}),
            });

            const content = response.choices?.[0]?.message?.content;
            if (content) return content;
          } catch (modelErr: any) {
            console.warn(`[LLM] Groq model ${model} failed: ${modelErr.message}`);
          }
        }
      } catch (err: any) {
        console.warn(`[LLM] Groq completion failed: ${err.message}. Trying fallback...`);
      }
    }

    // 2. Try OpenAI
    if (this.openaiClient) {
      try {
        const model = options.model || 'gpt-4o-mini';
        const response = await this.openaiClient.chat.completions.create({
          model,
          messages: messages as any[],
          temperature,
          max_tokens: options.maxTokens || 2048,
          ...(options.json ? { response_format: { type: 'json_object' as const } } : {}),
        });

        const content = response.choices?.[0]?.message?.content;
        if (content) return content;
      } catch (err: any) {
        console.warn(`[LLM] OpenAI completion failed: ${err.message}. Trying fallback...`);
      }
    }

    // 3. Try Gemini
    if (this.geminiClient) {
      try {
        const systemMsg = messages.find((m) => m.role === 'system')?.content || '';
        const userMsg = messages
          .filter((m) => m.role !== 'system')
          .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
          .join('\n\n');

        const prompt = systemMsg ? `${systemMsg}\n\n${userMsg}` : userMsg;
        const geminiModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];

        for (const model of geminiModels) {
          try {
            const response = await this.geminiClient.models.generateContent({
              model,
              contents: prompt,
              config: {
                temperature,
                ...(options.json ? { responseMimeType: 'application/json' } : {}),
              },
            });

            const text =
              typeof response.text === 'function'
                ? response.text()
                : (response.text || response.candidates?.[0]?.content?.parts?.[0]?.text);

            if (text) return text;
          } catch (mErr: any) {
            console.warn(`[LLM] Gemini model ${model} failed: ${mErr.message}`);
          }
        }
      } catch (err: any) {
        console.warn(`[LLM] Gemini completion failed: ${err.message}`);
      }
    }

    throw new Error('All configured AI providers (Groq, OpenAI, Gemini) failed to generate response.');
  }

  /**
   * Execute chat completion and directly return parsed JSON object.
   */
  public async generateJSON<T = any>(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<T> {
    const raw = await this.chatCompletion(messages, { ...options, json: true });
    return this.parseJSON<T>(raw);
  }
}

export const llmService = new LLMService();
