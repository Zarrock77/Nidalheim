import { buildFirstCombatQuest } from "./questCatalog.js";
import type { QuestStore } from "./questStore.js";
import type { QuestData } from "./questTypes.js";

// Verrou in-process par joueur : les canaux texte et vocal tournent dans le meme processus,
// deux tours concurrents ne doivent pas pouvoir creer la quete en double (le questId etant
// aleatoire, l'unique (user_id, quest_id) ne dedupliquerait pas).
const launchesInFlight = new Set<string>();

/**
 * Lance la 1re quete de combat pour ce joueur si aucune quete n'est deja en cours.
 * La quete est creee directement au statut 'accepted' : le joueur vient de l'accepter
 * en conversation avec le PNJ (c'est ce qui declenche le tool quest_next).
 * Retourne null si une quete est deja ouverte ou en cours de lancement.
 */
export async function tryLaunchFirstQuest(
  questStore: QuestStore,
  userId: string,
  npcId: string | undefined,
): Promise<QuestData | null> {
  if (launchesInFlight.has(userId)) return null;
  launchesInFlight.add(userId);
  try {
    if (await questStore.hasOpenQuest(userId)) return null;
    const quest = buildFirstCombatQuest(npcId);
    await questStore.createOffered(userId, quest, npcId ?? null);
    await questStore.acceptQuest(userId, quest.questId);
    return quest;
  } finally {
    launchesInFlight.delete(userId);
  }
}
