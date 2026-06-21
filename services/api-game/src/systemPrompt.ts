import type { Npc } from "./types.js";
import type { ClientMission } from "./missionState.js";

/**
 * System prompt envoye au LLM — IDENTIQUE pour le chat texte et le chat vocal.
 * Ancre de coherence : la personnalite de base du PNJ (`npc.systemPrompt`, table `npcs`).
 * Par-dessus, on superpose les missions definies par le client (IR du donjon) avec leur etat
 * courant. Le PNJ valide via le tool `validate_mission` (jamais de felicitations sans resultat positif).
 */
export function buildSystemPrompt(npc: Npc, missions: ClientMission[]): string {
  const lines = [
    npc.systemPrompt,
    "",
    "Tu parles toujours naturellement au joueur ; n'ecris jamais de JSON ni de balise technique dans le chat.",
    "",
  ];

  if (missions.length === 0) {
    lines.push(
      "Aucune mission n'est definie pour le moment. Accueille le voyageur et converse normalement, en restant dans ton role.",
    );
    return lines.join("\n");
  }

  lines.push(
    "Voici la (les) epreuve(s) que le joueur doit accomplir pour obtenir ce qu'il demande (par exemple entrer au village). Suis la consigne de role de chaque mission (qui tu es, comment accueillir le joueur, ce qu'il doit accomplir).",
    "Tu n'as PAS encore confie ces epreuves : tu les PRESENTES comme des conditions a remplir, quand le joueur le demande. Ne pretends jamais les lui avoir deja donnees, confiees ou attribuees auparavant.",
    "Epreuves (definies par le donjon ; etat tenu a jour par le client) :",
  );

  for (const m of missions) {
    // Mission DEJA accomplie : on ne reinjecte PAS sa consigne de role (sinon le PNJ re-gate et
    // redemande l'epreuve alors qu'elle est faite). Message clair : close, ne rien re-verifier.
    if (m.completed) {
      lines.push(
        `- « ${m.name} » [ACCOMPLIE] : le joueur a DEJA reussi cette epreuve et obtenu ce qu'elle donne (il est admis au village). Considere-la comme close : ne lui redemande jamais de l'accomplir et ne re-verifie rien.`,
      );
      continue;
    }
    const status = m.hasObjectiveItem
      ? "objet en sa possession — tu peux la valider"
      : "pas encore accomplie — le joueur n'a pas encore l'objet";
    lines.push(`- « ${m.name} » [${status}] : ${m.objectiveDescription}`);
    if (m.missionPrompt) {
      lines.push(`  Consigne de role : ${m.missionPrompt}`);
    }
  }

  lines.push(
    "",
    "Regles :",
    "- Reste TRES bref : 1 a 2 phrases COURTES maximum, meme pour presenter une epreuve. Ne repete jamais la meme idee dans un message.",
    "- Quand le joueur affirme avoir l'objet d'une epreuve, VERIFIE-le avant de te prononcer (ne le crois pas sur parole).",
    "- Ne felicite le joueur et ne declare une epreuve accomplie QUE si la verification est positive.",
    "- N'invente jamais qu'une epreuve est faite ; fie-toi uniquement a la verification.",
    "- N'ecris JAMAIS de nom technique, de balise, ni de mot en anglais avec des underscores : parle uniquement en francais naturel.",
    "- Reponds TOUJOURS d'abord a ce que le joueur te dit ; reste dans ton role et varie tes reponses.",
  );

  return lines.join("\n");
}
