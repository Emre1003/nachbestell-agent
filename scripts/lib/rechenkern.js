'use strict';
// ---------------------------------------------------------------------------
// RECHENKERN — Referenzimplementierung
//
// Dieser Code ist bewusst SELBSTTRAGEND (keine require-Aufrufe im Kern), damit
// er 1:1 in den n8n Code-Node uebernommen werden kann. Aenderungen hier und im
// n8n-Node muessen immer gemeinsam passieren.
//
// Zwei Eigenschaften, die nicht verhandelbar sind:
//   1. Hier entsteht JEDE Zahl, die spaeter im Report steht. Das LLM rechnet nichts.
//   2. Kein Date-Objekt, kein Math.random. Der Stichtag kommt aus den Daten
//      (spaetestes Verkaufsdatum), nicht aus der Systemuhr. Damit liefert jeder
//      Durchlauf an jedem Tag identische Zahlen.
// ---------------------------------------------------------------------------

// --- Stellschrauben: alle an EINER Stelle ---------------------------------
const PUFFER_TAGE = 7;
const ZIELREICHWEITE_TAGE = 45;
const MIN_HISTORIE_TAGE = 14;
const TOTES_KAPITAL_REICHWEITE = 180;
const TOTES_KAPITAL_MIN_EUR = 100;
const GEWICHT_KURZ = 0.7;

// Fenster fuer die kurzfristige Rate. Bewusst identisch mit MIN_HISTORIE_TAGE.
const KURZ_FENSTER_TAGE = 14;

// --- Datum als reine Integer-Arithmetik (keine Zeitzone, keine Systemuhr) ---
function isoZuTage(iso) {
  const t = String(iso).trim().split('-');
  let y = Number(t[0]);
  const m = Number(t[1]);
  const d = Number(t[2]);
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

const zahl = (v) => {
  const n = Number(String(v == null ? '' : v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const runde = (v, n) => {
  if (v === null || !Number.isFinite(v)) return null;
  const f = Math.pow(10, n);
  return Math.round(v * f) / f;
};

/**
 * @param {Array} artikelRohe   Zeilen aus bestand.csv
 * @param {Array} verkaeufeRohe Zeilen aus verkaeufe.csv
 */
function rechne(artikelRohe, verkaeufeRohe) {
  // --- Verkaeufe je Artikel buendeln ---------------------------------------
  const proArtikel = new Map();
  let stichtagNr = null;
  let fruehesterNr = null;

  for (const z of verkaeufeRohe) {
    const id = String(z.artikel_id || '').trim();
    const datum = String(z.datum || '').trim();
    if (!id || !datum) continue;
    const tagNr = isoZuTage(datum);
    const menge = zahl(z.menge);

    if (stichtagNr === null || tagNr > stichtagNr) stichtagNr = tagNr;
    if (fruehesterNr === null || tagNr < fruehesterNr) fruehesterNr = tagNr;

    if (!proArtikel.has(id)) proArtikel.set(id, []);
    proArtikel.get(id).push({ tagNr, menge });
  }

  if (stichtagNr === null) throw new Error('Keine Verkaufszeilen gefunden — Abbruch statt leerem Report');

  // Stichtag = spaetestes Verkaufsdatum im Datensatz. NICHT der Ausfuehrungstag.
  const stichtag = verkaeufeRohe
    .map((z) => String(z.datum || '').trim())
    .filter(Boolean)
    .reduce((a, b) => (a > b ? a : b));
  const datensatzTage = stichtagNr - fruehesterNr + 1;
  const kurzGrenzeNr = stichtagNr - (KURZ_FENSTER_TAGE - 1);

  const artikel = [];

  for (const a of artikelRohe) {
    const id = String(a.artikel_id || '').trim();
    if (!id) continue;

    const bestand = zahl(a.bestand_stueck);
    const ek = zahl(a.ek_preis_eur);
    const vk = zahl(a.vk_preis_eur);
    const vpe = Math.max(1, zahl(a.vpe_stueck));
    const lieferzeit = zahl(a.lieferzeit_tage);

    const zeilen = proArtikel.get(id) || [];

    // Historie: ab der ersten Verkaufszeile dieses Artikels bis zum Stichtag.
    // Artikel ganz OHNE Verkaufszeile: wir haben den vollen Zeitraum beobachtet
    // und dabei null Absatz gesehen — das ist eine Aussage, kein Datenmangel.
    let historieTage;
    if (zeilen.length > 0) {
      const erste = zeilen.reduce((min, z) => (z.tagNr < min ? z.tagNr : min), zeilen[0].tagNr);
      historieTage = stichtagNr - erste + 1;
    } else {
      historieTage = datensatzTage;
    }

    let summeGesamt = 0;
    let summeKurz = 0;
    for (const z of zeilen) {
      summeGesamt += z.menge;
      if (z.tagNr >= kurzGrenzeNr) summeKurz += z.menge;
    }

    const tagesrateKurz = summeKurz / KURZ_FENSTER_TAGE;
    const tagesrateLang = historieTage > 0 ? summeGesamt / historieTage : 0;
    const prognoseRate = GEWICHT_KURZ * tagesrateKurz + (1 - GEWICHT_KURZ) * tagesrateLang;
    const trendFaktor = tagesrateLang > 0 ? tagesrateKurz / tagesrateLang : null;

    // Division durch null wird vermieden, nicht abgefangen: Rate 0 -> keine Reichweite.
    const reichweite = prognoseRate > 0 ? bestand / prognoseRate : null;
    const meldeschwelle = lieferzeit + PUFFER_TAGE;
    const kapital = bestand * ek;

    // --- Status. Reihenfolge ist Teil der Fachlogik. -----------------------
    // reichweite kann null sein. Jeder Vergleich wird deshalb explizit
    // gegen null abgesichert — sonst wuerde null < lieferzeit zu 0 < lieferzeit
    // ausgewertet und ein Ladenhueter faelschlich als KRITISCH gemeldet.
    const hatReichweite = reichweite !== null;
    let status;
    if (historieTage < MIN_HISTORIE_TAGE) {
      status = 'ZU_WENIG_DATEN';
    } else if (prognoseRate === 0 && kapital > TOTES_KAPITAL_MIN_EUR) {
      status = 'TOTES_KAPITAL';
    } else if (hatReichweite && reichweite < lieferzeit) {
      status = 'KRITISCH';
    } else if (hatReichweite && reichweite < meldeschwelle) {
      status = 'JETZT_BESTELLEN';
    } else if (hatReichweite && reichweite < meldeschwelle * 1.5) {
      status = 'BEOBACHTEN';
    } else if (hatReichweite && reichweite > TOTES_KAPITAL_REICHWEITE && kapital > TOTES_KAPITAL_MIN_EUR) {
      status = 'TOTES_KAPITAL';
    } else {
      status = 'OK';
    }

    // --- ZU_WENIG_DATEN: Prognosewerte werden aktiv verworfen ---------------
    // Rechnerisch liesse sich aus 8 Tagen eine Reichweite bilden. Fachlich waere
    // das eine Scheingenauigkeit. Die Felder werden deshalb geleert, damit im
    // Report gar keine Prognose fuer diesen Artikel stehen KANN.
    let prognoseRateAus = prognoseRate;
    let reichweiteAus = reichweite;
    let trendFaktorAus = trendFaktor;
    if (status === 'ZU_WENIG_DATEN') {
      prognoseRateAus = null;
      reichweiteAus = null;
      trendFaktorAus = null;
    }

    // --- Bestellvorschlag ---------------------------------------------------
    let bestellmenge = null;
    let bestellwert = null;
    let bestellmengeRoh = null;
    if (status === 'KRITISCH' || status === 'JETZT_BESTELLEN') {
      bestellmengeRoh = (ZIELREICHWEITE_TAGE + lieferzeit) * prognoseRate - bestand;
      const vpeAnzahl = Math.max(1, Math.ceil(bestellmengeRoh / vpe));
      bestellmenge = vpeAnzahl * vpe;
      bestellwert = bestellmenge * ek;
    }

    // --- Nur KRITISCH: was der Engpass kostet ------------------------------
    let fehltage = null;
    let umsatzverlust = null;
    if (status === 'KRITISCH') {
      fehltage = lieferzeit - reichweite;
      umsatzverlust = fehltage * prognoseRate * vk;
    }

    artikel.push({
      artikel_id: id,
      artikelname: String(a.artikelname || '').trim(),
      kategorie: String(a.kategorie || '').trim(),
      status,
      bestand_stueck: bestand,
      ek_preis_eur: runde(ek, 2),
      vk_preis_eur: runde(vk, 2),
      vpe_stueck: vpe,
      lieferzeit_tage: lieferzeit,
      historie_tage: historieTage,
      verkauft_gesamt: summeGesamt,
      verkauft_letzte_14_tage: summeKurz,
      tagesrate_kurz: runde(tagesrateKurz, 3),
      tagesrate_lang: runde(tagesrateLang, 3),
      prognose_rate: runde(prognoseRateAus, 3),
      trend_faktor: runde(trendFaktorAus, 2),
      reichweite_tage: runde(reichweiteAus, 1),
      meldeschwelle_tage: meldeschwelle,
      gebundenes_kapital_eur: runde(kapital, 2),
      bestellmenge_roh: runde(bestellmengeRoh, 1),
      bestellmenge_stueck: bestellmenge,
      bestellwert_eur: runde(bestellwert, 2),
      fehltage: runde(fehltage, 1),
      umsatzverlust_schaetzung_eur: runde(umsatzverlust, 2),
    });
  }

  // --- Zusammenfassung ------------------------------------------------------
  const ALLE_STATUS = ['KRITISCH', 'JETZT_BESTELLEN', 'BEOBACHTEN', 'TOTES_KAPITAL', 'ZU_WENIG_DATEN', 'OK'];
  const anzahl = {};
  for (const s of ALLE_STATUS) anzahl[s] = 0;
  let summeBestellwert = 0;
  let summeTotesKapital = 0;
  let summeUmsatzverlust = 0;

  for (const a of artikel) {
    anzahl[a.status] = (anzahl[a.status] || 0) + 1;
    if (a.bestellwert_eur) summeBestellwert += a.bestellwert_eur;
    if (a.status === 'TOTES_KAPITAL') summeTotesKapital += a.gebundenes_kapital_eur;
    if (a.umsatzverlust_schaetzung_eur) summeUmsatzverlust += a.umsatzverlust_schaetzung_eur;
  }

  // Sortierung: dringendste Entscheidung zuerst, innerhalb gleicher Dringlichkeit
  // die knappste Reichweite. Artikel ohne Reichweite ans Ende ihrer Gruppe.
  const RANG = { KRITISCH: 0, JETZT_BESTELLEN: 1, BEOBACHTEN: 2, TOTES_KAPITAL: 3, ZU_WENIG_DATEN: 4, OK: 5 };
  artikel.sort((x, y) => {
    if (RANG[x.status] !== RANG[y.status]) return RANG[x.status] - RANG[y.status];
    const rx = x.reichweite_tage === null ? Infinity : x.reichweite_tage;
    const ry = y.reichweite_tage === null ? Infinity : y.reichweite_tage;
    if (rx !== ry) return rx - ry;
    return x.artikel_id < y.artikel_id ? -1 : 1;
  });

  return {
    stichtag,
    datensatz_tage: datensatzTage,
    parameter: {
      PUFFER_TAGE,
      ZIELREICHWEITE_TAGE,
      MIN_HISTORIE_TAGE,
      TOTES_KAPITAL_REICHWEITE,
      TOTES_KAPITAL_MIN_EUR,
      GEWICHT_KURZ,
    },
    zusammenfassung: {
      artikel_gesamt: artikel.length,
      anzahl_je_status: anzahl,
      summe_bestellwert_eur: runde(summeBestellwert, 2),
      summe_totes_kapital_eur: runde(summeTotesKapital, 2),
      summe_umsatzverlust_schaetzung_eur: runde(summeUmsatzverlust, 2),
    },
    artikel,
  };
}

module.exports = { rechne };
