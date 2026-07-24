# INSTALL.md — Anleitung für Claude

> **An Claude:** Diese Datei ist an dich adressiert. Der Mensch, mit dem du arbeitest,
> möchte den Nachbestell-Agenten in **seiner eigenen n8n-Instanz** einrichten.
> Führe ihn durch, arbeite die Schritte der Reihe nach ab und **rate nichts** —
> wenn du etwas über seine Instanz nicht weißt, inspiziere es oder frag ihn.

## Was der Agent tut

Er liest eine Bestandsliste und eine Verkaufshistorie (60 Tage) und beantwortet eine
Frage: Was muss diese Woche nachbestellt werden, in welcher Menge, und warum? Zusätzlich
benennt er Artikel, in denen totes Kapital liegt. Ergebnis ist ein HTML-Report zum
Herunterladen.

**Wichtigste Eigenschaft:** Das Sprachmodell rechnet nichts. Alle Zahlen entstehen in
einem Code-Node. Das LLM formuliert nur Begründungssätze, und jede Zahl in diesen Sätzen
wird danach gegen die echten Werte geprüft.

---

## Schritt 0 — Zuerst inspizieren, nicht annehmen

Bevor du irgendetwas anlegst, prüfe die Zielinstanz und melde das Ergebnis:

```
n8n_health_check({mode: "diagnostic"})
n8n_manage_credentials({action: "list"})
```

Klär diese vier Punkte:

1. **n8n-Version.** Achtung: `n8n_health_check` gibt unter `versionInfo` die Version des
   **n8n-MCP-Pakets** zurück, nicht die der Instanz. Das Feld `apiConfiguration.status.version`
   ist oft `"unknown"`, und `/rest/settings` liefert vor dem Login keine Version. Wenn du sie
   nicht sicher ermitteln kannst: **frag deinen Menschen**, er liest sie in der n8n-Oberfläche ab.
2. **LLM-Credential.** Es wird eine Anthropic-Credential (`anthropicApi`) gebraucht.
   Ist keine da, muss dein Mensch sie in n8n anlegen — **du legst keine API-Keys an und
   fragst nicht danach.**
3. **Node-Typen.** Gebraucht werden `manualTrigger`, `httpRequest`, `extractFromFile`,
   `code`, `convertToFile`, `@n8n/n8n-nodes-langchain.chainLlm` und
   `@n8n/n8n-nodes-langchain.lmChatAnthropic`.
4. **`typeVersion` je Node.** Rate sie nicht. Lies sie aus einem bestehenden Workflow
   der Zielinstanz ab (`n8n_get_workflow` mit `mode: "filtered"`) oder frag `get_node`.
   Eine zu neue `typeVersion` bricht den Node auf älteren Instanzen.

Referenz — auf der Instanz, auf der dieser Agent gebaut wurde (**n8n 2.17.3, self-hosted**):

| Node | typeVersion |
|---|---|
| `n8n-nodes-base.manualTrigger` | 1 |
| `n8n-nodes-base.httpRequest` | 4.4 |
| `n8n-nodes-base.extractFromFile` | 1.1 |
| `n8n-nodes-base.code` | 2 |
| `n8n-nodes-base.convertToFile` | 1.1 |
| `@n8n/n8n-nodes-langchain.chainLlm` | 1.9 |
| `@n8n/n8n-nodes-langchain.lmChatAnthropic` | 1.5 |

**Danach STOPP.** Melde deinem Menschen, was du vorgefunden hast, und warte auf sein OK.

---

## Schritt 1 — Workflow importieren

`workflow/nachbestell-agent.json` enthält den fertigen Workflow. Zwei Wege:

**In der n8n-Oberfläche:** Neuer Workflow → Menü oben rechts → *Import from File*.

**Über MCP:** Datei lesen und `n8n_create_workflow` mit `nodes` und `connections` daraus aufrufen.

Danach immer prüfen:

```
n8n_validate_workflow({id: "<neue-id>", options: {profile: "runtime"}})
```

Eine Warnung ist erwartbar und **korrekt so**: `executeOnce is enabled` am Node
*Verkaeufe laden*. Ohne diese Einstellung liefe der Node einmal pro Artikel (also 25×)
statt einmal. Nicht "reparieren".

---

## Schritt 2 — Credential verbinden

Der Node **Claude - Begruendung** braucht eine `anthropicApi`-Credential. Im Export ist
keine Credential-ID enthalten — das ist Absicht, Credentials gehören nicht ins Repo.

Setze die Credential der Zielinstanz:

```
n8n_update_partial_workflow({
  id: "<workflow-id>",
  operations: [{
    type: "updateNode",
    nodeName: "Claude - Begruendung",
    updates: { credentials: { anthropicApi: { id: "<id>", name: "<name>" } } }
  }]
})
```

Die ID holst du dir aus `n8n_manage_credentials({action: "list"})`.

**Zum Modell:** Der Node läuft bewusst mit leeren Parametern, also dem Node-Default.
Wenn dein Mensch ein bestimmtes Modell will, soll er es im Node-Dropdown auswählen —
dort listet n8n genau die Modelle, auf die sein API-Key Zugriff hat. Trag keine
Modell-ID blind ein.

---

## Schritt 3 — Datenquelle anpassen

Ab Werk lädt der Agent die Beispieldaten aus dem öffentlichen Repo:

```
https://raw.githubusercontent.com/Emre1003/nachbestell-agent/main/data/bestand.csv
https://raw.githubusercontent.com/Emre1003/nachbestell-agent/main/data/verkaeufe.csv
```

Für echte Daten die URLs in **Bestand laden** und **Verkaeufe laden** ersetzen. Erwartete Spalten:

**bestand.csv**
`artikel_id, artikelname, kategorie, bestand_stueck, ek_preis_eur, vk_preis_eur, vpe_stueck, lieferzeit_tage`

**verkaeufe.csv**
`datum (YYYY-MM-DD), artikel_id, menge`

Kommt die Quelle aus einem System mit Zugangsdaten (Shop-API, Datenbank), dann tausche die
HTTP-Nodes gegen passende Nodes aus und lass die Credentials in n8n. **Niemals Keys in
den Workflow oder ins Repo schreiben.**

Zwei Dinge, die dabei leicht schiefgehen:
- **Trennzeichen und Kodierung.** Die `extractFromFile`-Nodes stehen auf `delimiter: ","`
  und `encoding: "utf8"`. Deutsche Exporte nutzen oft Semikolon und Latin-1.
- **Datumsformat.** Der Rechenkern erwartet `YYYY-MM-DD`. `31.12.2026` wird nicht verstanden.
  Konvertiere im Zweifel in einem Code-Node vor dem Rechenkern.

---

## Schritt 4 — Stellschrauben anpassen

Alle Parameter stehen oben im Code-Node **Rechenkern**, an einer Stelle:

| Parameter | Default | Bedeutung |
|---|---|---|
| `PUFFER_TAGE` | 7 | Sicherheitspuffer auf die Lieferzeit |
| `ZIELREICHWEITE_TAGE` | 45 | Wie lange eine Bestellung reichen soll |
| `MIN_HISTORIE_TAGE` | 14 | Darunter: keine Prognose, Status ZU_WENIG_DATEN |
| `TOTES_KAPITAL_REICHWEITE` | 180 | Ab dieser Reichweite gilt Ware als Ladenhüter |
| `TOTES_KAPITAL_MIN_EUR` | 100 | Darunter ist ein Ladenhüter keine Meldung wert |
| `GEWICHT_KURZ` | 0.7 | Gewicht der letzten 14 Tage gegenüber dem Gesamtzeitraum |

`GEWICHT_KURZ` ist die wichtigste Stellschraube: höher = der Agent reagiert schneller auf
Trends, aber auch nervöser auf Ausreißer.

**Nach jeder Änderung** im Repo gegenprüfen — die Logik liegt doppelt vor, im n8n-Node und
in `scripts/lib/rechenkern.js`:

```bash
node scripts/verify-testfaelle.js
node scripts/verify-n8n-parity.js
```

---

## Schritt 5 — Testlauf

Der Workflow startet über den **Manual Trigger** ("Test workflow"). Prüfe danach:

1. **Rechenkern** liefert 1 Item mit `artikel[]` und `zusammenfassung`.
2. **Faktencheck** — sieh dir `faktencheck.ersetzt` und `beanstandet` an. Ersetzungen sind
   **kein Fehler**, sondern der Beweis, dass die Sperre arbeitet: das Modell hat eine Zahl
   genannt, die so nicht in den Daten steht, und der Satz wurde durch einen festen ersetzt.
3. **Report als Datei** — Download, im Browser öffnen.
4. **Pruefsumme** — `zahlen_fingerabdruck`. Zwei Läufe mit denselben Eingangsdaten müssen
   denselben Fingerabdruck liefern. Tun sie das nicht, ist irgendwo Nichtdeterminismus
   hereingekommen.

Läuft etwas schief:

| Symptom | Ursache |
|---|---|
| `Keine Verkaufszeilen gefunden` | CSV leer, falsche URL oder falsches Trennzeichen |
| Alle Artikel `ZU_WENIG_DATEN` | Datumsformat wird nicht geparst |
| `faktencheck.ersetzt` = alle | LLM-Antwort war kein JSON — Systemprompt oder Modell prüfen |
| Node läuft 25× statt 1× | `executeOnce` an *Verkaeufe laden* fehlt |

---

## Was du NICHT tun sollst

- Keine API-Keys erfragen, anlegen oder ins Repo schreiben.
- Den Faktencheck nicht abschalten, um "schönere" Texte zu bekommen. Er ist der Grund,
  warum man den Zahlen im Report trauen kann.
- `new Date()` oder `Math.random()` nicht in den Rechenkern einbauen. Der Stichtag ist
  bewusst das späteste Datum aus den Verkaufsdaten — sonst ändert sich das Ergebnis je
  nach Ausführungstag und nichts ist mehr reproduzierbar.
- Die Statusreihenfolge im Rechenkern nicht umsortieren. Sie ist Fachlogik: `ZU_WENIG_DATEN`
  muss vor allem anderen greifen, sonst bekommt ein Artikel mit 8 Tagen Historie eine
  Prognose, die er nicht verdient.
- Vergleiche gegen `reichweite_tage` nicht ohne `null`-Prüfung schreiben. `null < 21` wird
  in JavaScript zu `0 < 21` und meldet einen Ladenhüter als KRITISCH.

---

*aigency-ai.de | emre@aigency-ai.de | Berlin*
