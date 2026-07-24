# Testfälle

Die Daten in `bestand.csv` und `verkaeufe.csv` sind **erfunden**. Keine echten
Kundendaten, nur eine realistische Struktur (Trockenfrüchte, Nüsse, Nussmus, Feinkost).

**Zeitraum:** 2026-05-26 bis 2026-07-24 (60 Tage)
**Stichtag:** 2026-07-24 — das späteste Datum in `verkaeufe.csv`, nicht der Ausführungstag
**Umfang:** 25 Artikel, 1.281 Verkaufszeilen

Die Daten sind fest im Repo abgelegt. `scripts/generate-data.js` dokumentiert, wie sie
entstanden sind — ohne `Math.random`, ohne Date-Objekt, mit festen Wochentagsgewichten
und Größtrest-Verfahren. Zwei Läufe erzeugen byte-identische Dateien (per `shasum` geprüft).

Alle unten genannten Werte sind **berechnet, nicht behauptet**. Nachprüfbar mit:

```bash
node scripts/verify-testfaelle.js
```

---

## Fall A — "versteckter Brandherd"

**TF-001 · Medjool Datteln Premium 1kg** → Status **KRITISCH**

Der Artikel sieht mit 40 Stück auf dem Papier harmlos aus. Er verkauft sich aber seit
zwei Wochen doppelt so schnell wie vorher, und die Lieferzeit ist mit 14 Tagen lang.
Der Bestand reicht keine 8 Tage mehr — der Artikel ist ausverkauft, bevor Ware ankommt.
Genau das ist der Fall, den eine Bestandsliste nicht zeigt.

| Kennzahl | Wert |
|---|---|
| Bestand | 40 Stück |
| Verkauft gesamt (60 Tage) | 222 Stück |
| Verkauft letzte 14 Tage | 84 Stück |
| Tagesrate kurz (14 T.) | 6,0 /Tag |
| Tagesrate lang (60 T.) | 3,7 /Tag |
| Trendfaktor | 1,62 |
| Prognoserate | 5,31 /Tag |
| **Reichweite** | **7,5 Tage** |
| Lieferzeit | 14 Tage |
| Bestellmenge | 276 Stück (23 × VPE 12) |
| Bestellwert | 2.456,40 € |
| Fehltage | 6,5 |
| Geschätzter Umsatzverlust | 683,37 € |

Erwartung erfüllt: Reichweite unter 10 Tagen ✅, Status KRITISCH ✅

**Nachrechnung von Hand:**
`84 / 14 = 6,0` · `222 / 60 = 3,7` · `0,7 × 6,0 + 0,3 × 3,7 = 5,31` ·
`40 / 5,31 = 7,53` · `7,53 < 14` → KRITISCH ·
`(45 + 14) × 5,31 − 40 = 273,29` · `aufrunden(273,29 / 12) = 23` · `23 × 12 = 276`

---

## Fall B — "falscher Alarm"

**NU-014 · Pekannusskerne 500g** → Status **OK**

Nur 6 Stück auf Lager. Jede Ampel-Logik, die auf absolute Bestandszahlen schaut, würde
hier Alarm schlagen. Der Artikel verkauft sich aber praktisch nicht — in den letzten
14 Tagen kein einziges Stück. Der Bestand reicht über 7 Monate. Nachbestellen wäre
Geldverbrennung.

| Kennzahl | Wert |
|---|---|
| Bestand | 6 Stück |
| Verkauft gesamt | 5 Stück |
| Verkauft letzte 14 Tage | 0 Stück |
| Prognoserate | 0,026 /Tag |
| **Reichweite** | **228 Tage** |
| Gebundenes Kapital | 25,20 € |
| Bestellmenge | — (keine) |

Erwartung erfüllt: Reichweite über 90 Tagen ✅, Status OK ✅, keine Bestellung ✅

> Warum nicht TOTES_KAPITAL, obwohl die Reichweite über 180 Tagen liegt?
> Weil nur 25,20 € gebunden sind. Die Schwelle liegt bei 100 €. Ein Ladenhüter,
> der kein nennenswertes Kapital bindet, ist kein Problem, das eine Meldung wert wäre.

---

## Fall C — "totes Kapital"

**FK-021 · Trüffel-Honig 250g** → Status **TOTES_KAPITAL**

Der Artikel hat in 60 Tagen **keine einzige Verkaufszeile**. 1.665 € liegen im Regal
und arbeiten nicht.

| Kennzahl | Wert |
|---|---|
| Bestand | 90 Stück |
| EK-Preis | 18,50 € |
| Verkauft gesamt | 0 Stück |
| Prognoserate | 0 /Tag |
| Reichweite | — (keine Division durch null) |
| **Gebundenes Kapital** | **1.665,00 €** |

Erwartung erfüllt: Kapital über 1.000 € ✅, Status TOTES_KAPITAL ✅

> Dieser Artikel ist gleichzeitig der **Randfall-Test**: Prognoserate 0 → es wird
> nicht dividiert, die Reichweite bleibt `null`. Kein `Infinity`, kein `NaN`.
> Der Statuscheck vergleicht deshalb nie gegen `null` — sonst würde `null < 21`
> als `0 < 21` ausgewertet und der Ladenhüter fälschlich als KRITISCH gemeldet.

---

## Fall C2 — totes Kapital mit Restabsatz

**NM-008 · Macadamia-Mus 350g** → Status **TOTES_KAPITAL**

Zweiter Weg in denselben Status: Der Artikel verkauft sich noch, aber so langsam,
dass der Bestand rechnerisch 651 Tage hält.

| Kennzahl | Wert |
|---|---|
| Bestand | 60 Stück |
| Verkauft gesamt | 8 Stück |
| Prognoserate | 0,092 /Tag |
| **Reichweite** | **651,4 Tage** |
| Gebundenes Kapital | 774,00 € |

Damit sind beide Pfade zu TOTES_KAPITAL abgedeckt: über Rate = 0 (Fall C) und über
Reichweite > 180 Tage bei Kapital > 100 € (Fall C2).

---

## Fall D — "zu wenig Daten"

**TF-025 · Aprikosen soft 1kg** → Status **ZU_WENIG_DATEN**

Der Artikel ist erst seit 8 Tagen im Sortiment. Aus 8 Tagen eine 45-Tage-Prognose
abzuleiten wäre Scheingenauigkeit. Der Agent sagt das offen, statt eine Zahl zu erfinden.

| Kennzahl | Wert |
|---|---|
| Bestand | 55 Stück |
| Historie | **8 Tage** (Mindestanforderung: 14) |
| Verkauft gesamt | 32 Stück |
| Prognoserate | — verworfen |
| Reichweite | — verworfen |
| Bestellmenge | — (keine) |

Erwartung erfüllt: Status ZU_WENIG_DATEN ✅, keine Prognose ✅

> Die Prognosefelder werden im Rechenkern **aktiv auf `null` gesetzt**, sobald der
> Status ZU_WENIG_DATEN lautet. Rechnerisch ließe sich eine Reichweite bilden — sie
> soll aber gar nicht erst existieren, damit sie nicht versehentlich im Report landet.

---

## Fall E — der unauffällige Rest

| Status | Anzahl | Artikel |
|---|---|---|
| JETZT_BESTELLEN | 4 | TF-004, NU-002, NM-003, FK-011 |
| BEOBACHTEN | 3 | NU-007, TF-009, FK-015 |
| OK | 14 | übrige |

Erwartung erfüllt: 3–4 im Bereich JETZT_BESTELLEN ✅, 2–3 im Bereich BEOBACHTEN ✅

---

## Gesamtergebnis

| Status | Anzahl |
|---|---|
| KRITISCH | 1 |
| JETZT_BESTELLEN | 4 |
| BEOBACHTEN | 3 |
| TOTES_KAPITAL | 2 |
| ZU_WENIG_DATEN | 1 |
| OK | 14 |
| **Summe** | **25** |

| Summe | Wert |
|---|---|
| Bestellwert gesamt | 10.786,00 € |
| Totes Kapital gesamt | 2.439,00 € |
| Geschätzter Umsatzverlust | 683,37 € |

`node scripts/verify-testfaelle.js` → **27 von 27 Prüfungen bestanden**
