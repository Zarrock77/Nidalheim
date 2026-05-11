export interface AuthenticatedUser {
  id: string;
  sub: string;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type ChatChannel = "text" | "audio" | null;

export interface Npc {
  id: string;
  name: string;
  systemPrompt: string;
  voiceId: string | null;
  ttsModel: string | null;
  llmModel: string | null;
}
