import fs from 'fs';
import OpenAI, { toFile } from 'openai';
import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';

export interface TranscriptionResult {
  transcription: string;
  englishTranscription: string;
  detectedLanguage: string;
}

function resolveAudioMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'webm':
      return 'audio/webm';
    case 'wav':
      return 'audio/wav';
    case 'mp3':
    case 'mpeg':
      return 'audio/mpeg';
    case 'ogg':
      return 'audio/ogg';
    case 'flac':
      return 'audio/flac';
    case 'mp4':
      return 'audio/mp4';
    case 'aac':
      return 'audio/aac';
    default:
      return 'audio/m4a';
  }
}

export class SpeechToTextService {
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
   * Transcribes an audio file or buffer, returning both the original language transcript
   * and an auto-translated professional English version, with detected language.
   *
   * Supported languages: Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Hinglish, etc.
   * Multi-provider cascade: Groq Whisper -> OpenAI Whisper -> Gemini Multimodal Audio
   */
  public async processAudio(
    audioSource: string | Buffer,
    originalName: string = 'recording.m4a'
  ): Promise<TranscriptionResult> {
    const mimeType = resolveAudioMimeType(originalName);

    let audioBuffer: Buffer;
    if (typeof audioSource === 'string') {
      if (!fs.existsSync(audioSource)) {
        throw new Error(`Audio file not found at path: ${audioSource}`);
      }
      audioBuffer = fs.readFileSync(audioSource);
    } else {
      audioBuffer = audioSource;
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Audio recording is empty (0 bytes). Please speak clearly into the microphone.');
    }

    const errors: string[] = [];

    // ─── 1. Try Groq Whisper (high speed, free tier) ──────────────────────────
    if (this.groqClient) {
      try {
        const fileInput = await toFile(audioBuffer, originalName, { type: mimeType });
        const rawTranscription = await this.groqClient.audio.transcriptions.create({
          file: fileInput,
          model: 'whisper-large-v3',
        });

        const originalText = rawTranscription.text?.trim() || '';
        const detectedLanguage = (rawTranscription as any).language || 'unknown';

        if (originalText) {
          let englishText = originalText;
          try {
            const translationFileInput = await toFile(audioBuffer, originalName, { type: mimeType });
            const translation = await this.groqClient.audio.translations.create({
              file: translationFileInput,
              model: 'whisper-large-v3',
            });
            if (translation.text?.trim()) {
              englishText = translation.text.trim();
            }
          } catch (tErr: any) {
            console.warn(`[STT] Groq translation note: ${tErr.message}. Using raw transcript.`);
          }

          return {
            transcription: originalText,
            englishTranscription: englishText,
            detectedLanguage,
          };
        }
      } catch (err: any) {
        console.warn(`[STT] Groq Whisper failed: ${err.message}. Trying next provider...`);
        errors.push(`Groq: ${err.message}`);
      }
    }

    // ─── 2. Try OpenAI Whisper (if configured) ──────────────────────────────
    if (this.openaiClient) {
      try {
        const fileInput = await toFile(audioBuffer, originalName, { type: mimeType });
        const rawTranscription = await this.openaiClient.audio.transcriptions.create({
          file: fileInput,
          model: 'whisper-1',
        });

        const originalText = rawTranscription.text?.trim() || '';
        const detectedLanguage = (rawTranscription as any).language || 'unknown';

        if (originalText) {
          let englishText = originalText;
          try {
            const translationFileInput = await toFile(audioBuffer, originalName, { type: mimeType });
            const translation = await this.openaiClient.audio.translations.create({
              file: translationFileInput,
              model: 'whisper-1',
            });
            if (translation.text?.trim()) {
              englishText = translation.text.trim();
            }
          } catch (tErr: any) {
            console.warn(`[STT] OpenAI translation note: ${tErr.message}`);
          }

          return {
            transcription: originalText,
            englishTranscription: englishText,
            detectedLanguage,
          };
        }
      } catch (err: any) {
        console.warn(`[STT] OpenAI Whisper failed: ${err.message}. Trying next provider...`);
        errors.push(`OpenAI: ${err.message}`);
      }
    }

    // ─── 3. Try Gemini Multimodal Audio (Native Audio Understanding) ────────
    if (this.geminiClient) {
      const geminiModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-3.6-flash'];
      for (const model of geminiModels) {
        try {
          const response = await this.geminiClient.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: audioBuffer.toString('base64'),
                    },
                  },
                  {
                    text: `You are an expert multilingual speech-to-text transcriber for Indian languages (Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Hinglish, etc.).
Listen carefully to the audio clip of the artisan speaking.
Return strictly a JSON object with:
- "transcription": The exact transcription in the spoken Indian language (e.g. Devanagari, Tamil, Telugu script or Hinglish as spoken).
- "englishTranscription": Professional, clear English translation of what was said.
- "detectedLanguage": Two-letter ISO language code (e.g. "hi", "te", "ta", "mr", "gu", "bn", "en").

Return ONLY JSON with no markdown formatting:
{
  "transcription": "string",
  "englishTranscription": "string",
  "detectedLanguage": "string"
}`,
                  },
                ],
              },
            ],
            config: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          });

          const responseText =
            typeof response.text === 'function'
              ? response.text()
              : (response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '');

          const cleaned = responseText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
          const match = cleaned.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            if (parsed.transcription && parsed.transcription.trim()) {
              return {
                transcription: parsed.transcription.trim(),
                englishTranscription: (parsed.englishTranscription || parsed.transcription).trim(),
                detectedLanguage: parsed.detectedLanguage || 'hi',
              };
            }
          }
        } catch (mErr: any) {
          console.warn(`[STT] Gemini model ${model} failed: ${mErr.message}`);
          errors.push(`Gemini(${model}): ${mErr.message}`);
        }
      }
    }

    throw new Error(
      `Speech-to-Text transcription failed across all providers: ${errors.join(' | ') || 'No STT provider configured'}`
    );
  }
}

export const speechToTextService = new SpeechToTextService();
