import type { Npc } from "./types.js";

/**
 * System prompt envoye au LLM — IDENTIQUE pour le chat texte et le chat vocal.
 * Point unique d'assemblage : c'est ici qu'on branchera le contexte de quete / les tools.
 */
export function buildSystemPrompt(npc: Npc): string {
  return [
    npc.systemPrompt,
    "",
    "Tu parles toujours naturellement au joueur ; n'ecris jamais de JSON ni de balise technique dans le chat.",
  ].join("\n");
}
