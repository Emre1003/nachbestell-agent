// ---------------------------------------------------------------------------
// Kompakte Pruefsumme ueber ALLE berechneten Zahlen des Laufs.
//
// Zweck: Zwei Laeufe lassen sich in einer Zeile vergleichen, ohne 25 Artikel
// durchzusehen. Bleibt der Fingerabdruck gleich, sind die Zahlen identisch.
// Der LLM-Text geht bewusst NICHT ein — der darf sich unterscheiden, die
// Entscheidungen duerfen es nicht.
// ---------------------------------------------------------------------------

const d = $('Faktencheck').first().json;

// FNV-1a, damit keine externe Abhaengigkeit noetig ist.
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const ZAHLENFELDER = [
  'bestand_stueck', 'prognose_rate', 'reichweite_tage', 'meldeschwelle_tage',
  'bestellmenge_stueck', 'bestellwert_eur', 'gebundenes_kapital_eur',
  'fehltage', 'umsatzverlust_schaetzung_eur', 'trend_faktor', 'historie_tage',
];

const zeilen = d.artikel.map((a) => `${a.artikel_id}|${a.status}|` + ZAHLENFELDER.map((f) => a[f]).join('|'));
const fingerabdruck = fnv1a(zeilen.join('\n'));

const herkunft = {};
for (const a of d.artikel) herkunft[a.begruendung_herkunft] = (herkunft[a.begruendung_herkunft] || 0) + 1;

return [{
  json: {
    stichtag: d.stichtag,
    zahlen_fingerabdruck: fingerabdruck,
    artikel_gesamt: d.zusammenfassung.artikel_gesamt,
    anzahl_je_status: d.zusammenfassung.anzahl_je_status,
    summe_bestellwert_eur: d.zusammenfassung.summe_bestellwert_eur,
    summe_totes_kapital_eur: d.zusammenfassung.summe_totes_kapital_eur,
    summe_umsatzverlust_schaetzung_eur: d.zusammenfassung.summe_umsatzverlust_schaetzung_eur,
    faktencheck: {
      geprueft: d.faktencheck.geprueft,
      uebernommen: d.faktencheck.uebernommen,
      ersetzt: d.faktencheck.ersetzt,
      ohne_llm_antwort: d.faktencheck.ohne_llm_antwort,
      llm_antwort_geparst: d.faktencheck.llm_antwort_geparst,
    },
    begruendung_herkunft: herkunft,
    beanstandet_ids: d.faktencheck.beanstandet.map((b) => `${b.artikel_id}:${b.grund}`),
  },
}];
