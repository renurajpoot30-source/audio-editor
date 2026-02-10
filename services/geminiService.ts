
import { GoogleGenAI, Type } from "@google/genai";
import { AIAnalysis } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const analyzeAudio = async (audioBase64: string, mimeType: string): Promise<AIAnalysis> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: audioBase64,
              mimeType: mimeType,
            },
          },
          {
            text: "Analyze this audio carefully. Provide a transcription (if speech exists), describe the acoustic characteristics, identify noise levels, and provide 3 specific professional audio engineering suggestions for enhancement. Format the output as JSON."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcript: { type: Type.STRING },
            sentiment: { type: Type.STRING },
            enhancementSuggestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            noiseLevel: { type: Type.STRING, description: "Low, Medium, or High" },
            audioQualityScore: { type: Type.NUMBER, description: "0 to 100 score" }
          },
          required: ["transcript", "sentiment", "enhancementSuggestions", "noiseLevel", "audioQualityScore"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    return result as AIAnalysis;
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    throw error;
  }
};

export const getAIAssistantAdvice = async (history: { role: string, text: string }[], userPrompt: string) => {
  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: "You are a world-class audio engineer and producer. Give concise, technical, and practical advice on audio editing, mixing, and mastering. Be professional and supportive."
    }
  });

  // Simplified history mapping for standard prompt
  const result = await chat.sendMessage({ message: userPrompt });
  return result.text;
};
