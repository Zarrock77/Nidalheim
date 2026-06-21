import type { MissionState } from "./missionState.js";

export interface ValidateMissionOutcome {
  /** Texte renvoye au LLM (resultat du tool). */
  toolResult: string;
  /** Mission concernee (null si aucune resolue). */
  missionId: string | null;
  /** true si le joueur possede l'item-objectif (ou mission deja accomplie). */
  ok: boolean;
}

/**
 * Logique partagee texte + vocal du tool `validate_mission`.
 * Resout la mission (par id, sinon la mission active) et se fie au booleen client-authoritative
 * `hasObjectiveItem` pour decider de la validation. Ne mute pas l'etat : le client re-sync
 * `completed` apres avoir recu le `mission_validation_result`.
 */
export function handleValidateMission(state: MissionState, argsJson: string): ValidateMissionOutcome {
  let requestedId: string | undefined;
  try {
    const parsed = JSON.parse(argsJson || "{}") as { missionId?: unknown };
    if (typeof parsed.missionId === "string" && parsed.missionId.trim()) {
      requestedId = parsed.missionId.trim();
    }
  } catch {
    /* args vides ou invalides -> on prend la mission active */
  }

  // Resolution tolerante : le modele passe parfois le NOM au lieu de l'id, ou un id inconnu.
  // On tente id, puis nom, puis on retombe sur la mission active (la validation est de toute
  // facon client-authoritative, basee sur l'inventaire reel).
  let mission = requestedId
    ? state.find(requestedId) ?? state.all().find((m) => m.name.toLowerCase() === requestedId!.toLowerCase())
    : undefined;
  if (!mission) mission = state.active();

  if (!mission) {
    return {
      toolResult: requestedId
        ? `Aucune mission "${requestedId}" n'est connue. Ne valide rien et ne felicite pas le joueur.`
        : "Aucune mission active a valider. Ne felicite pas le joueur.",
      missionId: requestedId ?? null,
      ok: false,
    };
  }

  if (mission.completed) {
    return {
      toolResult: `La mission "${mission.name}" est deja accomplie. Tu peux le feliciter a nouveau brievement.`,
      missionId: mission.id,
      ok: true,
    };
  }

  if (mission.hasObjectiveItem) {
    return {
      toolResult:
        `VALIDE : le joueur a bien en sa possession l'objet requis pour la mission "${mission.name}". ` +
        "Tu PRENDS l'objet des mains du joueur et tu le dis a voix haute (par exemple « Je te prends ce lingot d'or »), " +
        "puis tu le felicites brievement, declares la mission accomplie et le laisses entrer au village.",
      missionId: mission.id,
      ok: true,
    };
  }

  return {
    toolResult:
      `NON VALIDE : le joueur n'a PAS encore l'objet requis pour la mission "${mission.name}". ` +
      "Dis-lui qu'il doit d'abord aller le recuperer et te le rapporter ; ne le felicite pas et ne le laisse pas entrer.",
    missionId: mission.id,
    ok: false,
  };
}
