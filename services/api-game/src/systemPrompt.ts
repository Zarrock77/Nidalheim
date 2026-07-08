import type { Npc } from "./types.js";
import type { ClientMission, ClientInventoryItem } from "./missionState.js";

/**
 * System prompt envoye au LLM — IDENTIQUE pour le chat texte et le chat vocal.
 * Ancre de coherence : la personnalite de base du PNJ (`npc.systemPrompt`, table `npcs`).
 * Par-dessus : les missions definies par le client (IR du donjon) avec leur etat courant
 * (confiee / en cours / accomplie), puis l'inventaire REEL du joueur (fouille, `inventory_sync`).
 * Le PNJ confie une mission via un tool dedie (event `mission_started` -> HUD client) et valide
 * via `validate_mission` (jamais de felicitations sans resultat positif).
 */
export function buildSystemPrompt(
  npc: Npc,
  missions: ClientMission[],
  inventory: ClientInventoryItem[] = [],
): string {
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
  } else {
    lines.push(
      "Voici la (les) epreuve(s) liees au donjon. Suis la consigne de role de chaque mission (qui tu es, comment accueillir le joueur, ce qu'il doit accomplir).",
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
      const status = m.started
        ? (m.hasObjectiveItem
            ? "CONFIEE, objet en sa possession : tu peux la valider"
            : "CONFIEE, en cours : le joueur n'a pas encore l'objet")
        : (m.hasObjectiveItem
            ? "PAS ENCORE CONFIEE, mais le joueur possede DEJA l'objet (deniche en explorant)"
            : "PAS ENCORE CONFIEE : tu ne la lui as jamais donnee");
      lines.push(`- « ${m.name} » [${status}] : ${m.objectiveDescription}`);
      if (m.missionPrompt) {
        lines.push(`  Consigne de role : ${m.missionPrompt}`);
      }
      if (m.started) {
        lines.push(
          "  Deja confiee : tu peux lui en reparler naturellement, mais ne la presente jamais comme une nouveaute.",
        );
      } else {
        lines.push(
          "  PRESENTER CETTE EPREUVE = LA CONFIER : des que la conversation s'y prete (le joueur demande quoi faire, veut entrer au village, propose son aide, ou te questionne sur l'epreuve), declenche l'outil prevu pour confier une epreuve PUIS presente-la brievement. N'attends pas une acceptation explicite, et ne decris jamais l'epreuve sans avoir appele l'outil. Si le joueur porte ou mentionne l'objet de cette epreuve, confie-la IMMEDIATEMENT (meme outil) puis verifie et valide dans la foulee. Et si le joueur te montre ou mentionne N'IMPORTE quel butin du donjon alors qu'une epreuve n'est pas encore confiee : reagis (lore) PUIS enchaine en confiant cette epreuve dans le MEME tour (meme outil de confie).",
        );
      }
    }
  }

  // Fouille : le PNJ (ancien du village, il a eu affaire aux occupants du donjon) voit TOUT ce que
  // porte le joueur. Les objets marques [butin du donjon] sont les seuls qu'il peut confisquer ;
  // leur lore (histoire de l'objet) lui est connu.
  lines.push("", "INVENTAIRE DU JOUEUR (tu le fouilles du regard, tu sais toujours ce qu'il porte) :");
  if (inventory.length === 0) {
    lines.push("- (rien pour le moment)");
  } else {
    for (const it of inventory) {
      const tag = it.dungeon ? " [butin du donjon]" : " [equipement personnel]";
      lines.push(`- ${it.name} x${it.qty}${tag}`);
      if (it.dungeon && it.lore) {
        lines.push(`  Ce que tu sais de cet objet : ${it.lore}`);
      }
    }
  }

  lines.push(
    "",
    "Regles :",
    "- Reste TRES bref : 1 a 2 phrases COURTES maximum, meme pour presenter une epreuve. Ne repete jamais la meme idee dans un message.",
    "- L'inventaire ci-dessus est la VERITE : ne pretends jamais que le joueur a ou n'a pas un objet en contradiction avec lui.",
    "- Tu peux commenter les objets [butin du donjon] que tu vois sur le joueur (tu connais leur histoire) ; fais-le sobrement et seulement quand c'est pertinent.",
    "- Tu ne peux confisquer QUE les objets [butin du donjon]. L'[equipement personnel] du joueur est intouchable : tu ne le prends jamais, quoi qu'il arrive.",
    "- Ne promets et n'invente JAMAIS d'epreuve hors de la liste ci-dessus ; s'il n'y a rien de nouveau a confier, dis-le simplement.",
    "- Ne confie une epreuve qu'une seule fois ; une epreuve deja confiee ne se re-presente pas comme une nouveaute.",
    "- Quand le joueur affirme avoir l'objet d'une epreuve, VERIFIE-le avant de te prononcer (ne le crois pas sur parole).",
    "- Ne felicite le joueur et ne declare une epreuve accomplie QUE si la verification est positive.",
    "- N'invente jamais qu'une epreuve est faite ; fie-toi uniquement a la verification.",
    "- N'ecris JAMAIS de nom technique, de balise, ni de mot en anglais avec des underscores : parle uniquement en francais naturel.",
    "- Reponds TOUJOURS d'abord a ce que le joueur te dit ; reste dans ton role et varie tes reponses.",
  );

  return lines.join("\n");
}
