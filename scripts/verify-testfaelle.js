'use strict';
// ---------------------------------------------------------------------------
// Prueft die erzeugten Daten gegen die in data/TESTFAELLE.md dokumentierten
// Erwartungen — mit demselben Rechenkern, der spaeter im n8n Code-Node laeuft.
//
// Zweck: die Testfaelle sind damit BELEGT und nicht behauptet. Schlaegt eine
// Erwartung fehl, endet der Prozess mit Exit-Code 1.
//
// Aufruf:  node scripts/verify-testfaelle.js
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { rechne } = require('./lib/rechenkern');

function csvLesen(datei) {
  const text = fs.readFileSync(datei, 'utf8').replace(/\r\n/g, '\n').trim();
  const zeilen = text.split('\n');
  const kopf = zeilen[0].split(',').map((s) => s.trim());
  return zeilen.slice(1).map((z) => {
    const felder = z.split(',');
    const o = {};
    kopf.forEach((k, i) => { o[k] = (felder[i] || '').trim(); });
    return o;
  });
}

const datenOrdner = path.join(__dirname, '..', 'data');
const bestand = csvLesen(path.join(datenOrdner, 'bestand.csv'));
const verkaeufe = csvLesen(path.join(datenOrdner, 'verkaeufe.csv'));

const e = rechne(bestand, verkaeufe);
const byId = Object.fromEntries(e.artikel.map((a) => [a.artikel_id, a]));

console.log(`\nStichtag: ${e.stichtag}   Datensatz: ${e.datensatz_tage} Tage   Artikel: ${e.artikel.length}`);
console.log(`Verkaufszeilen: ${verkaeufe.length}\n`);

// --- Gesamtuebersicht -------------------------------------------------------
const spalten = ['artikel_id', 'status', 'bestand_stueck', 'prognose_rate', 'reichweite_tage', 'meldeschwelle_tage', 'bestellmenge_stueck', 'gebundenes_kapital_eur'];
console.log(spalten.map((s) => s.padEnd(s === 'artikel_id' ? 10 : 20)).join(''));
console.log('-'.repeat(150));
for (const a of e.artikel) {
  console.log(spalten.map((s) => String(a[s] === null ? '—' : a[s]).padEnd(s === 'artikel_id' ? 10 : 20)).join(''));
}

console.log('\nZusammenfassung:', JSON.stringify(e.zusammenfassung, null, 2));

// --- Erwartungen ------------------------------------------------------------
const pruefungen = [];
const p = (name, ok, ist) => pruefungen.push({ name, ok, ist });

const A = byId['TF-001'];
p('FALL A  TF-001 Status = KRITISCH', A.status === 'KRITISCH', A.status);
p('FALL A  TF-001 Reichweite < 10 Tage', A.reichweite_tage < 10, `${A.reichweite_tage} Tage`);
p('FALL A  TF-001 Lieferzeit = 14', A.lieferzeit_tage === 14, A.lieferzeit_tage);
p('FALL A  TF-001 Trend: kurz deutlich > lang', A.trend_faktor > 1.3, `Faktor ${A.trend_faktor}`);
p('FALL A  TF-001 Bestellmenge ist Vielfaches der VPE', A.bestellmenge_stueck % A.vpe_stueck === 0, `${A.bestellmenge_stueck} / VPE ${A.vpe_stueck}`);
p('FALL A  TF-001 Umsatzverlust geschaetzt', A.umsatzverlust_schaetzung_eur > 0, `${A.umsatzverlust_schaetzung_eur} EUR`);

const B = byId['NU-014'];
p('FALL B  NU-014 Status = OK', B.status === 'OK', B.status);
p('FALL B  NU-014 Reichweite > 90 Tage', B.reichweite_tage > 90, `${B.reichweite_tage} Tage`);
p('FALL B  NU-014 keine Bestellung', B.bestellmenge_stueck === null, B.bestellmenge_stueck);
p('FALL B  NU-014 Bestand niedrig (<= 6)', B.bestand_stueck <= 6, B.bestand_stueck);

const C = byId['FK-021'];
p('FALL C  FK-021 Status = TOTES_KAPITAL', C.status === 'TOTES_KAPITAL', C.status);
p('FALL C  FK-021 Kapital > 1000 EUR', C.gebundenes_kapital_eur > 1000, `${C.gebundenes_kapital_eur} EUR`);
p('FALL C  FK-021 keine Verkaufszeile', C.verkauft_gesamt === 0, C.verkauft_gesamt);
p('FALL C  FK-021 Reichweite = null (keine Division)', C.reichweite_tage === null, String(C.reichweite_tage));

const C2 = byId['NM-008'];
p('FALL C2 NM-008 Status = TOTES_KAPITAL', C2.status === 'TOTES_KAPITAL', C2.status);
p('FALL C2 NM-008 Reichweite > 180 Tage', C2.reichweite_tage > 180, `${C2.reichweite_tage} Tage`);

const D = byId['TF-025'];
p('FALL D  TF-025 Status = ZU_WENIG_DATEN', D.status === 'ZU_WENIG_DATEN', D.status);
p('FALL D  TF-025 Historie = 8 Tage', D.historie_tage === 8, `${D.historie_tage} Tage`);
p('FALL D  TF-025 keine Prognose/Bestellung', D.bestellmenge_stueck === null, String(D.bestellmenge_stueck));
p('FALL D  TF-025 Reichweite verworfen (null)', D.reichweite_tage === null, String(D.reichweite_tage));
p('FALL D  TF-025 Prognoserate verworfen (null)', D.prognose_rate === null, String(D.prognose_rate));

const n = e.zusammenfassung.anzahl_je_status;
p('FALL E  3-4 Artikel JETZT_BESTELLEN', n.JETZT_BESTELLEN >= 3 && n.JETZT_BESTELLEN <= 4, n.JETZT_BESTELLEN);
p('FALL E  2-3 Artikel BEOBACHTEN', n.BEOBACHTEN >= 2 && n.BEOBACHTEN <= 3, n.BEOBACHTEN);
p('Gesamt  25 Artikel', e.artikel.length === 25, e.artikel.length);
p('Gesamt  Stichtag aus Daten, nicht aus Systemuhr', e.stichtag === '2026-07-24', e.stichtag);

// --- Randfaelle: kein NaN, kein undefined irgendwo -------------------------
const zahlFelder = ['prognose_rate', 'tagesrate_kurz', 'tagesrate_lang', 'gebundenes_kapital_eur'];
const kaputt = e.artikel.filter((a) => zahlFelder.some((f) => a[f] === undefined || Number.isNaN(a[f])));
p('Randfall NaN/undefined in Kennzahlen', kaputt.length === 0, `${kaputt.length} Artikel betroffen`);
const reichweiteKaputt = e.artikel.filter((a) => a.reichweite_tage !== null && !Number.isFinite(a.reichweite_tage));
p('Randfall Reichweite ist endlich oder null', reichweiteKaputt.length === 0, `${reichweiteKaputt.length} Artikel betroffen`);

// --- Ausgabe ----------------------------------------------------------------
console.log('\n--- Testfaelle ---');
let fehler = 0;
for (const t of pruefungen) {
  if (!t.ok) fehler++;
  console.log(`${t.ok ? 'OK  ' : 'FAIL'}  ${t.name.padEnd(52)} ist: ${t.ist}`);
}
console.log(`\n${pruefungen.length - fehler}/${pruefungen.length} bestanden.`);
process.exit(fehler === 0 ? 0 : 1);
