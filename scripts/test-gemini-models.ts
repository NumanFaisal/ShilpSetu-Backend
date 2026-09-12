import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import 'dotenv/config';

async function testGeminiModels() {
  const imagePath = 'C:\\Users\\Numan Faisal\\.gemini\\antigravity-ide\\brain\\d7249d42-2ac1-41c8-9373-2fa91628c945\\.user_uploaded\\media_1789209388600.png';
  const imgBuffer = fs.readFileSync(imagePath);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const candidateModels = [
    'gemini-3.6-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ];

  for (const model of candidateModels) {
    try {
      console.log(`Testing model: ${model}...`);
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: imgBuffer.toString('base64'),
                  mimeType: 'image/png'
                }
              },
              {
                text: `Identify the craft object in this photo and formulate a 20-word AI prompt for a commercial photography background tailored to it (mentioning surface, lighting, and a soft blurred potted plant).
Return JSON:
{
  "detectedObject": "string",
  "backgroundPrompt": "string"
}`
              }
            ]
          }
        ]
      });
      console.log(`SUCCESS with ${model}! Response:\n`, response.text);
      return;
    } catch (err: any) {
      console.log(`Failed ${model}:`, err.message?.slice(0, 150));
    }
  }
}

testGeminiModels().catch(console.error);
