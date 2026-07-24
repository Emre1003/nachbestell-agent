// ---------------------------------------------------------------------------
// FAKTENCHECK — deterministisch, ohne LLM.
//
// Prueft jede Zahl im generierten Text gegen die echten Werte dieses Artikels.
// Findet er eine Zahl, die dort nicht vorkommt, wird der ganze Satz durch eine
// fest formulierte Begruendung aus den echten Werten ersetzt.
//
// Dadurch kann der Agent technisch keine Zahl halluzinieren: entweder die Zahl
// stammt aus dem Rechenkern, oder der Satz fliegt raus.
// ---------------------------------------------------------------------------

const quelle = $('Rechenkern').first().json;
const roh = $input.first().json;

// --- LLM-Text einsammeln (Feldname je nach chainLlm-Version verschieden) ---
let text = '';
if (typeof roh.text === 'string') text = roh.text;
else if (roh.response && typeof roh.response.text === 'string') text = roh.response.text;
else if (typeof roh.output === 'string') text = roh.output;
else if (typeof roh.data === 'string') text = roh.data;

function jsonAusText(t) {
  if (!t) return null;
  let s = String(t).trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a === -1 || b === -1 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
}

const llm = jsonAusText(text) || {};

// Das Modell schreibt den Schluessel mal "begruendungen", mal "begründungen".
// Deshalb wird nicht auf exakte Namen geprueft, sondern auf den normalisierten Anfang.
// Ohne diese Toleranz fallen ALLE Saetze auf den Fallback zurueck, obwohl das Modell
// sauber geantwortet hat — real beobachtet in Lauf 1652.
function normKey(k) {
  return String(k).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z]/g, '');
}

let llmBegruendungen = {};
let llmZusammenfassung = '';
for (const [k, v] of Object.entries(llm || {})) {
  const n = normKey(k);
  if (n.startsWith('begruend') && v && typeof v === 'object') llmBegruendungen = v;
  if (n.startsWith('zusammenfass') && typeof v === 'string') llmZusammenfassung = v;
}

// --- Zahlen aus einem Text ziehen, deutsches und englisches Format ---------
function zahlenAus(t) {
  const treffer = String(t || '').match(/\d[\d.,]*/g) || [];
  const out = [];
  for (const roher of treffer) {
    let s = roher.replace(/[.,]+$/, '');
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');        // 2.456,40 -> 2456.40
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');                          // 2.456 -> 2456
    }
    const n = Number(s);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

// --- Welche Zahlen sind fuer diesen Artikel erlaubt? -----------------------
function erlaubteZahlen(a) {
  const werte = [];
  for (const v of Object.values(a)) if (typeof v === 'number' && Number.isFinite(v)) werte.push(v);
  // Nur Parameter, die als Kontext in einem Satz Sinn ergeben.
  // PUFFER_TAGE (7) und TOTES_KAPITAL_MIN_EUR (100) bleiben bewusst DRAUSSEN: das sind so
  // gewoehnliche Zahlen, dass sie sonst falsch gerundete Reichweiten durchwinken wuerden
  // (z.B. "reicht 7 Tage" bei tatsaechlich 7,5 Tagen).
  for (const k of ['MIN_HISTORIE_TAGE', 'ZIELREICHWEITE_TAGE', 'TOTES_KAPITAL_REICHWEITE']) {
    const v = (quelle.parameter || {})[k];
    if (typeof v === 'number') werte.push(v);
  }
  // Zahlen aus dem Artikelnamen, z.B. "500g" oder "1kg"
  for (const n of (String(a.artikelname || '').match(/\d+/g) || [])) werte.push(Number(n));
  const menge = new Set();
  for (const w of werte) {
    menge.add(w);
    menge.add(Math.round(w));
    menge.add(Math.round(w * 10) / 10);
    menge.add(Math.round(w * 100) / 100);
  }
  return [...menge];
}

function istGedeckt(n, erlaubt) {
  for (const w of erlaubt) if (Math.abs(w - n) <= 0.05) return true;
  return false;
}

// --- Fallback-Saetze, rein aus echten Werten gebaut ------------------------
const z1 = (v) => (v === null || v === undefined ? '—' : String(v).replace('.', ','));

function fallbackSatz(a) {
  const name = a.artikelname;
  switch (a.status) {
    case 'KRITISCH':
      return `${name}: Der Bestand von ${a.bestand_stueck} Stueck reicht noch ${z1(a.reichweite_tage)} Tage, die Lieferzeit betraegt aber ${a.lieferzeit_tage} Tage — der Artikel ist leer, bevor neue Ware ankommt.`;
    case 'JETZT_BESTELLEN':
      return `${name}: Die Reichweite liegt bei ${z1(a.reichweite_tage)} Tagen und damit unter der Meldeschwelle von ${a.meldeschwelle_tage} Tagen — jetzt ${a.bestellmenge_stueck} Stueck bestellen.`;
    case 'BEOBACHTEN':
      return `${name}: Mit ${z1(a.reichweite_tage)} Tagen Reichweite ist noch genug da, der Artikel naehert sich aber der Meldeschwelle von ${a.meldeschwelle_tage} Tagen.`;
    case 'TOTES_KAPITAL':
      return `${name}: Hier liegen ${z1(a.gebundenes_kapital_eur)} EUR im Lager, bei nur ${a.verkauft_gesamt} verkauften Stueck in ${a.historie_tage} Tagen.`;
    case 'ZU_WENIG_DATEN':
      return `${name}: Erst ${a.historie_tage} Tage Verkaufshistorie — zu wenig fuer eine belastbare Prognose.`;
    default:
      return `${name}: Die Reichweite von ${z1(a.reichweite_tage)} Tagen liegt klar ueber der Meldeschwelle von ${a.meldeschwelle_tage} Tagen — kein Handlungsbedarf.`;
  }
}

// --- Pruefen und ggf. ersetzen ---------------------------------------------
let ersetzt = 0;
let uebernommen = 0;
let fehlend = 0;
const beanstandet = [];

const artikel = quelle.artikel.map((a) => {
  const satzLlm = typeof llmBegruendungen[a.artikel_id] === 'string' ? llmBegruendungen[a.artikel_id].trim() : '';
  let satz;
  let herkunft;

  if (!satzLlm) {
    satz = fallbackSatz(a);
    herkunft = 'fallback_fehlend';
    fehlend++;
  } else {
    const erlaubt = erlaubteZahlen(a);
    const ungedeckt = zahlenAus(satzLlm).filter((n) => !istGedeckt(n, erlaubt));

    // Zusatzpruefung fuer DIE Entscheidungszahl: wird eine Reichweite genannt, muss sie
    // zur echten Reichweite dieses Artikels passen. Ohne diese Regel rutscht eine falsch
    // gerundete Reichweite durch, nur weil dieselbe Zahl zufaellig in einem anderen Feld
    // des Artikels vorkommt (z.B. "7 Tage" bei Reichweite 7,5 und Fehltagen 6,5).
    let reichweiteFalsch = false;
    const mReich = satzLlm.match(/(?:reichweite|reicht)[^.\d]{0,24}(\d[\d.,]*)/i);
    if (mReich && a.reichweite_tage !== null) {
      const genannt = zahlenAus(mReich[1])[0];
      const okR = [a.reichweite_tage, Math.round(a.reichweite_tage), Math.round(a.reichweite_tage * 10) / 10];
      if (genannt !== undefined && !okR.some((w) => Math.abs(w - genannt) <= 0.05)) reichweiteFalsch = true;
    }
    // Zusaetzliche Regel: bei ZU_WENIG_DATEN darf ueberhaupt keine Prognose auftauchen.
    // Verboten ist eine BEHAUPTETE Prognose, nicht das Wort an sich:
    // "keine Prognose moeglich" muss durchgehen, "Reichweite von 12 Tagen" nicht.
    const prognoseVerboten = a.status === 'ZU_WENIG_DATEN' && /(reichweite|prognose|reicht|haelt)[^.]{0,25}\d/i.test(satzLlm);
    if (ungedeckt.length > 0 || prognoseVerboten || reichweiteFalsch) {
      satz = fallbackSatz(a);
      herkunft = ungedeckt.length > 0
        ? 'fallback_zahl_nicht_belegt'
        : (reichweiteFalsch ? 'fallback_reichweite_falsch' : 'fallback_prognose_verboten');
      ersetzt++;
      beanstandet.push({ artikel_id: a.artikel_id, grund: herkunft, ungedeckte_zahlen: ungedeckt, genannte_reichweite: reichweiteFalsch ? zahlenAus(mReich[1])[0] : null, echte_reichweite: a.reichweite_tage, original: satzLlm });
    } else {
      satz = satzLlm;
      herkunft = 'llm';
      uebernommen++;
    }
  }

  return { ...a, begruendung: satz, begruendung_herkunft: herkunft };
});

// --- Zusammenfassung im Kopf ebenfalls pruefen -----------------------------
const zGlobal = [];
for (const v of Object.values(quelle.zusammenfassung)) if (typeof v === 'number') zGlobal.push(v);
for (const v of Object.values(quelle.zusammenfassung.anzahl_je_status || {})) zGlobal.push(v);
for (const v of Object.values(quelle.parameter || {})) if (typeof v === 'number') zGlobal.push(v);
for (const a of quelle.artikel) for (const v of Object.values(a)) if (typeof v === 'number' && Number.isFinite(v)) zGlobal.push(v);
const zErlaubt = [...new Set(zGlobal.flatMap((w) => [w, Math.round(w), Math.round(w * 10) / 10, Math.round(w * 100) / 100]))];

const zs = quelle.zusammenfassung;
const fallbackKopf = `Stichtag ${quelle.stichtag}: ${zs.anzahl_je_status.KRITISCH} Artikel muessen sofort bestellt werden, ${zs.anzahl_je_status.JETZT_BESTELLEN} weitere stehen zur Bestellung an. Der Bestellvorschlag umfasst ${zs.summe_bestellwert_eur} EUR. In Ladenhuetern stecken ${zs.summe_totes_kapital_eur} EUR.`;

let zusammenfassung;
let zusammenfassungHerkunft;
if (!llmZusammenfassung) {
  zusammenfassung = fallbackKopf;
  zusammenfassungHerkunft = 'fallback_fehlend';
  ersetzt++;
} else {
  const ungedeckt = zahlenAus(llmZusammenfassung).filter((n) => !istGedeckt(n, zErlaubt));
  if (ungedeckt.length > 0) {
    zusammenfassung = fallbackKopf;
    zusammenfassungHerkunft = 'fallback_zahl_nicht_belegt';
    ersetzt++;
    beanstandet.push({ artikel_id: '(Zusammenfassung)', grund: 'fallback_zahl_nicht_belegt', ungedeckte_zahlen: ungedeckt, original: llmZusammenfassung });
  } else {
    zusammenfassung = llmZusammenfassung;
    zusammenfassungHerkunft = 'llm';
    uebernommen++; // die Zusammenfassung zaehlt zu 'geprueft', also auch hier mitzaehlen
  }
}

return [{
  json: {
    ...quelle,
    artikel,
    zusammenfassung_text: zusammenfassung,
    zusammenfassung_herkunft: zusammenfassungHerkunft,
    faktencheck: {
      geprueft: quelle.artikel.length + 1,
      uebernommen,
      ersetzt,
      ohne_llm_antwort: fehlend,
      llm_antwort_geparst: Object.keys(llmBegruendungen).length > 0,
      beanstandet,
    },
  },
}];
