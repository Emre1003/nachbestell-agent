'use strict';
// ---------------------------------------------------------------------------
// Erzeugt data/bestand.csv und data/verkaeufe.csv.
//
// ERFUNDENE Daten. Kein echter Kundendatensatz, nur eine realistische Struktur.
//
// Vollstaendig deterministisch: kein Math.random, kein Date-Objekt, keine
// Systemuhr. Derselbe Aufruf erzeugt an jedem Tag byte-identische Dateien.
// Die Verteilung der Tagesmengen entsteht aus festen Wochentagsgewichten plus
// Groesstrest-Verfahren — dadurch sehen die Zahlen unregelmaessig aus, treffen
// aber exakt die vorgegebene Summe.
//
// Aufruf:  node scripts/generate-data.js
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { isoZuTage, tageZuIso, wochentag } = require('./lib/datum');

const START_DATUM = '2026-05-26';
const ZEITRAUM_TAGE = 60; // -> Stichtag 2026-07-24

// Feste Wochentagsgewichte (0 = Sonntag). Summe exakt 7.0, damit der
// Durchschnitt ueber jede volle Woche 1.0 ergibt.
const WOCHENGEWICHT = [0.85, 1.05, 1.0, 1.0, 1.05, 1.15, 0.9];

// --- Sortiment -------------------------------------------------------------
// verkauf: Liste von Phasen { von, bis, total } mit Tagesindex 1..60.
// Leere Liste = dieser Artikel hat im gesamten Zeitraum keine einzige
// Verkaufszeile (bewusst, siehe Fall C).
const ARTIKEL = [
  // ---- FALL A: versteckter Brandherd -------------------------------------
  { id: 'TF-001', name: 'Medjool Datteln Premium 1kg', kat: 'Trockenfruechte', bestand: 40, ek: 8.90, vk: 19.90, vpe: 12, lieferzeit: 14,
    verkauf: [{ von: 1, bis: 46, total: 138 }, { von: 47, bis: 60, total: 84 }], fall: 'A' },

  // ---- FALL B: falscher Alarm --------------------------------------------
  { id: 'NU-014', name: 'Pekannusskerne 500g', kat: 'Nuesse', bestand: 6, ek: 4.20, vk: 9.90, vpe: 6, lieferzeit: 10,
    verkauf: [{ von: 1, bis: 46, total: 5 }], fall: 'B' },

  // ---- FALL C: totes Kapital (gar kein Absatz) ----------------------------
  { id: 'FK-021', name: 'Trueffel-Honig 250g', kat: 'Feinkost', bestand: 90, ek: 18.50, vk: 39.90, vpe: 6, lieferzeit: 21,
    verkauf: [], fall: 'C' },

  // ---- FALL C2: totes Kapital (Restabsatz, Reichweite > 180) --------------
  { id: 'NM-008', name: 'Macadamia-Mus 350g', kat: 'Nussmus', bestand: 60, ek: 12.90, vk: 26.90, vpe: 6, lieferzeit: 14,
    verkauf: [{ von: 1, bis: 46, total: 7 }, { von: 47, bis: 60, total: 1 }], fall: 'C2' },

  // ---- FALL D: zu wenig Daten (erst seit 8 Tagen im Sortiment) ------------
  { id: 'TF-025', name: 'Aprikosen soft 1kg', kat: 'Trockenfruechte', bestand: 55, ek: 6.40, vk: 14.90, vpe: 12, lieferzeit: 10,
    verkauf: [{ von: 53, bis: 60, total: 32 }], fall: 'D' },

  // ---- FALL E: JETZT_BESTELLEN -------------------------------------------
  { id: 'NU-002', name: 'Cashewkerne natur 1kg', kat: 'Nuesse', bestand: 120, ek: 11.20, vk: 22.90, vpe: 10, lieferzeit: 7,
    verkauf: [{ von: 1, bis: 60, total: 600 }], fall: 'E' },
  { id: 'TF-004', name: 'Sultaninen 1kg', kat: 'Trockenfruechte', bestand: 75, ek: 3.80, vk: 8.90, vpe: 12, lieferzeit: 5,
    verkauf: [{ von: 1, bis: 60, total: 540 }], fall: 'E' },
  { id: 'NM-003', name: 'Erdnussmus crunchy 500g', kat: 'Nussmus', bestand: 48, ek: 3.60, vk: 7.90, vpe: 12, lieferzeit: 10,
    verkauf: [{ von: 1, bis: 60, total: 216 }], fall: 'E' },
  { id: 'FK-011', name: 'Olivenoel Manaki 500ml', kat: 'Feinkost', bestand: 90, ek: 9.40, vk: 21.90, vpe: 6, lieferzeit: 14,
    verkauf: [{ von: 1, bis: 60, total: 300 }], fall: 'E' },

  // ---- FALL E: BEOBACHTEN -------------------------------------------------
  { id: 'NU-007', name: 'Mandeln blanchiert 1kg', kat: 'Nuesse', bestand: 160, ek: 10.50, vk: 21.90, vpe: 10, lieferzeit: 7,
    verkauf: [{ von: 1, bis: 60, total: 540 }], fall: 'E' },
  { id: 'TF-009', name: 'Feigen getrocknet 500g', kat: 'Trockenfruechte', bestand: 100, ek: 4.90, vk: 11.90, vpe: 12, lieferzeit: 10,
    verkauf: [{ von: 1, bis: 60, total: 300 }], fall: 'E' },
  { id: 'FK-015', name: 'Tahini Sesammus 500g', kat: 'Feinkost', bestand: 130, ek: 5.20, vk: 11.90, vpe: 6, lieferzeit: 12,
    verkauf: [{ von: 1, bis: 60, total: 330 }], fall: 'E' },

  // ---- FALL E: unauffaellig (OK) ------------------------------------------
  { id: 'NU-001', name: 'Walnusskerne hell 1kg', kat: 'Nuesse', bestand: 210, ek: 12.80, vk: 24.90, vpe: 10, lieferzeit: 7,
    verkauf: [{ von: 1, bis: 60, total: 360 }], fall: 'E' },
  { id: 'TF-002', name: 'Datteln Deglet Nour 1kg', kat: 'Trockenfruechte', bestand: 300, ek: 4.10, vk: 9.90, vpe: 12, lieferzeit: 10,
    verkauf: [{ von: 1, bis: 60, total: 480 }], fall: 'E' },
  { id: 'NM-001', name: 'Mandelmus weiss 500g', kat: 'Nussmus', bestand: 140, ek: 7.90, vk: 16.90, vpe: 6, lieferzeit: 14,
    verkauf: [{ von: 1, bis: 60, total: 180 }], fall: 'E' },
  { id: 'NU-005', name: 'Haselnusskerne 1kg', kat: 'Nuesse', bestand: 180, ek: 9.60, vk: 19.90, vpe: 10, lieferzeit: 7,
    verkauf: [{ von: 1, bis: 60, total: 240 }], fall: 'E' },
  { id: 'TF-006', name: 'Cranberries gesuesst 500g', kat: 'Trockenfruechte', bestand: 220, ek: 3.40, vk: 8.50, vpe: 12, lieferzeit: 5,
    verkauf: [{ von: 1, bis: 60, total: 300 }], fall: 'E' },
  { id: 'FK-002', name: 'Aceto Balsamico 250ml', kat: 'Feinkost', bestand: 95, ek: 6.80, vk: 15.90, vpe: 6, lieferzeit: 21,
    verkauf: [{ von: 1, bis: 60, total: 120 }], fall: 'E' },
  { id: 'NU-011', name: 'Pistazien geroestet 500g', kat: 'Nuesse', bestand: 130, ek: 13.50, vk: 27.90, vpe: 6, lieferzeit: 12,
    verkauf: [{ von: 1, bis: 60, total: 180 }], fall: 'E' },
  { id: 'TF-013', name: 'Mango-Streifen 250g', kat: 'Trockenfruechte', bestand: 160, ek: 5.60, vk: 12.90, vpe: 12, lieferzeit: 14,
    verkauf: [{ von: 1, bis: 60, total: 150 }], fall: 'E' },
  { id: 'NM-005', name: 'Haselnussmus 350g', kat: 'Nussmus', bestand: 85, ek: 8.40, vk: 17.90, vpe: 6, lieferzeit: 14,
    verkauf: [{ von: 1, bis: 60, total: 90 }], fall: 'E' },
  { id: 'FK-007', name: 'Meersalz Flocken 200g', kat: 'Feinkost', bestand: 110, ek: 2.90, vk: 7.90, vpe: 12, lieferzeit: 10,
    verkauf: [{ von: 1, bis: 60, total: 120 }], fall: 'E' },
  { id: 'NU-019', name: 'Paranuesse 500g', kat: 'Nuesse', bestand: 70, ek: 7.20, vk: 15.90, vpe: 6, lieferzeit: 12,
    verkauf: [{ von: 1, bis: 60, total: 60 }], fall: 'E' },
  { id: 'TF-018', name: 'Pflaumen entsteint 1kg', kat: 'Trockenfruechte', bestand: 140, ek: 4.60, vk: 10.90, vpe: 12, lieferzeit: 10,
    verkauf: [{ von: 1, bis: 60, total: 120 }], fall: 'E' },
  { id: 'FK-019', name: 'Harissa Paste 200g', kat: 'Feinkost', bestand: 65, ek: 3.90, vk: 9.50, vpe: 12, lieferzeit: 14,
    verkauf: [{ von: 1, bis: 60, total: 60 }], fall: 'E' },
];

// --- Verteilung: Groesstrest-Verfahren mit Wochentagsgewichten -------------
// Liefert ganzzahlige Tagesmengen, deren Summe exakt "total" ergibt.
function verteile(startNr, von, bis, total) {
  const tage = [];
  for (let t = von; t <= bis; t++) tage.push(startNr + (t - 1));

  const gewichte = tage.map((nr) => WOCHENGEWICHT[wochentag(nr)]);
  const gewichtSumme = gewichte.reduce((a, b) => a + b, 0);

  const roh = gewichte.map((g) => (total * g) / gewichtSumme);
  const basis = roh.map((r) => Math.floor(r));
  let rest = total - basis.reduce((a, b) => a + b, 0);

  // Groesster Nachkommaanteil bekommt zuerst ein Stueck. Gleichstand wird
  // ueber den Index aufgeloest -> vollstaendig deterministisch.
  const reihenfolge = roh
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => (b.frac !== a.frac ? b.frac - a.frac : a.i - b.i));

  const menge = basis.slice();
  for (let k = 0; k < reihenfolge.length && rest > 0; k++) {
    menge[reihenfolge[k].i] += 1;
    rest -= 1;
  }

  return tage.map((nr, i) => ({ tagNr: nr, menge: menge[i] }));
}

// --- Erzeugen ---------------------------------------------------------------
const startNr = isoZuTage(START_DATUM);
const stichtagNr = startNr + ZEITRAUM_TAGE - 1;

const bestandZeilen = ['artikel_id,artikelname,kategorie,bestand_stueck,ek_preis_eur,vk_preis_eur,vpe_stueck,lieferzeit_tage'];
for (const a of ARTIKEL) {
  bestandZeilen.push(
    [a.id, a.name, a.kat, a.bestand, a.ek.toFixed(2), a.vk.toFixed(2), a.vpe, a.lieferzeit].join(',')
  );
}

// Verkaufszeilen: chronologisch, je Tag alle Artikel. Tage ohne Absatz
// erzeugen KEINE Zeile — so sieht eine echte Verkaufshistorie aus.
const alleVerkaeufe = [];
for (const a of ARTIKEL) {
  for (const phase of a.verkauf) {
    for (const { tagNr, menge } of verteile(startNr, phase.von, phase.bis, phase.total)) {
      if (menge > 0) alleVerkaeufe.push({ tagNr, id: a.id, menge });
    }
  }
}
alleVerkaeufe.sort((x, y) => (x.tagNr !== y.tagNr ? x.tagNr - y.tagNr : x.id < y.id ? -1 : 1));

const verkaufZeilen = ['datum,artikel_id,menge'];
for (const v of alleVerkaeufe) {
  verkaufZeilen.push([tageZuIso(v.tagNr), v.id, v.menge].join(','));
}

const datenOrdner = path.join(__dirname, '..', 'data');
fs.mkdirSync(datenOrdner, { recursive: true });
fs.writeFileSync(path.join(datenOrdner, 'bestand.csv'), bestandZeilen.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(datenOrdner, 'verkaeufe.csv'), verkaufZeilen.join('\n') + '\n', 'utf8');

console.log(`bestand.csv    : ${ARTIKEL.length} Artikel`);
console.log(`verkaeufe.csv  : ${alleVerkaeufe.length} Verkaufszeilen`);
console.log(`Zeitraum       : ${tageZuIso(startNr)} bis ${tageZuIso(stichtagNr)} (${ZEITRAUM_TAGE} Tage)`);
console.log(`Artikel ohne jede Verkaufszeile: ${ARTIKEL.filter((a) => a.verkauf.length === 0).map((a) => a.id).join(', ') || '—'}`);
