import OpenAI from "openai";

/**
 * Tool function-call expose au LLM du PNJ pour valider une mission.
 * Remplace l'ancien `quest_next` (qui lancait une quete de combat hardcodee).
 * Le PNJ l'appelle pour verifier que le joueur possede bien l'item-objectif avant de le feliciter ;
 * la verification est client-authoritative (booleen `hasObjectiveItem` pousse par le client).
 */
export const MISSION_VALIDATE_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "validate_mission",
    description:
      "Verifie que le joueur possede bien l'item-objectif d'une mission avant de le feliciter ou de le laisser entrer au village. " +
      "A appeler quand le joueur affirme avoir accompli une mission ou rapporte l'objet demande. " +
      "Ne felicite JAMAIS le joueur sans avoir appele cet outil et obtenu un resultat positif.",
    parameters: {
      type: "object",
      properties: {
        missionId: {
          type: "string",
          description:
            "Identifiant de la mission a valider. Optionnel : par defaut, la mission active (non terminee).",
        },
      },
      required: [],
    },
  },
};

/**
 * Tool appele par le PNJ au moment PRECIS ou il confie une mission au joueur pour la premiere fois.
 * Declenche l'event `mission_started` vers le client (HUD objectif visible, etat persiste dans l'IR).
 */
export const MISSION_START_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "start_mission",
    description:
      "A appeler des que tu presentes une epreuve/mission au joueur pour la premiere fois : " +
      "il demande quoi faire, veut entrer au village, propose son aide, ou la conversation y mene. Presenter = confier : appelle cet outil au meme tour, SANS attendre une acceptation explicite. " +
      "Ne l'appelle qu'une seule fois par mission ; jamais pour une mission deja confiee ou deja accomplie.",
    parameters: {
      type: "object",
      properties: {
        missionId: {
          type: "string",
          description:
            "Identifiant de la mission confiee. Optionnel : par defaut, la premiere mission pas encore confiee.",
        },
      },
      required: [],
    },
  },
};
