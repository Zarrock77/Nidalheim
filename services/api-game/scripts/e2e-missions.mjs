// Harnais E2E : rejoue les scenarios critiques de Melvyn contre le backend staging REEL.
// Le code (pas le LLM) doit confier/valider -> on verifie les events ET la reponse du PNJ.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import pg from "pg";
import WebSocket from "ws";

const env = {};
for (const line of fs.readFileSync(path.join(os.homedir(), "Nidalheim-staging/infra/.env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const pool = new pg.Pool({
  connectionString: `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@localhost:5432/${env.POSTGRES_DB}_staging`,
});
const { rows } = await pool.query("SELECT id, username FROM users WHERE username = 'melvyn' LIMIT 1");
await pool.end();
if (!rows.length) { console.error("user melvyn introuvable"); process.exit(1); }
const user = rows[0];
const token = jwt.sign({ sub: user.id, username: user.username }, env.JWT_SECRET, { algorithm: "HS256", expiresIn: "15m" });

const ws = new WebSocket(`ws://localhost:3012/text?token=${encodeURIComponent(token)}&npc=default`);
const inbox = [];
ws.on("message", (data) => {
  const text = data.toString();
  try { inbox.push({ kind: "event", data: JSON.parse(text) }); }
  catch { inbox.push({ kind: "text", data: text }); }
});
await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });

const send = (obj) => ws.send(typeof obj === "string" ? obj : JSON.stringify(obj));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const hit = inbox.find(pred);
    if (hit) return hit;
    await sleep(200);
  }
  console.error(`TIMEOUT en attendant: ${label}`);
  return null;
}

const M1 = {
  id: "retrieve_gold_ingot", name: "Le lingot d'or", objectiveItemId: "gold_ingot",
  objectiveDescription: "Recupere le lingot d'or dans la chambre forte et rapporte-le a Olaf.",
  missionPrompt: "Tu es Olaf, gardien du village : exige le lingot d'or comme preuve de valeur.",
  hasObjectiveItem: false, started: false, completed: false,
};
const M2 = {
  id: "w2_mission1", name: "La dague des pilleurs", objectiveItemId: "kama_dagger",
  objectiveDescription: "Retrouve la seconde dague kama cachee dans les nouvelles salles des pilleurs.",
  missionPrompt: "Le joueur a trouve une dague kama volee ; demande-lui de recuperer sa jumelle plus profond dans le donjon.",
  hasObjectiveItem: false, started: false, completed: false,
};
const INV_BASE = [{ id: "sword", name: "Epee", qty: 1, dungeon: false, lore: "" }];
const INV_GOLD = [...INV_BASE, { id: "gold_ingot", name: "Lingot d'or", qty: 1, dungeon: true, lore: "Lingot vole par les pilleurs." }];
const INV_DAGGER = [...INV_BASE, { id: "kama_dagger", name: "Dague kama", qty: 1, dungeon: true, lore: "Dague au fil noirci, volee a un ancien du village." }];

let failures = 0;
function check(name, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
}
function lastText() {
  for (let i = inbox.length - 1; i >= 0; --i) if (inbox[i].kind === "text") return inbox[i].data;
  return "";
}

send({ type: "clear_history" });
await sleep(500);

// ===== Scenario A : demande d'integrer le village -> mission 1 confiee =====
console.log("\n=== A: integration village -> mission confiee ===");
send({ type: "mission_sync", missions: [{ ...M1 }] });
send({ type: "inventory_sync", items: INV_BASE });
await sleep(300);
inbox.length = 0;
send("Salut, j'aimerais integrer le village");
const evA = await waitFor((m) => m.kind === "event" && m.data.type === "mission_started", 20000, "mission_started");
const txtA = await waitFor((m) => m.kind === "text", 25000, "reponse PNJ A");
check("A1 event mission_started", !!evA && evA.data.missionId === "retrieve_gold_ingot");
check("A2 reponse PNJ non vide", !!txtA && txtA.data.trim().length > 0);
check("A3 pas de nom technique dans la reponse", !!txtA && !/start_mission|validate_mission|no_action|_/.test(txtA.data));
console.log("  PNJ:", (txtA ? txtA.data : "(rien)").slice(0, 160));

// ===== Scenario B : objet rapporte (inventaire) -> validation + confirmation =====
console.log("\n=== B: lingot dans l'inventaire -> validation ===");
send({ type: "mission_sync", missions: [{ ...M1, started: true, hasObjectiveItem: true }] });
send({ type: "inventory_sync", items: INV_GOLD });
await sleep(300);
inbox.length = 0;
send("C'est fait !");
const evB = await waitFor((m) => m.kind === "event" && m.data.type === "mission_validation_result", 20000, "mission_validation_result");
const txtB = await waitFor((m) => m.kind === "text", 25000, "reponse PNJ B");
check("B1 event validation ok", !!evB && evB.data.ok === true && evB.data.missionId === "retrieve_gold_ingot");
check("B2 reponse PNJ non vide", !!txtB && txtB.data.trim().length > 0);
console.log("  PNJ:", (txtB ? txtB.data : "(rien)").slice(0, 160));

// ===== Scenario C : secret trouve + mention -> mission suivante confiee =====
console.log("\n=== C: secret mentionne -> mission 2 confiee ===");
send({ type: "mission_sync", missions: [{ ...M1, started: true, completed: true }, { ...M2 }] });
send({ type: "inventory_sync", items: INV_DAGGER });
await sleep(300);
inbox.length = 0;
send("J'ai trouve un objet dans le donjon, tu as des infos dessus ?");
const evC = await waitFor((m) => m.kind === "event" && m.data.type === "mission_started", 20000, "mission_started w2");
const txtC = await waitFor((m) => m.kind === "text", 25000, "reponse PNJ C");
check("C1 event mission_started (mission 2)", !!evC && evC.data.missionId === "w2_mission1");
check("C2 reponse PNJ non vide", !!txtC && txtC.data.trim().length > 0);
check("C3 pas de nom technique", !!txtC && !/start_mission|validate_mission|no_action/.test(txtC.data));
console.log("  PNJ:", (txtC ? txtC.data : "(rien)").slice(0, 200));

// ===== Scenario D : message anodin SANS mission en attente -> aucun event parasite =====
console.log("\n=== D: pas de mission en attente -> pas d'event ===");
send({ type: "mission_sync", missions: [{ ...M1, started: true, completed: true }, { ...M2, started: true, completed: true }] });
await sleep(300);
inbox.length = 0;
send("Merci pour tout !");
const txtD = await waitFor((m) => m.kind === "text", 25000, "reponse PNJ D");
const parasites = inbox.filter((m) => m.kind === "event" && (m.data.type === "mission_started" || m.data.type === "mission_validation_result"));
check("D1 aucun event mission parasite", parasites.length === 0);
check("D2 reponse PNJ non vide", !!txtD && txtD.data.trim().length > 0);
console.log("  PNJ:", (txtD ? txtD.data : "(rien)").slice(0, 160));

send({ type: "clear_history" });
await sleep(400);
ws.close();
console.log(failures === 0 ? "\nTOUS LES SCENARIOS PASSENT" : `\n${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
