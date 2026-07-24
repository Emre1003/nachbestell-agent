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

## Setup

Läuft mit Claude Code und n8n. Der Agent arbeitet auf anonymisierten Beispieldaten mit realistischer Struktur — **keine echten Kundendaten im Repo**. API-Keys gehören in die `.env` (siehe `.env.example`), niemals ins Repo. Ausführliche Setup-Anleitung (INSTALL.md) folgt während der Challenge.

## Was während der Challenge entstanden ist

- **Vorher:** Vorwissen aus einem laufenden Kundenprojekt zum Thema Lagerbestandsauswertung.
- **Neu (ab Challenge-Start):** Der Agent selbst, seine komplette Logik und der gesamte n8n-Workflow. Nichts davon existierte vorher.
- Beispiel-Datensatz (anonymisiert, realistische Struktur) zum Testen der Berechnung.

## Learnings

[Folgt während der Challenge — die 2-3 wichtigsten Dinge beim Bauen, auch Fails.]

---

**Demo-Video:** [Folgt zum Abschluss — Link zu Loom oder YouTube unlisted, EIN Durchlauf, ungeschnitten]

*SKAILE Academy Building Challenge — Juli 2026*
