# Hinweise für Claude Code

## Was das ist

Klassenspiel zur Stunde „Metrum, Puls, Tempo“ (Klasse 5, Stundenordner
`Klasse 5 - 1a_Metrum Puls Tempo by phil +`). Drei Teile aus der Präsentation:
Tempo tippen (Folie 16), Metronom-Millionär (Folie 17, Fragen aus
learningapps.org/watch?v=pdatcfv2j21), Vor- & Nachmachen (Folie 21).
Aufbau und Raum-Logik wie das Klassenspiel der Rhythmus-Werkstatt
(`rhythmus-werkstatt/js/klasse.js`), Look wie das Scoreboard (`musik-quiz`).

## millionaer.html: Metronom-Millionär ohne LearningApps

1:1-Nachbau des LearningApps-Spiels (learningapps.org/watch?v=pdatcfv2j21),
damit das Quiz von Folie 17 auch ohne LearningApps läuft. Jedes Kind spielt
allein, ohne Anmeldung und ohne Datenbank. Fragen stehen in `FRAGEN` (erste
Antwort = richtig). Den Strahlen-Hintergrund zeichnet CSS – das Bild von
LearningApps wird bewusst nicht übernommen.

## Eigene Songs, Mitspieler, Vollbild

- **Eigene Songs** (Startseite): liegen wie die fünf Folie-16-Songs nur in
  IndexedDB (`metrum-challenge`/`hb`, Schlüssel `e-…`: `{blob, name, titel,
  bpm, seit}`). Häkchen = im Spiel (`mt-hb-aus` in localStorage). „Messen“
  (`bpmMessen`) schätzt das Tempo per Spektralfluss, gesamt und Bass < 150 Hz,
  wie mit Python an Toms Songs geeicht; bei Widerspruch oder starkem 3:2-/4:3-
  Nachbarn nennt es beide Werte. „Tippen“ übernimmt das getippte Tempo.
- **Songwahl** (`songAuswahl`, `mt-songwahl` = `{folie16, n}`): Standard =
  die angehakten Folie-16-Songs fest, dazu `n` (5) zufällig aus dem Pool der
  angehakten eigenen Songs – bei jedem „Raum öffnen“ neu gezogen. Ohne
  Folie-16-Schalter kommt alles in einen Pool. `n = 99` heißt „alle“.
  Eigene Songs starten bei 0:30, wenn sie länger als 90 s sind (`songLaden`).
  Fertiger Pool mit Tempo im Dateinamen: Stundenordner, „Metrum-Challenge
  Songpool c+“.
- **Anwesenheit:** Kinder setzen `spieler/<id>/on = true` und hinterlegen
  `onDisconnect(...).set(false)`. Kinder ohne Verbindung zählen bei „alle
  abgegeben“ nicht mit. Mitspieler-Dialog (Knopf oder Taste M): einzeln,
  „Ohne Verbindung“ oder Auswahl entfernen – ein `update` für alle.
- **Entfernen** schreibt `lehrer/entfernt/<id> = Zeitpunkt`. Wer danach mit
  „Mitspielen“ neu beitritt (`spieler.seit` später), wird wieder aufgenommen;
  ein online entferntes Gerät verliert `mt-raum` und tritt nicht von selbst
  wieder bei.
- **Vollbild:** Knopf in der Raumleiste oder Taste F.

## Keine Musik ins Repository

Die Songs von Folie 16 sind urheberrechtlich geschützt und liegen **nicht** hier.
Die Lehrkraft wählt sie einmal aus dem Stundenordner
(`Metrum-Challenge Hörbeispiele c+`), sie bleiben nur in IndexedDB des Browsers.

## Firebase

Projekt `greenboys-scoreboard`, Knoten `rooms/mt-<CODE>` (offen, ohne
`.validate`) – deshalb nur kleine, flache Daten. Aufbau steht oben in
`js/spiel.js`. Jeder liest nur `lehrer`, die Lehrkraft dazu `spieler` und die
Antworten der laufenden Runde: grob 5 MB pro Stunde bei 28 Kindern (obere
Grenze). „Schließen“ löscht den Raum; wer das vergisst, dem räumt das nächste
„Raum öffnen“ den alten Raum weg. Präfix `mt-` ist für dieses Spiel vergeben
(`zz-` = Rhythmus-Klassenspiel, Scoreboard = Klassennamen ohne Präfix).

## Kein Tailwind, kein Build

Reines HTML/CSS/JS. `js/noten.js` ist eine Kopie aus der Rhythmus-Werkstatt
(Notenbild bei der Auflösung). Nach Änderungen die `?v=`-Nummern in
`index.html` hochzählen, sonst liefern iPads die alte Fassung aus dem Cache.

## Nicht in einen Cloud-Ordner legen

Abgleich über GitHub (`git pull` / `git push`), nicht über iCloud.
