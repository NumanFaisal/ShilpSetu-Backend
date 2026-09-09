import { llmService } from './llm';

export interface TranslationResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export class TranslationService {
  /**
   * Translate text into specified target language (e.g., 'hi' for Hindi, 'en' for English).
   */
  public async translateText(
    text: string,
    targetLanguage: 'hi' | 'en' | string = 'hi'
  ): Promise<string> {
    if (!text || !text.trim()) return '';

    const targetLangName =
      targetLanguage === 'hi'
        ? 'Hindi (शुद्ध एवं सहज व्यावसायिक हिंदी)'
        : targetLanguage === 'en'
        ? 'Professional English suitable for e-commerce'
        : targetLanguage;

    const prompt = `You are a professional multilingual translator for Indian handicrafts and artisan products.
Translate the following text into ${targetLangName}.
Preserve cultural and craft-specific terminology accurately (e.g. Zari, Madhubani, Terracotta, Ikat, Chanderi).
Return ONLY the direct translation, no notes, explanations, or quotes.`;

    try {
      const result = await llmService.chatCompletion([
        { role: 'system', content: prompt },
        { role: 'user', content: text },
      ], { temperature: 0.2 });

      return result.trim();
    } catch (err: any) {
      console.warn(`[Translation] Translation failed: ${err.message}. Returning original.`);
      return text;
    }
  }

  /**
   * Generate dual English and Hindi content for title and description.
   */
  public async generateDualLanguageContent(
    title: string,
    description: string
  ): Promise<{
    titleEn: string;
    titleHi: string;
    descriptionEn: string;
    descriptionHi: string;
  }> {
    const prompt = `You are an expert bilingual catalog copywriter for Indian artisans.
Given a product title and description, produce professional versions in both English and Hindi.

Input:
Title: ${title}
Description: ${description}

Return JSON only:
{
  "titleEn": "SEO friendly English title (under 70 chars)",
  "titleHi": "आकर्षक एवं प्रामाणिक हिंदी शीर्षक",
  "descriptionEn": "Polished 2-3 sentence English description highlighting craft authenticity",
  "descriptionHi": "शिल्प की प्रामाणिकता और विशेषता दर्शाने वाला 2-3 वाक्यों का हिंदी विवरण"
}`;

    try {
      return await llmService.generateJSON<{
        titleEn: string;
        titleHi: string;
        descriptionEn: string;
        descriptionHi: string;
      }>([
        { role: 'system', content: prompt },
        { role: 'user', content: 'Generate bilingual titles and descriptions.' },
      ]);
    } catch (err) {
      return {
        titleEn: title,
        titleHi: title,
        descriptionEn: description,
        descriptionHi: description,
      };
    }
  }
}

export const translationService = new TranslationService();
