// ---------------------------------------------------------------------------
// HTML-Report. Reine Darstellung — hier wird NICHTS gerechnet.
// Alle Zahlen kommen unveraendert aus dem Rechenkern.
// Keine externen Fonts, kein CDN, alles inline.
// ---------------------------------------------------------------------------

const d = $input.first().json;

const esc = (s) => String(s === null || s === undefined ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Deutsche Zahlenformatierung. Formatierung, keine Berechnung.
function nf(v, nk) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  const s = Number(v).toFixed(nk);
  const [g, k] = s.split('.');
  const gp = g.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return k ? `${gp},${k}` : gp;
}
const eur = (v) => (v === null || v === undefined ? '—' : nf(v, 2) + ' €');
const tage = (v) => (v === null || v === undefined ? '—' : nf(v, 1) + ' T');

const von = (s) => d.artikel.filter((a) => a.status === s);
const kritisch = von('KRITISCH');
const bestellen = von('JETZT_BESTELLEN');
const beobachten = von('BEOBACHTEN');
const totes = von('TOTES_KAPITAL');
const wenig = von('ZU_WENIG_DATEN');
const ok = von('OK');

function tabelle(kopf, zeilen) {
  if (!zeilen.length) return '<p class="leer">Kein Artikel in dieser Kategorie.</p>';
  return `<table><thead><tr>${kopf.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${zeilen.join('')}</tbody></table>`;
}

const zeileKritisch = kritisch.map((a) => `<tr>
  <td class="art"><strong>${esc(a.artikelname)}</strong><span class="id">${esc(a.artikel_id)}</span></td>
  <td class="n">${nf(a.bestand_stueck, 0)}</td>
  <td class="n warn">${tage(a.reichweite_tage)}</td>
  <td class="n">${nf(a.lieferzeit_tage, 0)} T</td>
  <td class="n warn">${nf(a.fehltage, 1)}</td>
  <td class="n warn">${eur(a.umsatzverlust_schaetzung_eur)}</td>
  <td class="n"><strong>${nf(a.bestellmenge_stueck, 0)}</strong><span class="vpe">VPE ${nf(a.vpe_stueck, 0)}</span></td>
  <td class="n">${eur(a.bestellwert_eur)}</td>
  <td class="txt">${esc(a.begruendung)}</td>
</tr>`).join('');

const zeileBestellen = bestellen.map((a) => `<tr>
  <td class="art"><strong>${esc(a.artikelname)}</strong><span class="id">${esc(a.artikel_id)}</span></td>
  <td class="n">${nf(a.bestand_stueck, 0)}</td>
  <td class="n">${tage(a.reichweite_tage)}</td>
  <td class="n">${nf(a.meldeschwelle_tage, 0)} T</td>
  <td class="n"><strong>${nf(a.bestellmenge_stueck, 0)}</strong><span class="vpe">VPE ${nf(a.vpe_stueck, 0)}</span></td>
  <td class="n">${eur(a.bestellwert_eur)}</td>
  <td class="txt">${esc(a.begruendung)}</td>
</tr>`).join('');

const zeileBeobachten = beobachten.map((a) => `<tr>
  <td class="art"><strong>${esc(a.artikelname)}</strong><span class="id">${esc(a.artikel_id)}</span></td>
  <td class="n">${nf(a.bestand_stueck, 0)}</td>
  <td class="n">${tage(a.reichweite_tage)}</td>
  <td class="n">${nf(a.meldeschwelle_tage, 0)} T</td>
  <td class="txt">${esc(a.begruendung)}</td>
</tr>`).join('');

const zeileTotes = totes.map((a) => `<tr>
  <td class="art"><strong>${esc(a.artikelname)}</strong><span class="id">${esc(a.artikel_id)}</span></td>
  <td class="n">${nf(a.bestand_stueck, 0)}</td>
  <td class="n kap">${eur(a.gebundenes_kapital_eur)}</td>
  <td class="n">${nf(a.verkauft_gesamt, 0)}</td>
  <td class="n">${a.reichweite_tage === null ? 'kein Absatz' : tage(a.reichweite_tage)}</td>
  <td class="txt">${esc(a.begruendung)}</td>
</tr>`).join('');

const zeileWenig = wenig.map((a) => `<tr>
  <td class="art"><strong>${esc(a.artikelname)}</strong><span class="id">${esc(a.artikel_id)}</span></td>
  <td class="n">${nf(a.bestand_stueck, 0)}</td>
  <td class="n">${nf(a.historie_tage, 0)} T</td>
  <td class="n"><em>keine Prognose moeglich</em></td>
  <td class="txt">${esc(a.begruendung)}</td>
</tr>`).join('');

const fc = d.faktencheck || {};

const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nachbestell-Report ${esc(d.stichtag)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 20px 64px; background: #f4f4f7; color: #16161d;
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
         font-size: 15px; line-height: 1.55; }
  .wrap { max-width: 1180px; margin: 0 auto; }
  header { background: #0a0a0f; color: #fff; padding: 28px 32px; border-radius: 10px 10px 0 0; }
  header h1 { margin: 0 0 6px; font-size: 26px; letter-spacing: -0.4px; }
  header .stichtag { color: #a9a9bd; font-size: 14px; margin: 0; }
  header .stichtag strong { color: #7c6fff; }
  .karte { background: #fff; padding: 28px 32px; border-radius: 0 0 10px 10px;
           box-shadow: 0 1px 3px rgba(0,0,0,.09); margin-bottom: 28px; }
  .fazit { font-size: 17px; line-height: 1.6; margin: 0 0 24px; padding: 16px 20px;
           background: #f6f5ff; border-left: 4px solid #7c6fff; border-radius: 4px; }
  .summen { display: flex; flex-wrap: wrap; gap: 14px; }
  .summe { flex: 1 1 210px; padding: 16px 18px; border: 1px solid #e3e3ec; border-radius: 8px; }
  .summe .label { font-size: 12px; text-transform: uppercase; letter-spacing: .6px; color: #6b6b80; margin-bottom: 6px; }
  .summe .wert { font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
  .summe.rot .wert { color: #b3261e; }
  .summe.grau .wert { color: #6b6b80; }
  section { background: #fff; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,.09);
            margin-bottom: 22px; overflow: hidden; }
  section > h2 { margin: 0; padding: 16px 24px; font-size: 15px; text-transform: uppercase;
                 letter-spacing: .9px; border-bottom: 1px solid #ececf3; }
  section > h2 .zahl { float: right; font-weight: 400; color: #6b6b80; letter-spacing: 0; text-transform: none; }
  h2.s1 { background: #fdf0ef; color: #b3261e; }
  h2.s2 { background: #fff8ec; color: #9a5b00; }
  h2.s3 { background: #eef4fd; color: #1a4f8a; }
  h2.s4 { background: #f3f3f7; color: #4a4a5c; }
  h2.s5 { background: #f7f7fa; color: #6b6b80; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; padding: 10px 14px; font-size: 11px; text-transform: uppercase;
       letter-spacing: .5px; color: #6b6b80; border-bottom: 1px solid #ececf3; white-space: nowrap; }
  td { padding: 12px 14px; border-bottom: 1px solid #f2f2f7; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  td.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.n.warn { color: #b3261e; font-weight: 600; }
  td.n.kap { color: #4a4a5c; font-weight: 600; }
  td.art { min-width: 190px; }
  td.art .id { display: block; font-size: 11px; color: #8a8a9e; margin-top: 2px; }
  td.n .vpe { display: block; font-size: 11px; color: #8a8a9e; font-weight: 400; }
  td.txt { color: #3a3a48; min-width: 260px; }
  .leer { padding: 18px 24px; color: #8a8a9e; font-style: italic; margin: 0; }
  .ok-zeile { padding: 16px 24px; color: #4a4a5c; font-size: 14px; }
  footer { max-width: 1180px; margin: 0 auto; padding: 20px 4px; color: #6b6b80; font-size: 12.5px; }
  footer .marke { color: #16161d; font-weight: 600; }
  .pruef { margin-top: 8px; color: #8a8a9e; }
  @media print { body { background: #fff; padding: 0; } section, .karte { box-shadow: none; } }
</style>
</head>
<body>
<div class="wrap">

<header>
  <h1>Nachbestell-Report</h1>
  <p class="stichtag">Stichtag <strong>${esc(d.stichtag)}</strong> &nbsp;·&nbsp; ${nf(d.datensatz_tage, 0)} Tage Verkaufshistorie &nbsp;·&nbsp; ${nf(d.zusammenfassung.artikel_gesamt, 0)} Artikel geprueft</p>
</header>

<div class="karte">
  <p class="fazit">${esc(d.zusammenfassung_text)}</p>
  <div class="summen">
    <div class="summe"><div class="label">Bestellvorschlag gesamt</div><div class="wert">${eur(d.zusammenfassung.summe_bestellwert_eur)}</div></div>
    <div class="summe grau"><div class="label">Totes Kapital</div><div class="wert">${eur(d.zusammenfassung.summe_totes_kapital_eur)}</div></div>
    <div class="summe rot"><div class="label">Drohender Umsatzverlust</div><div class="wert">${eur(d.zusammenfassung.summe_umsatzverlust_schaetzung_eur)}</div></div>
  </div>
</div>

<section>
  <h2 class="s1">Sofort handeln<span class="zahl">${kritisch.length} Artikel</span></h2>
  ${tabelle(['Artikel', 'Bestand', 'Reichweite', 'Lieferzeit', 'Fehltage', 'Umsatzverlust', 'Bestellmenge', 'Bestellwert', 'Begruendung'], [zeileKritisch])}
</section>

<section>
  <h2 class="s2">Jetzt bestellen<span class="zahl">${bestellen.length} Artikel</span></h2>
  ${tabelle(['Artikel', 'Bestand', 'Reichweite', 'Meldeschwelle', 'Bestellmenge', 'Bestellwert', 'Begruendung'], [zeileBestellen])}
</section>

<section>
  <h2 class="s3">Beobachten<span class="zahl">${beobachten.length} Artikel</span></h2>
  ${tabelle(['Artikel', 'Bestand', 'Reichweite', 'Meldeschwelle', 'Begruendung'], [zeileBeobachten])}
</section>

<section>
  <h2 class="s4">Totes Kapital<span class="zahl">${totes.length} Artikel · ${eur(d.zusammenfassung.summe_totes_kapital_eur)} gebunden</span></h2>
  ${tabelle(['Artikel', 'Bestand', 'Gebundenes Kapital', 'Verkauft gesamt', 'Reichweite', 'Begruendung'], [zeileTotes])}
</section>

<section>
  <h2 class="s5">Keine Prognose moeglich<span class="zahl">${wenig.length} Artikel</span></h2>
  ${tabelle(['Artikel', 'Bestand', 'Historie', 'Prognose', 'Begruendung'], [zeileWenig])}
  <div class="ok-zeile">Ausserdem ohne Handlungsbedarf: <strong>${ok.length} Artikel</strong> mit Status OK.</div>
</section>

</div>
<footer>
  <div><span class="marke">aigency-ai.de</span> &nbsp;|&nbsp; emre@aigency-ai.de &nbsp;|&nbsp; Berlin</div>
  <div class="pruef">Alle Zahlen stammen aus dem Rechenkern, nicht aus dem Sprachmodell. Faktencheck: ${nf(fc.uebernommen, 0)} von ${nf(fc.geprueft, 0)} Begruendungen uebernommen, ${nf(fc.ersetzt, 0)} ersetzt.</div>
</footer>
</body>
</html>`;

return [{ json: { html, dateiname: `nachbestell-report-${d.stichtag}.html`, stichtag: d.stichtag, faktencheck: d.faktencheck, zusammenfassung: d.zusammenfassung } }];
