import type { Npc } from "./types.js";
import type { QuestChatState } from "./questStore.js";
import { FIRST_QUEST_DESCRIPTION } from "./questCatalog.js";

/**
 * System prompt envoye au LLM — IDENTIQUE pour le chat texte et le chat vocal.
 * Point unique d'assemblage : contexte de quete + consigne d'usage du tool quest_next.
 * `questState` reflete l'etat reel (table quests) : le PNJ ne propose la mission que si
 * rien n'est en cours ('none'), la rappelle sans la relancer ('open'), et felicite ('done').
 */
export function buildSystemPrompt(npc: Npc, questState: QuestChatState): string {
  const lines = [
    npc.systemPrompt,
    "",
    "Tu parles toujours naturellement au joueur ; n'ecris jamais de JSON ni de balise technique dans le chat.",
    "",
  ];

  switch (questState) {
    case "open":
      lines.push(
        "Le joueur a DEJA recu la mission de defense du village (repousser les pilleurs dans la foret) : elle est en cours.",
        "Ne lui propose PAS de nouvelle mission et ne relance jamais celle-ci.",
        "Reponds TOUJOURS d'abord a ce que le joueur te dit ; ne ramene pas la conversation a la mission s'il ne t'en parle pas.",
        "S'il te parle de la mission, rappelle-lui simplement l'objectif : les pilleurs sont dans la foret, plus loin entre les arbres.",
        "Pour tout le reste, converse normalement, en restant dans ton role et en variant tes reponses.",
      );
      break;
    case "done":
      lines.push(
        "Le joueur a DEJA accompli la mission de defense du village : les pilleurs de la foret ont ete repousses.",
        "S'il te parle de la mission, felicite-le pour sa victoire.",
        "Il n'y a pas de nouvelle mission disponible pour le moment ; s'il en redemande une, dis-le-lui simplement.",
        "Pour tout le reste, converse normalement, en restant dans ton role et en variant tes reponses.",
      );
      break;
    case "none":
      lines.push(
        "Mission que tu peux confier au joueur s'il se montre volontaire :",
        FIRST_QUEST_DESCRIPTION,
        "Reponds TOUJOURS d'abord a ce que le joueur te dit ; ne ramene pas chaque sujet a cette mission.",
        "Tu peux evoquer ton inquietude au sujet des pilleurs quand c'est naturel, sans insister a chaque message.",
        "N'appelle l'outil 'quest_next' QUE si le joueur demande une mission/quete ou accepte explicitement d'aider contre les pilleurs — jamais de ta propre initiative.",
        "Apres avoir appele l'outil, confirme en une phrase qu'il doit filer dans la foret, plus loin entre les arbres.",
      );
      break;
  }

  return lines.join("\n");
}
