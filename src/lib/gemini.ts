export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
export const GEMINI_VISION_MODEL = "gemini-2.5-flash";

export function geminiGenerateUrl(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

export function textFromGeminiResponse(data: unknown): string {
  const response = data as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  return (
    response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}
