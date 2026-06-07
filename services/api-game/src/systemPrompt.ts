import type { Npc } from "./types.js";
import { FIRST_QUEST_DESCRIPTION } from "./questCatalog.js";

/**
 * System prompt envoye au LLM — IDENTIQUE pour le chat texte et le chat vocal.
 * Point unique d'assemblage : contexte de la prochaine quete + consigne d'usage du tool quest_next.
 */
export function buildSystemPrompt(npc: Npc): string {
  return [
    npc.systemPrompt,
    "",
    "Tu parles toujours naturellement au joueur ; n'ecris jamais de JSON ni de balise technique dans le chat.",
    "",
    "Mission disponible que tu peux confier au joueur :",
    FIRST_QUEST_DESCRIPTION,
    "Si le joueur demande une mission/quete, ou si c'est coherent avec la conversation, propose-lui cette mission de defense.",
    "Quand le joueur l'accepte (ou si tu decides de la lui confier), appelle l'outil 'quest_next' pour la lancer, puis confirme-lui en une phrase qu'il doit filer dans la foret, plus loin entre les arbres.",
  ].join("\n");
}
