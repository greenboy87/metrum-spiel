# Hinweise für Claude Code

## Was das ist

Klassenspiel zur Stunde „Metrum, Puls, Tempo“ (Klasse 5, Stundenordner
`Klasse 5 - 1a_Metrum Puls Tempo by phil +`). Drei Teile aus der Präsentation:
Tempo tippen (Folie 16), Metronom-Millionär (Folie 17, Fragen aus
learningapps.org/watch?v=pdatcfv2j21), Vor- & Nachmachen (Folie 21).
Aufbau und Raum-Logik wie das Klassenspiel der Rhythmus-Werkstatt
(`rhythmus-werkstatt/js/klasse.js`), Look wie das Scoreboard (`musik-quiz`).

## Keine Musik ins Repository

Die Songs von Folie 16 sind urheberrechtlich geschützt und liegen **nicht** hier.
Die Lehrkraft wählt sie einmal aus dem Stundenordner
(`Metrum-Challenge Hörbeispiele c+`), sie bleiben nur in IndexedDB des Browsers.

## Firebase

Projekt `greenboys-scoreboard`, Knoten `rooms/mt-<CODE>` (offen, ohne
`.validate`) – deshalb nur kleine, flache Daten. Aufbau steht oben in
`js/spiel.js`. Jeder liest nur `lehrer`, die Lehrkraft dazu `spieler` und die
Antworten der laufenden Runde: wenige KB pro Stunde. „Schließen“ löscht den Raum.

## Kein Tailwind, kein Build

Reines HTML/CSS/JS. `js/noten.js` ist eine Kopie aus der Rhythmus-Werkstatt
(Notenbild bei der Auflösung). Nach Änderungen die `?v=`-Nummern in
`index.html` hochzählen, sonst liefern iPads die alte Fassung aus dem Cache.

## Nicht in einen Cloud-Ordner legen

Abgleich über GitHub (`git pull` / `git push`), nicht über iCloud.
