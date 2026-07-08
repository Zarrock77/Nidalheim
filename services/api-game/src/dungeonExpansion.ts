import OpenAI from "openai";

/**
 * Generation LLM de l'EXTENSION du donjon : les pilleurs creusent de nouvelles salles DERRIERE les
 * salles ou le joueur a recupere du butin (ancres), y postent des gardes et y cachent une nouvelle
 * mission + des secrets. Le LLM emet un fragment d'IR au MEME format JSON que slice.json ; le client
 * (UE5) le fusionne, le valide et regenere le donjon. Ici : prompt + appel + validation de forme.
 */

export interface CatalogItem {
  id: string;
  name: string;
}

export interface ExpansionResult {
  ok: boolean;
  extension?: unknown;
  error?: string;
}

const ALLOWED_ROLES = new Set(["Junction", "Combat", "SetPiece", "Sanctuary", "Objective"]);

type AnyObj = Record<string, unknown>;

// Les FName UE perdent leur casse d'origine selon l'ordre de chargement (client packate:
// "id" devient "iD") -> on renormalise TOUTES les cles vers la casse canonique du schema.
const CANONICAL_KEYS = [
  "id", "role", "intent", "spatialSignature", "cellAssigned", "cell", "x", "y",
  "from", "to", "gateLockId", "lockId", "nodeId", "guardian", "killed", "unlocked",
  "faction", "budget", "name", "objectiveItemId", "objectiveItemName", "objectiveDescription",
  "missionPrompt", "objectiveNodeId", "started", "completed", "itemId", "quantity", "offset",
  "lorePrompt", "collected", "motif", "nodes", "links", "keys", "encounters", "missions", "secrets",
];
const CANON_BY_LOWER = new Map(CANONICAL_KEYS.map((k) => [k.toLowerCase(), k]));

export function canonicalizeKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalizeKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[CANON_BY_LOWER.get(k.toLowerCase()) ?? k] = canonicalizeKeys(val);
    }
    return out;
  }
  return v;
}

function asArray(v: unknown): AnyObj[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as AnyObj[]) : [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Ancres d'expansion : salles ou le joueur a RECUPERE quelque chose (missions accomplies + secrets pris). */
function computeAnchors(plan: AnyObj): string[] {
  const anchors = new Set<string>();
  for (const m of asArray(plan.missions)) {
    if (m.completed === true && str(m.objectiveNodeId)) anchors.add(str(m.objectiveNodeId));
  }
  for (const s of asArray(plan.secrets)) {
    if (s.collected === true && str(s.nodeId)) anchors.add(str(s.nodeId));
  }
  return [...anchors];
}

/** Vue COMPACTE du plan pour le prompt : structure + etat de pillage, sans les gros textes
 * (missionPrompt/lore/descriptions) -> prompt bien plus court, moins de rate-limit. */
function compactPlanView(plan: AnyObj): AnyObj {
  return {
    nodes: asArray(plan.nodes).map((n) => ({ id: n.id, role: n.role })),
    links: asArray(plan.links).map((l) => ({ from: l.from, to: l.to, gateLockId: l.gateLockId ?? "" })),
    keys: asArray(plan.keys).map((k) => ({ lockId: k.lockId, nodeId: k.nodeId })),
    missions: asArray(plan.missions).map((m) => ({
      id: m.id, objectiveItemId: m.objectiveItemId, objectiveNodeId: m.objectiveNodeId, completed: m.completed === true,
    })),
    secrets: asArray(plan.secrets).map((x) => ({ id: x.id, itemId: x.itemId, nodeId: x.nodeId, collected: x.collected === true })),
    encounters: asArray(plan.encounters).map((e) => ({ nodeId: e.nodeId, budget: e.budget })),
  };
}

function buildPrompt(plan: AnyObj, items: CatalogItem[], anchors: string[], wave: number): string {
  const nodeIds = asArray(plan.nodes).map((n) => str(n.id)).filter(Boolean);
  const lockIds = asArray(plan.keys).map((k) => str(k.lockId)).filter(Boolean);
  const missionIds = asArray(plan.missions).map((m) => str(m.id)).filter(Boolean);
  const secretIds = asArray(plan.secrets).map((s) => str(s.id)).filter(Boolean);
  const prefix = `w${wave}_`;

  return [
    "Tu es le generateur de donjon du jeu Nidalheim (dark fantasy nordique).",
    "LORE : les occupants du donjon sont des PILLEURS qui cachent leur butin vole. Le joueur vient de recuperer des objets dans certaines salles ; les pilleurs s'en rendent compte, CREUSENT de nouvelles salles plus profondes derriere ces salles pour securiser le reste du butin, et y postent des gardes.",
    "",
    "PLAN ACTUEL DU DONJON (structure, JSON, ne le repete pas) :",
    JSON.stringify(compactPlanView(plan)),
    "",
    `SALLES ANCRES (pillees par le joueur, tu DOIS accrocher les nouvelles salles derriere L'UNE d'elles) : ${anchors.join(", ")}`,
    `ITEMS UTILISABLES (seuls itemId/objectiveItemId autorises) : ${items.map((i) => `${i.id} (${i.name})`).join(", ")}`,
    `IDS DEJA PRIS (n'en reutilise AUCUN) : salles [${nodeIds.join(", ")}], locks [${lockIds.join(", ")}], missions [${missionIds.join(", ")}], secrets [${secretIds.join(", ")}]`,
    `PREFIXE OBLIGATOIRE de tous tes nouveaux ids : ${prefix}`,
    "",
    "GENERE une extension avec EXACTEMENT cette forme JSON (aucun autre texte) :",
    "{",
    '  "nodes": [ { "id": "...", "role": "Junction|Combat|SetPiece|Sanctuary|Objective" } ],',
    '  "links": [ { "from": "...", "to": "...", "gateLockId": "" } ],',
    '  "keys": [ { "lockId": "...", "nodeId": "...", "guardian": "draugr" } ],',
    '  "encounters": [ { "nodeId": "...", "faction": "raiders", "budget": 1 } ],',
    '  "missions": [ { "id": "...", "name": "...", "objectiveItemId": "...", "objectiveItemName": "...", "objectiveDescription": "...", "missionPrompt": "...", "objectiveNodeId": "..." } ],',
    '  "secrets": [ { "id": "...", "itemId": "...", "quantity": 1, "nodeId": "...", "lorePrompt": "..." } ]',
    "}",
    "",
    "CONTRAINTES STRICTES :",
    "- 2 ou 3 nouvelles salles, en CHAINE derriere UNE salle ancre : premier lien { from: <ancre>, to: <nouvelle salle 1> }, puis salle 1 -> salle 2, etc.",
    "- La salle la plus profonde a le role Objective et porte l'objectif de la nouvelle mission : objectiveNodeId = l'id de CETTE NOUVELLE salle (jamais une salle deja existante du plan).",
    "- Verrouille le PREMIER lien (celui qui part de l'ancre) avec un nouveau gateLockId. Ajoute UNE entree keys pour ce lock : le gardien porteur est poste dans la salle ANCRE (nodeId = l'ancre), c'est un pilleur qui garde le chantier.",
    "- Les autres liens ont gateLockId vide (\"\").",
    "- EXACTEMENT 1 mission, ENCHAINEE narrativement avec le butin deja recupere par le joueur (missions accomplies et secrets collected=true du plan) : la description et le missionPrompt y font reference. objectiveItemId parmi les items autorises, mais JAMAIS l'objet d'une mission precedente (varie les objectifs). name court. objectiveItemName = nom affiche de l'objet. objectiveDescription = 1-2 phrases (ce qu'il faut recuperer et ou). missionPrompt = consigne de role pour Olaf le gardien du village (3-4 phrases : coherent avec le lore pilleurs, il demande de rapporter l'objet, ferme mais bienveillant).",
    "- 1 ou 2 secrets, caches dans les nouvelles salles NON-Objective de preference. itemId parmi les items autorises. lorePrompt = 1-2 phrases : histoire de l'objet vole (Olaf, ancien du village, la connait).",
    "- 1 ou 2 encounters (gardes pilleurs, budget 1 ou 2) dans les nouvelles salles.",
    "- Tout le texte en FRANCAIS. JSON STRICT uniquement, aucun champ d'etat (pas de started/completed/collected/killed/unlocked/cell).",
  ].join("\n");
}

/** Supprime les champs d'etat que le LLM n'a pas le droit de poser (le client est la verite). */
function sanitize(ext: AnyObj): void {
  for (const n of asArray(ext.nodes)) { delete n.cellAssigned; delete n.cell; }
  for (const l of asArray(ext.links)) { delete l.unlocked; }
  for (const k of asArray(ext.keys)) { delete k.killed; }
  for (const e of asArray(ext.encounters)) { delete e.killed; }
  for (const m of asArray(ext.missions)) { delete m.started; delete m.completed; }
  for (const s of asArray(ext.secrets)) {
    delete s.collected;
    const q = Number(s.quantity);
    s.quantity = Number.isFinite(q) && q >= 1 ? Math.floor(q) : 1;
  }
}

/** Validation de FORME (le client re-valide le plan fusionne en profondeur). null = OK, sinon message. */
function validateExtension(ext: AnyObj, plan: AnyObj, items: CatalogItem[], anchors: string[]): string | null {
  const oldNodeIds = new Set(asArray(plan.nodes).map((n) => str(n.id)));
  const oldLockIds = new Set(asArray(plan.keys).map((k) => str(k.lockId)));
  const oldMissionIds = new Set(asArray(plan.missions).map((m) => str(m.id)));
  const oldSecretIds = new Set(asArray(plan.secrets).map((s) => str(s.id)));
  const itemIds = new Set(items.map((i) => i.id));

  const nodes = asArray(ext.nodes);
  if (nodes.length < 1 || nodes.length > 4) return `nodes: ${nodes.length} (attendu 1-4)`;
  const newNodeIds = new Set<string>();
  for (const n of nodes) {
    const id = str(n.id);
    if (!id) return "node sans id";
    if (oldNodeIds.has(id) || newNodeIds.has(id)) return `node id duplique: ${id}`;
    if (!ALLOWED_ROLES.has(str(n.role))) return `role invalide: ${str(n.role)}`;
    newNodeIds.add(id);
  }
  const knownIds = new Set([...oldNodeIds, ...newNodeIds]);

  const links = asArray(ext.links);
  if (links.length === 0) return "aucun lien";
  let bAnchored = false;
  for (const l of links) {
    const from = str(l.from);
    const to = str(l.to);
    if (!knownIds.has(from) || !knownIds.has(to)) return `lien vers salle inconnue: ${from} -> ${to}`;
    if ((oldNodeIds.has(from) && newNodeIds.has(to)) || (oldNodeIds.has(to) && newNodeIds.has(from))) {
      if (anchors.includes(from) || anchors.includes(to)) bAnchored = true;
    }
  }
  if (!bAnchored) return "les nouvelles salles ne sont pas accrochees a une salle ancre";

  const gateIds = new Set(links.map((l) => str(l.gateLockId)).filter((g) => g && g !== "None"));
  for (const k of asArray(ext.keys)) {
    const lockId = str(k.lockId);
    if (!lockId) return "key sans lockId";
    if (oldLockIds.has(lockId)) return `lockId deja pris: ${lockId}`;
    if (!gateIds.has(lockId)) return `key ${lockId} sans porte correspondante`;
    if (!knownIds.has(str(k.nodeId))) return `gardien de ${lockId} dans une salle inconnue`;
  }
  for (const g of gateIds) {
    if (!asArray(ext.keys).some((k) => str(k.lockId) === g)) return `porte ${g} sans cle`;
  }

  const missions = asArray(ext.missions);
  if (missions.length !== 1) return `missions: ${missions.length} (attendu 1)`;
  const m = missions[0];
  if (!str(m.id) || oldMissionIds.has(str(m.id))) return `mission id invalide/duplique: ${str(m.id)}`;
  if (!itemIds.has(str(m.objectiveItemId))) return `objectiveItemId hors catalogue: ${str(m.objectiveItemId)}`;
  if (!newNodeIds.has(str(m.objectiveNodeId))) return `objectiveNodeId doit etre une NOUVELLE salle: ${str(m.objectiveNodeId)}`;
  const objNode = nodes.find((n) => str(n.id) === str(m.objectiveNodeId));
  if (!objNode || str(objNode.role) !== "Objective") return "la salle objectif doit avoir le role Objective";
  if (!str(m.name) || !str(m.objectiveItemName) || !str(m.objectiveDescription) || !str(m.missionPrompt)) return "mission incomplete";

  const secrets = asArray(ext.secrets);
  if (secrets.length > 3) return `secrets: ${secrets.length} (attendu 0-3)`;
  for (const s of secrets) {
    if (!str(s.id) || oldSecretIds.has(str(s.id))) return `secret id invalide/duplique: ${str(s.id)}`;
    if (!itemIds.has(str(s.itemId))) return `secret itemId hors catalogue: ${str(s.itemId)}`;
    if (!knownIds.has(str(s.nodeId))) return `secret dans une salle inconnue: ${str(s.nodeId)}`;
    if (!str(s.lorePrompt)) return `secret ${str(s.id)} sans lorePrompt`;
  }

  for (const e of asArray(ext.encounters)) {
    if (!newNodeIds.has(str(e.nodeId))) return `encounter dans une salle non nouvelle: ${str(e.nodeId)}`;
    const b = Number(e.budget);
    if (!Number.isFinite(b) || b < 1 || b > 3) return `encounter budget invalide: ${String(e.budget)}`;
  }

  return null;
}

export async function generateDungeonExtension(planRaw: unknown, items: CatalogItem[]): Promise<ExpansionResult> {
  const plan = canonicalizeKeys(planRaw && typeof planRaw === "object" ? planRaw : {}) as AnyObj;
  const anchors = computeAnchors(plan);
  if (anchors.length === 0) return { ok: false, error: "aucune ancre (aucun butin recupere)" };
  if (items.length === 0) return { ok: false, error: "catalogue d'items vide" };

  const wave = asArray(plan.missions).length + 1;
  const prompt = buildPrompt(plan, items, anchors, wave);

  // Providers : Groq (primaire) puis OpenAI (secours), comme le chat.
  const providers: Array<{ client: OpenAI; model: string; label: string }> = [];
  const groqKey = process.env.LLM_API_KEY || process.env.GROQ_API_KEY;
  if (groqKey) {
    providers.push({
      client: new OpenAI({ apiKey: groqKey, baseURL: process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1" }),
      model: process.env.DUNGEON_LLM_MODEL || process.env.CHAT_LLM_MODEL || "llama-3.3-70b-versatile",
      label: "groq",
    });
  }
  if (process.env.OPENAI_API_KEY) {
    providers.push({
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      model: process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini",
      label: "openai",
    });
  }
  if (providers.length === 0) return { ok: false, error: "aucune cle LLM configuree" };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let lastError = "";
  for (const p of providers) {
    // Conversation d'AUTO-REPARATION : l'erreur du validateur est renvoyee au modele pour correction
    // (bien plus fiable qu'un retry aveugle, surtout pour le fallback gpt-4o-mini).
    const convo: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: "Tu generes UNIQUEMENT du JSON strict conforme au schema demande. Aucun texte hors JSON." },
      { role: "user", content: prompt },
    ];
    for (let attempt = 1; attempt <= 3; ++attempt) {
      try {
        const res = await p.client.chat.completions.create({
          model: p.model,
          messages: convo,
          response_format: { type: "json_object" },
          temperature: 0, // deterministe : meme etat -> meme extension (fiabilite demo)
          seed: 7,
        });
        const text = res.choices[0]?.message?.content ?? "";
        let parsed: AnyObj | null = null;
        let err = "";
        try {
          parsed = canonicalizeKeys(JSON.parse(text)) as AnyObj; // le modele mime la casse du plan recu
        } catch {
          err = "JSON illisible (syntaxe invalide)";
        }
        if (parsed) {
          sanitize(parsed);
          err = validateExtension(parsed, plan, items, anchors) ?? "";
          if (!err) {
            console.log(`[dungeon-expand] extension valide (${p.label}, vague ${wave}, essai ${attempt}) : ${asArray(parsed.nodes).length} salles`);
            return { ok: true, extension: parsed };
          }
        }
        lastError = `${p.label}: ${err}`;
        console.warn(`[dungeon-expand] tentative ${attempt} (${p.label}) invalide: ${err}`);
        convo.push({ role: "assistant", content: text });
        convo.push({ role: "user", content: `Ton JSON a ete REJETE par le validateur : ${err}. Corrige ce probleme et renvoie le JSON COMPLET corrige (meme schema, aucun texte hors JSON).` });
      } catch (err) {
        const msg = (err as Error)?.message ?? String(err);
        lastError = `${p.label}: ${msg}`;
        console.error(`[dungeon-expand] appel LLM echoue (${p.label}):`, lastError);
        if (/429|rate.?limit/i.test(msg) && attempt < 3) {
          console.warn(`[dungeon-expand] rate limit ${p.label} -> attente 15 s avant nouvel essai`);
          await sleep(15000);
        }
      }
    }
  }
  return { ok: false, error: lastError || "generation impossible" };
}
