export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

export const GROQ_TEXT_MODEL = "openai/gpt-oss-120b";
export const GROQ_VISION_MODEL = "qwen/qwen3.6-27b";
export const GROQ_WHISPER_MODEL = "whisper-large-v3-turbo";

export function stripJsonFences(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export function extractJsonObject(content: string): string {
  const stripped = stripJsonFences(content);
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) return stripped.slice(start, end + 1);
  return stripped;
}
