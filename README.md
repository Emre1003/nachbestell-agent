# Nachbestell-Agent

> SKAILE Building Challenge — Projekt von Emre Yildirim (Aigency).

## Das Problem

Ein Onlineshop-Betreiber sieht seiner Bestandsliste nicht an, welche Artikel gleich leer sind — nachbestellt wird nach Bauchgefühl oder erst, wenn ein Artikel schon ausverkauft ist. Beides kostet Geld: entgangener Umsatz bei Ausverkauf, totes Kapital bei Überbestand. Die Zahlen liegen alle vor, aber niemand rechnet sie wöchentlich pro Artikel durch.

## Was der Agent macht

Der Agent bekommt den aktuellen Lagerbestand und die Verkäufe der letzten 60 Tage. Daraus berechnet er pro Artikel die Verkaufsgeschwindigkeit und die verbleibende Reichweite in Tagen und vergleicht sie mit der Lieferzeit. Heraus kommt eine fertige Bestellliste mit konkreter Menge und Begründung pro Artikel, plus eine Liste der Ladenhüter mit dem darin gebundenen Kapital. Der Agent zeigt keine Zahlen an — er trifft eine Entscheidung und begründet sie.

## Stack

- [x] Claude Code (Agent / Skills)
- [x] n8n
- [ ] Sonstiges: —

## So läuft der Agent

In vier Schritten, von der Rohdatei bis zum fertigen Report:

1. **Daten laden** — Bestandsliste und 60 Tage Verkaufshistorie werden als CSV geladen und geparst.
2. **Rechnen** — ein Code-Node berechnet pro Artikel Verkaufsgeschwindigkeit, Reichweite in Tagen, Trend und Bestellmenge und vergibt einen Status. **Hier entsteht jede Zahl des Reports. Kein Sprachmodell ist beteiligt.**
3. **Begründen und prüfen** — Claude formuliert pro Artikel einen Satz. Anschließend prüft ein zweiter Code-Node jede Zahl in diesen Sätzen gegen die echten Werte. Was sich nicht belegen lässt, wird durch eine feste Begründung ersetzt.
4. **Report ausgeben** — HTML-Report zum Herunterladen: sofort handeln, jetzt bestellen, beobachten, totes Kapital, und am Ende ehrlich die Artikel, für die die Datenlage keine Prognose hergibt.

Der Stichtag ist immer das späteste Datum in den Verkaufsdaten, nie das Systemdatum. Dadurch liefert derselbe Datensatz an jedem Tag dasselbe Ergebnis.

Beispielausgabe: [`beispiel-report.html`](beispiel-report.html) · Workflow: [`workflow/nachbestell-agent.json`](workflow/nachbestell-agent.json)

## Setup

Läuft mit Claude Code und n8n. Der Agent arbeitet auf erfundenen Beispieldaten mit realistischer Struktur — **keine echten Kundendaten im Repo**. API-Keys gehören in die `.env` (siehe `.env.example`), Credentials bleiben in n8n, niemals im Repo.

Schritt-für-Schritt-Anleitung: **[INSTALL.md](INSTALL.md)** — an Claude adressiert, damit ein fremder Claude den Agenten in einer fremden n8n-Instanz einrichten kann.

Alles selbst nachprüfen:

```bash
node scripts/generate-data.js      # erzeugt die Beispieldaten neu (byte-identisch)
node scripts/verify-testfaelle.js  # prüft die dokumentierten Testfälle
node scripts/verify-n8n-parity.js  # prüft Repo-Rechenkern gegen n8n-Lauf
```

## Was während der Challenge entstanden ist

- **Vorher:** Vorwissen aus einem laufenden Kundenprojekt zum Thema Lagerbestandsauswertung.
- **Neu (ab Challenge-Start):** Der Agent selbst, seine komplette Logik und der gesamte n8n-Workflow. Nichts davon existierte vorher.
- Beispiel-Datensatz (erfunden, realistische Struktur) mit fünf bewusst eingebauten Testfällen, dokumentiert in [`data/TESTFAELLE.md`](data/TESTFAELLE.md).
- Deterministischer Faktencheck, der verhindert, dass eine erfundene Zahl in den Report kommt.

## Learnings

**1. Der Faktencheck war kein Deko-Feature — er hat den einen Ernstfall abgefangen, der tatsächlich eintrat.**

In einem Testlauf fielen plötzlich **alle 25 Begründungen** auf die fest formulierten Ersatzsätze zurück. Ursache war nicht das Sprachmodell, sondern mein eigener Code: Claude hatte den JSON-Schlüssel als `"begründungen"` geschrieben, mit Umlaut — mein Parser suchte nach `begruendungen`. Ergebnis: kein einziger Satz wurde gefunden.

Das Entscheidende daran: **Der Report war trotzdem vollständig korrekt.** Jede Zahl stimmte, jede Entscheidung stand, nur die Formulierungen waren nüchterner. Genau dafür war die Sperre gebaut — für den Fall, dass die Textstufe ausfällt, ohne dass es jemand merkt. Hätte ich dem Modell die Zahlen anvertraut, wäre dieser Lauf still kaputt gewesen. Der Fix war anschließend eine Zeile (Schlüsselnamen normalisieren), aber gefunden habe ich den Fehler nur, weil ein Zähler im Output ihn sichtbar gemacht hat.

**2. Zwei weitere Fehler, die ich beim Lesen des eigenen Outputs gefunden habe — nicht beim Testen.**

- Der Faktencheck ließ „reicht nur noch **7** Tage" durchgehen, obwohl der echte Wert 7,5 war. Die 7 war formal gedeckt, weil sie zufällig einem Parameter entsprach. Allerweltszahlen wie 7 oder 100 global zu erlauben reißt ein Loch in die Prüfung.
- Umgekehrt ersetzte der Faktencheck einen *korrekten* Satz („keine zuverlässige Prognose möglich"), weil meine Regel stumpf auf das Wort „Prognose" prüfte statt auf eine tatsächlich behauptete Prognose.

Beide Male war die Prüflogik das Problem, nicht das Modell. Und beide Male hätte ein grüner Testlauf nichts verraten — der Workflow lief ja durch.

**3. Das Modell schnitt Zahlen ab, statt zu runden.** 13,8 wurde zu 13, 23,9 zu 23. Der Faktencheck hat das zuverlässig gefangen, aber fünf ersetzte Sätze pro Lauf sind lästig. Eine Zeile im Systemprompt („übernimm Zahlen exakt, runde nicht") hat die Quote von 20/26 auf 26/26 gehoben. Die Sperre repariert Symptome — besser ist, die Ursache abzustellen.

**Bewusste Grenze:** Der Faktencheck prüft, ob eine Zahl in den Daten dieses Artikels **vorkommt** — nicht, ob sie im richtigen **Zusammenhang** steht. Nur für die Reichweite gibt es eine zusätzliche Kontextprüfung, weil sie die Zahl ist, auf der die Entscheidung beruht. Das ist eine Abwägung, kein Versehen: eine vollständige semantische Prüfung wäre selbst wieder fehleranfällig.

---

**Demo-Video:** [Folgt zum Abschluss — Link zu Loom oder YouTube unlisted, EIN Durchlauf, ungeschnitten]

*SKAILE Academy Building Challenge — Juli 2026*
