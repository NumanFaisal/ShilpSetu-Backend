import fs from 'fs';
import { db } from '../prisma/db';
import { speechToTextService, type TranscriptionResult } from '../ai/speechToText';
import { llmService } from '../ai/llm';
import { HttpError } from '../lib/http-error';

export interface ExtractedProductAttributes {
  productName: string;
  material: string;
  craftType: string;
  size: string;
  description: string;
}

export interface VoiceProcessingResponse extends TranscriptionResult {
  extractedAttributes: ExtractedProductAttributes;
  voiceInputId?: number;
}

const EXTRACTION_PROMPT = `You will receive a transcript of someone describing an Indian artisan or handicraft product out loud.
Extract ONLY what they actually said into structured fields — do not invent, assume, or embellish anything not present in the transcript.

Return JSON only, with no markdown fences:
{
  "productName": string,      // short product name based on what they said
  "material": string,         // material/substance mentioned (e.g. Chanderi Silk, Terracotta, Dhokra Brass, Teakwood) — empty string if not mentioned
  "craftType": string,        // craft category/type of item based on transcript (e.g. Terracotta Pottery, Handloom Weaving, Metal Casting) — empty string if unclear
  "size": string,             // dimensions if mentioned, else ""
  "description": string       // 2-3 sentences using ONLY facts stated in the transcript, lightly cleaned up for grammar
}

Rules:
- If the transcript doesn't mention a craft, material, region, or origin, leave that field empty — never fabricate one.
- If the transcript is unclear, nonsensical, or too short to extract meaningful fields, reflect that honestly (short/empty fields) rather than guessing.`;

export class VoiceService {
  /**
   * Process an uploaded audio file (voice note) from an artisan.
   * Performs Speech-to-Text (Whisper), translation, and NLP extraction.
   */
  async processVoiceNote(
    audioSource: string | Buffer,
    originalName: string = 'recording.m4a',
    productId?: number
  ): Promise<VoiceProcessingResponse> {
    try {
      // 1. Audio transcription + translation
      const transcriptionResult = await speechToTextService.processAudio(audioSource, originalName);
      const textToExtract = transcriptionResult.englishTranscription || transcriptionResult.transcription;

      if (!textToExtract || !textToExtract.trim()) {
        throw new HttpError(400, 'Could not detect speech in the uploaded audio recording.');
      }

      // 2. Structured NLP extraction
      let extractedAttributes: ExtractedProductAttributes = {
        productName: '',
        material: '',
        craftType: '',
        size: '',
        description: textToExtract,
      };

      try {
        extractedAttributes = await llmService.generateJSON<ExtractedProductAttributes>([
          { role: 'system', content: EXTRACTION_PROMPT },
          { role: 'user', content: textToExtract },
        ], { temperature: 0.2 });

        if (!extractedAttributes.productName || !extractedAttributes.productName.trim()) {
          extractedAttributes.productName = textToExtract.split(/[.,!?\n]/)[0]?.slice(0, 40) || 'Artisan Product';
        }
      } catch (err: any) {
        console.warn(`[VoiceService] Attribute extraction fallback: ${err.message}`);
        extractedAttributes.productName = textToExtract.split(/[.,!?\n]/)[0]?.slice(0, 40) || 'Artisan Product';
        extractedAttributes.description = textToExtract;
      }

      let voiceInputId: number | undefined;

      // 3. Optional DB persistence if productId is provided
      if (productId && !isNaN(Number(productId))) {
        const prodId = Number(productId);
        const product = await db.orm.public.Product.where({ id: prodId }).all().first();
        if (product) {
          const record = await db.orm.public.VoiceInput.create({
            productId: prodId,
            audioUrl: typeof audioSource === 'string' ? audioSource : '',
            language: transcriptionResult.detectedLanguage,
            transcript: transcriptionResult.transcription,
          });
          voiceInputId = record.id;
        }
      }

      return {
        ...transcriptionResult,
        extractedAttributes,
        voiceInputId,
      };
    } finally {
      // Clean up temporary disk file if a string path was passed
      if (typeof audioSource === 'string') {
        fs.unlink(audioSource, () => {});
      }
    }
  }

  /**
   * Retrieve all voice inputs recorded for a given product.
   */
  async getVoiceInputsForProduct(productId: number) {
    return db.orm.public.VoiceInput.where({ productId }).all();
  }
}

export const voiceService = new VoiceService();
