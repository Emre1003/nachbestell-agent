'use strict';
// ---------------------------------------------------------------------------
// Baut workflow/nachbestell-agent.json aus den Node-Quellen in workflow/nodes/.
//
// Warum ueberhaupt ein Build-Schritt?
//   1. Der Code der Code-Nodes liegt als echte .js-Datei vor — lesbar und
//      reviewbar, statt als JSON-escapete Zeichenkette.
//   2. Die Rechenlogik hat EINE Quelle: scripts/lib/rechenkern.js. Der Node-Code
//      wird daraus erzeugt, kann also nicht auseinanderlaufen.
//   3. Im Export stehen KEINE Credentials. Die Anthropic-Credential wird bewusst
//      nicht mitexportiert — sie gehoert in die Zielinstanz, nicht ins Repo.
//
// Aufruf:  node scripts/build-workflow-export.js
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..');
const nodeQuelle = (datei) => fs.readFileSync(path.join(wurzel, 'workflow', 'nodes', datei), 'utf8');

// --- Rechenkern-Node aus dem Repo-Kern erzeugen ----------------------------
function baueRechenkern() {
  let src = fs.readFileSync(path.join(wurzel, 'scripts', 'lib', 'rechenkern.js'), 'utf8');
  src = src.replace(/^'use strict';\n/, '');
  src = src.replace(/\nmodule\.exports = \{ rechne \};\s*$/, '');
  src = src.replace(
    '// RECHENKERN — Referenzimplementierung',
    '// RECHENKERN — n8n Code-Node\n//\n// ERZEUGT aus scripts/lib/rechenkern.js durch scripts/build-workflow-export.js.\n// Nicht von Hand bearbeiten — Aenderungen gehoeren in die Repo-Quelle.'
  );

  const glue = [
    '',
    '// --- n8n-Anbindung ---------------------------------------------------------',
    "const bestandRohe = $('Bestand parsen').all().map((i) => i.json);",
    'const verkaeufeRohe = $input.all().map((i) => i.json);',
    '',
    "if (!bestandRohe.length) throw new Error('bestand.csv lieferte keine Zeilen — Abbruch statt leerem Report');",
    "if (!verkaeufeRohe.length) throw new Error('verkaeufe.csv lieferte keine Zeilen — Abbruch statt leerem Report');",
    '',
    'return [{ json: rechne(bestandRohe, verkaeufeRohe) }];',
    '',
  ].join('\n');

  const code = src.trimEnd() + '\n' + glue;
  fs.writeFileSync(path.join(wurzel, 'workflow', 'nodes', 'rechenkern.js'), code, 'utf8');
  return code;
}

const SYSTEMPROMPT = fs.readFileSync(path.join(wurzel, 'workflow', 'nodes', 'systemprompt.txt'), 'utf8').trimEnd();
const NUTZERPROMPT = fs.readFileSync(path.join(wurzel, 'workflow', 'nodes', 'nutzerprompt.txt'), 'utf8').trimEnd();

const nodes = [
  {
    id: 'manual-trigger',
    name: 'Manuell starten',
    type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1,
    position: [-620, 0],
    parameters: {},
  },
  {
    id: 'http-bestand',
    name: 'Bestand laden',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.4,
    position: [-380, 0],
    parameters: {
      url: 'https://raw.githubusercontent.com/Emre1003/nachbestell-agent/main/data/bestand.csv',
      options: { response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } },
    },
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    notes: 'Laedt bestand.csv als Datei. Oeffentliches Repo, keine Credentials noetig.',
  },
  {
    id: 'parse-bestand',
    name: 'Bestand parsen',
    type: 'n8n-nodes-base.extractFromFile',
    typeVersion: 1.1,
    position: [-140, 0],
    parameters: { operation: 'csv', binaryPropertyName: 'data', options: { delimiter: ',', encoding: 'utf8', headerRow: true } },
  },
  {
    id: 'http-verkaeufe',
    name: 'Verkaeufe laden',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.4,
    position: [100, 0],
    parameters: {
      url: 'https://raw.githubusercontent.com/Emre1003/nachbestell-agent/main/data/verkaeufe.csv',
      options: { response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } },
    },
    executeOnce: true,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    notes: "executeOnce=true ist wichtig: ohne das wuerde dieser Node 25x laufen, einmal je Artikel aus 'Bestand parsen'.",
  },
  {
    id: 'parse-verkaeufe',
    name: 'Verkaeufe parsen',
    type: 'n8n-nodes-base.extractFromFile',
    typeVersion: 1.1,
    position: [340, 0],
    parameters: { operation: 'csv', binaryPropertyName: 'data', options: { delimiter: ',', encoding: 'utf8', headerRow: true } },
  },
  {
    id: 'code-rechenkern',
    name: 'Rechenkern',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [580, 0],
    parameters: { jsCode: baueRechenkern() },
    notes: 'Hier entsteht JEDE Zahl des Reports. Kein LLM beteiligt. Deterministisch: Stichtag = spaetestes Verkaufsdatum, nicht der Ausfuehrungstag.',
  },
  {
    id: 'llm-begruendung',
    name: 'Begruendung',
    type: '@n8n/n8n-nodes-langchain.chainLlm',
    typeVersion: 1.9,
    position: [820, 0],
    parameters: {
      promptType: 'define',
      text: NUTZERPROMPT,
      messages: { messageValues: [{ message: SYSTEMPROMPT }] },
      batching: {},
    },
    notes: "Formuliert nur Text. Rechnet nichts. Jede Zahl im Output wird danach im Node 'Faktencheck' gegen die echten Werte geprueft.",
  },
  {
    id: 'model-begruendung',
    name: 'Claude - Begruendung',
    type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
    typeVersion: 1.5,
    position: [820, 220],
    // BEWUSST OHNE credentials: die Anthropic-Credential gehoert in die
    // Zielinstanz, nicht ins Repo. Siehe INSTALL.md, Schritt 2.
    parameters: {},
    notes: 'Anthropic-Credential nach dem Import in n8n zuweisen. Modell auf Node-Default gelassen — im Dropdown auswaehlbar.',
  },
  {
    id: 'code-faktencheck',
    name: 'Faktencheck',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1060, 0],
    parameters: { jsCode: nodeQuelle('faktencheck.js') },
    notes: 'Deterministische Halluzinationssperre. Jede Zahl im LLM-Satz muss in den Werten dieses Artikels vorkommen, sonst wird der Satz ersetzt.',
  },
  {
    id: 'code-html',
    name: 'HTML-Report',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1300, 0],
    parameters: { jsCode: nodeQuelle('html-report.js') },
    notes: 'Reine Darstellung. Rechnet nichts, formatiert nur.',
  },
  {
    id: 'convert-file',
    name: 'Report als Datei',
    type: 'n8n-nodes-base.convertToFile',
    typeVersion: 1.1,
    position: [1540, 0],
    parameters: {
      operation: 'toText',
      sourceProperty: 'html',
      binaryPropertyName: 'data',
      options: { fileName: '=nachbestell-report-{{ $json.stichtag }}.html', mimeType: 'text/html' },
    },
    notes: 'Macht den Report in n8n herunterladbar und im Browser oeffenbar.',
  },
  {
    id: 'code-pruefsumme',
    name: 'Pruefsumme',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1540, 200],
    parameters: { jsCode: nodeQuelle('pruefsumme.js') },
    notes: 'Vergleichbarkeit zwischen Laeufen. Der Fingerabdruck deckt nur berechnete Zahlen ab, nicht den LLM-Text.',
  },
];

const connections = {
  'Manuell starten': { main: [[{ node: 'Bestand laden', type: 'main', index: 0 }]] },
  'Bestand laden': { main: [[{ node: 'Bestand parsen', type: 'main', index: 0 }]] },
  'Bestand parsen': { main: [[{ node: 'Verkaeufe laden', type: 'main', index: 0 }]] },
  'Verkaeufe laden': { main: [[{ node: 'Verkaeufe parsen', type: 'main', index: 0 }]] },
  'Verkaeufe parsen': { main: [[{ node: 'Rechenkern', type: 'main', index: 0 }]] },
  Rechenkern: { main: [[{ node: 'Begruendung', type: 'main', index: 0 }]] },
  'Claude - Begruendung': { ai_languageModel: [[{ node: 'Begruendung', type: 'ai_languageModel', index: 0 }]] },
  Begruendung: { main: [[{ node: 'Faktencheck', type: 'main', index: 0 }]] },
  Faktencheck: { main: [[{ node: 'HTML-Report', type: 'main', index: 0 }]] },
  'HTML-Report': {
    main: [[
      { node: 'Report als Datei', type: 'main', index: 0 },
      { node: 'Pruefsumme', type: 'main', index: 0 },
    ]],
  },
};

const workflow = {
  name: 'Nachbestell-Agent',
  nodes,
  connections,
  settings: {
    executionOrder: 'v1',
    saveManualExecutions: true,
    saveDataSuccessExecution: 'all',
    saveDataErrorExecution: 'all',
  },
};

const ziel = path.join(wurzel, 'workflow', 'nachbestell-agent.json');
fs.writeFileSync(ziel, JSON.stringify(workflow, null, 2) + '\n', 'utf8');

// --- Sicherheitsnetz: nichts Geheimes im Export ---------------------------
const inhalt = fs.readFileSync(ziel, 'utf8');
// Bewusst nur generische Muster: eine konkrete Credential-ID als Suchmuster
// einzutragen wuerde sie selbst ins oeffentliche Repo schreiben. Der Block
// "credentials" deckt den eigentlichen Fall bereits ab.
const verdacht = [
  /"credentials"\s*:/i,
  /sk-[A-Za-z0-9]{10}/,
  /api[_-]?key\s*[:=]\s*["'][^"']+/i,
  /\b(ghp|github_pat)_[A-Za-z0-9]/,
];
const treffer = verdacht.filter((r) => r.test(inhalt));
if (treffer.length > 0) {
  console.error('ABBRUCH: Der Export enthaelt moeglicherweise Zugangsdaten:', treffer.map(String));
  process.exit(1);
}

// --- Strukturpruefung: faengt die realistischen Importfehler ab -----------
const fehler = [];
const namen = nodes.map((n) => n.name);

if (new Set(namen).size !== namen.length) fehler.push('Doppelte Node-Namen');
if (new Set(nodes.map((n) => n.id)).size !== nodes.length) fehler.push('Doppelte Node-IDs');

for (const n of nodes) {
  for (const feld of ['id', 'name', 'type', 'typeVersion', 'position', 'parameters']) {
    if (n[feld] === undefined) fehler.push(`Node "${n.name}": Pflichtfeld ${feld} fehlt`);
  }
  if (!Array.isArray(n.position) || n.position.length !== 2) fehler.push(`Node "${n.name}": position muss [x, y] sein`);
}

// Jede Verbindung muss auf existierende Nodes zeigen — in beide Richtungen.
let verbindungen = 0;
for (const [quelle, ausgaenge] of Object.entries(connections)) {
  if (!namen.includes(quelle)) fehler.push(`Verbindung von unbekanntem Node "${quelle}"`);
  for (const liste of Object.values(ausgaenge)) {
    for (const zweig of liste) {
      for (const ziel of zweig) {
        verbindungen++;
        if (!namen.includes(ziel.node)) fehler.push(`Verbindung "${quelle}" -> unbekannter Node "${ziel.node}"`);
      }
    }
  }
}

// Kein verwaister Node (ausser dem Trigger, der keinen Eingang hat).
const hatEingang = new Set();
for (const ausgaenge of Object.values(connections)) {
  for (const liste of Object.values(ausgaenge)) {
    for (const zweig of liste) for (const ziel of zweig) hatEingang.add(ziel.node);
  }
}
const trigger = nodes.filter((n) => /trigger|webhook/i.test(n.type));
if (trigger.length !== 1) fehler.push(`Genau ein Trigger erwartet, gefunden: ${trigger.length}`);

// Verwaist ist ein Node nur, wenn er WEDER Eingang NOCH Ausgang hat.
// KI-Sub-Nodes wie das Sprachmodell haben bewusst keinen Haupteingang — sie
// haengen sich per ai_languageModel an den Chain-Node, sind also Quelle statt Ziel.
for (const n of nodes) {
  const istTrigger = /trigger|webhook/i.test(n.type);
  if (!istTrigger && !hatEingang.has(n.name) && !connections[n.name]) {
    fehler.push(`Node "${n.name}" ist nicht verbunden`);
  }
}

// Der Rechenkern darf sich nicht auf die Systemuhr stuetzen.
const rechenkernCode = nodes.find((n) => n.name === 'Rechenkern').parameters.jsCode;
for (const verboten of ['new Date(', 'Date.now(', 'Math.random(']) {
  const codeOhneKommentare = rechenkernCode.split('\n').filter((z) => !z.trim().startsWith('//')).join('\n');
  if (codeOhneKommentare.includes(verboten)) fehler.push(`Rechenkern enthaelt ${verboten} — Ergebnis waere nicht reproduzierbar`);
}

if (fehler.length > 0) {
  console.error('STRUKTURPRUEFUNG FEHLGESCHLAGEN:');
  for (const f of fehler) console.error('  - ' + f);
  process.exit(1);
}

console.log(`workflow/nachbestell-agent.json geschrieben — ${nodes.length} Nodes, ${verbindungen} Verbindungen, ${(inhalt.length / 1024).toFixed(1)} KB`);
console.log('Strukturpruefung bestanden. Keine Credentials im Export gefunden.');
