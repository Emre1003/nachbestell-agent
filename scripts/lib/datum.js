'use strict';
// Reine Integer-Datumsarithmetik. Bewusst OHNE Date-Objekt, damit das Ergebnis
// unter keinen Umstaenden vom Ausfuehrungszeitpunkt oder von der Zeitzone abhaengt.
// Algorithmus: days_from_civil / civil_from_days (Howard Hinnant, public domain).

function tageAusDatum(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function datumAusTage(z) {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return [y + (m <= 2 ? 1 : 0), m, d];
}

// 'YYYY-MM-DD' -> Tagesnummer (Tage seit 1970-01-01)
function isoZuTage(iso) {
  const t = String(iso).trim().split('-');
  return tageAusDatum(Number(t[0]), Number(t[1]), Number(t[2]));
}

// Tagesnummer -> 'YYYY-MM-DD'
function tageZuIso(z) {
  const [y, m, d] = datumAusTage(z);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 0 = Sonntag ... 6 = Samstag. (1970-01-01 war ein Donnerstag -> Tag 0 ergibt 4.)
function wochentag(z) {
  return ((z + 4) % 7 + 7) % 7;
}

module.exports = { tageAusDatum, datumAusTage, isoZuTage, tageZuIso, wochentag };
