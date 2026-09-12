import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import 'dotenv/config';

async function testGeminiAndGroqVision() {
  const imagePath = 'C:\\Users\\Numan Faisal\\.gemini\\antigravity-ide\\brain\\d7249d42-2ac1-41c8-9373-2fa91628c945\\.user_uploaded\\media_1789209388600.png';
  const imgBuffer = fs.readFileSync(imagePath);

  console.log('Testing Gemini Vision...');
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
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
              text: `You are an expert commercial product photographer and art director.
Look at the craft product in this photo.
Identify the object, its craft, materials, colors, and form.
Formulate a concise 15-25 word prompt for an AI background generator to create the most complementary, photorealistic commercial lifestyle background for this specific product (including surface, lighting, and complementary decorative elements like a soft blurred potted plant).
Return JSON:
{
  "detectedObject": "string",
  "craftMaterial": "string",
  "backgroundPrompt": "string"
}`
            }
          ]
        }
      ]
    });
    console.log('Gemini 2.5 Flash Result:\n', response.text);
  } catch (err: any) {
    console.log('Gemini 2.5 Flash error:', err.message);
  }

  console.log('\nTesting Groq Llama 3.2 Vision...');
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.2-11b-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this handcrafted product. Identify the object and formulate a 20-word AI background generation prompt tailored to it with surface, soft lighting, and complementary blurred elements. Return JSON { "detectedObject": "...", "backgroundPrompt": "..." }' },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${imgBuffer.toString('base64')}`
                }
              }
            ]
          }
        ],
        response_format: { type: 'json_object' }
      })
    });
    console.log('Groq status:', groqRes.status);
    const data: any = await groqRes.json();
    console.log('Groq result:', data.choices?.[0]?.message?.content || data);
  } catch (err: any) {
    console.log('Groq error:', err.message);
  }
}

testGeminiAndGroqVision().catch(console.error);
