'use strict';
// ---------------------------------------------------------------------------
// Paritaetstest: rechnet der Code-Node in n8n dasselbe wie der Rechenkern im Repo?
//
// Die ERWARTET-Werte unten stammen aus einer echten n8n-Ausfuehrung
// (Workflow HnN7dtSsExAvpdQm, Execution 1646, 2026-07-24). Sie sind hier
// festgeschrieben. Weicht der lokale Rechenkern davon ab, schlaegt der Test fehl —
// egal ob jemand den Repo-Code oder den n8n-Node geaendert hat.
//
// Aufruf:  node scripts/verify-n8n-parity.js
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

const d = path.join(__dirname, '..', 'data');
const lokal = rechne(csvLesen(path.join(d, 'bestand.csv')), csvLesen(path.join(d, 'verkaeufe.csv')));

// --- Aus n8n Execution 1646 abgelesen -------------------------------------
const N8N = {
  stichtag: '2026-07-24',
  datensatz_tage: 60,
  zusammenfassung: {
    artikel_gesamt: 25,
    anzahl_je_status: { KRITISCH: 1, JETZT_BESTELLEN: 4, BEOBACHTEN: 3, TOTES_KAPITAL: 2, ZU_WENIG_DATEN: 1, OK: 14 },
    summe_bestellwert_eur: 10786,
    summe_totes_kapital_eur: 2439,
    summe_umsatzverlust_schaetzung_eur: 683.37,
  },
  // Reihenfolge = Sortierung wie im n8n-Output
  artikel: [
    ['TF-001', 'KRITISCH', 5.31, 7.5, 276, 2456.4, 683.37],
    ['TF-004', 'JETZT_BESTELLEN', 8.9, 8.4, 372, 1413.6, null],
    ['NU-002', 'JETZT_BESTELLEN', 9.9, 12.1, 400, 4480, null],
    ['NM-003', 'JETZT_BESTELLEN', 3.48, 13.8, 144, 518.4, null],
    ['FK-011', 'JETZT_BESTELLEN', 4.95, 18.2, 204, 1917.6, null],
    ['NU-007', 'BEOBACHTEN', 8.9, 18, null, null, null],
    ['TF-009', 'BEOBACHTEN', 4.95, 20.2, null, null, null],
    ['FK-015', 'BEOBACHTEN', 5.45, 23.9, null, null, null],
    ['NM-008', 'TOTES_KAPITAL', 0.092, 651.4, null, null, null],
    ['FK-021', 'TOTES_KAPITAL', 0, null, null, null, null],
    ['TF-025', 'ZU_WENIG_DATEN', null, null, null, null, null],
    ['NU-001', 'OK', 5.95, 35.3, null, null, null],
    ['TF-002', 'OK', 7.9, 38, null, null, null],
    ['NU-011', 'OK', 3, 43.3, null, null, null],
    ['TF-006', 'OK', 4.95, 44.4, null, null, null],
    ['NU-005', 'OK', 3.95, 45.6, null, null, null],
    ['NM-001', 'OK', 3, 46.7, null, null, null],
    ['FK-002', 'OK', 2, 47.5, null, null, null],
    ['FK-007', 'OK', 2, 55, null, null, null],
    ['NM-005', 'OK', 1.45, 58.6, null, null, null],
    ['FK-019', 'OK', 1, 65, null, null, null],
    ['TF-013', 'OK', 2.45, 65.3, null, null, null],
    ['NU-019', 'OK', 1, 70, null, null, null],
    ['TF-018', 'OK', 2, 70, null, null, null],
    ['NU-014', 'OK', 0.026, 228, null, null, null],
  ],
};

let fehler = 0;
const pruefe = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fehler++;
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name.padEnd(58)} n8n: ${JSON.stringify(soll)}  lokal: ${JSON.stringify(ist)}`);
};

pruefe('Stichtag', lokal.stichtag, N8N.stichtag);
pruefe('Datensatz-Tage', lokal.datensatz_tage, N8N.datensatz_tage);
pruefe('Artikel gesamt', lokal.zusammenfassung.artikel_gesamt, N8N.zusammenfassung.artikel_gesamt);
pruefe('Anzahl je Status', lokal.zusammenfassung.anzahl_je_status, N8N.zusammenfassung.anzahl_je_status);
pruefe('Summe Bestellwert', lokal.zusammenfassung.summe_bestellwert_eur, N8N.zusammenfassung.summe_bestellwert_eur);
pruefe('Summe totes Kapital', lokal.zusammenfassung.summe_totes_kapital_eur, N8N.zusammenfassung.summe_totes_kapital_eur);
pruefe('Summe Umsatzverlust', lokal.zusammenfassung.summe_umsatzverlust_schaetzung_eur, N8N.zusammenfassung.summe_umsatzverlust_schaetzung_eur);

pruefe('Artikelreihenfolge', lokal.artikel.map((a) => a.artikel_id), N8N.artikel.map((r) => r[0]));

for (let i = 0; i < N8N.artikel.length; i++) {
  const [id, status, rate, reichweite, menge, wert, verlust] = N8N.artikel[i];
  const a = lokal.artikel[i];
  pruefe(
    `${id} (Status/Rate/Reichweite/Menge/Wert/Verlust)`,
    [a.artikel_id, a.status, a.prognose_rate, a.reichweite_tage, a.bestellmenge_stueck, a.bestellwert_eur, a.umsatzverlust_schaetzung_eur],
    [id, status, rate, reichweite, menge, wert, verlust]
  );
}

console.log(`\n${fehler === 0 ? 'Paritaet bestaetigt' : 'PARITAET VERLETZT'}: ${N8N.artikel.length + 8 - fehler}/${N8N.artikel.length + 8} Pruefungen bestanden.`);
process.exit(fehler === 0 ? 0 : 1);
