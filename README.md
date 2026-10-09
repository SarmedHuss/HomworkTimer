# Hausaufgaben-Timer

Ein Timer für Grundschulkinder, die mit ihren Eltern Hausaufgaben machen. Inspiriert von der Pomodoro-Technik, aber mit kürzeren Intervallen. Die verbleibende Zeit wird nicht als Zahl angezeigt, sondern als Bleistift, der während der Lernzeit immer kürzer wird. Eine gestrichelte Kontur zeigt, wie lang er am Anfang war.

## So funktioniert's

Die App hat zwei Modi auf einem Gerät.

**Elternmodus**
1. **Kinderprofile:** Spitzname und Klasse, mehrere Kinder pro Gerät. Aus der Klasse schlägt die App Lern- und Pausenzeiten vor (Klasse 1: 10/3 Min … Klasse 4: 20/5 Min).
2. **Planen:** Fach, Lernzeit, Pause, Runden, ob das Kind die Restzeit als Zahl sieht, Ton an/aus. Die Auswahl wird pro Kind gemerkt.
3. **Bewerten:** Nach der Sitzung fünf kurze Fragen (Fokus, Hilfe, Stimmung des Kindes, eigene Anspannung, Schwierigkeit) und eine freie Notiz. Überspringen ist möglich.
4. **Verlauf:** alle Sitzungen pro Kind mit Bewertung und Notiz.
5. **Daten exportieren:** alle Sitzungen als CSV-Tabelle (Excel, Numbers) sowie eine vollständige Sicherung als JSON-Datei, die sich wieder laden lässt. Auf dem Handy über das Teilen-Menü, am Computer als Download.

**Kindmodus**
- Ein Bleistift wird während der Lernzeit von der Spitze her kürzer; oben zeigt ein kleiner Bleistift pro Runde den Fortschritt.
- Die Pause startet erst nach einem Tipp. **Beenden** muss man gedrückt halten.
- Am Ende gibt das Kind das Handy zurück; es folgt die Bewertung.

Weitere Details:

- Der Bildschirm bleibt während des Timers an (Wake Lock, ab iOS 16.4).
- Der Timer rechnet mit echten Uhrzeiten: Wird die App kurz verlassen oder neu geladen, läuft er korrekt weiter.
- Alle Daten bleiben im Browser auf dem Gerät (localStorage). Löschen über „Profil bearbeiten“.
- Funktioniert nach dem ersten Öffnen auch offline.
- **Deutsch und Englisch:** Die Sprache folgt dem Gerät und lässt sich oben rechts im Elternmodus umschalten. Alle Texte stehen in `i18n.js`.
- Konzept: siehe Dokument „Konzept Elternmodus – Hausaufgaben-Timer“.

## Auf dem iPhone verwenden

1. Seite in Safari öffnen: `https://sarmedhuss.github.io/HomworkTimer/`
2. Teilen-Symbol → **Zum Home-Bildschirm**.
3. Die App startet dann im Vollbild ohne Safari-Leiste.

> Hinweis: iOS pausiert Web-Apps im Hintergrund. Der Klang am Ende kommt nur, wenn die App offen ist. Die Zeit stimmt trotzdem.

## Lokal starten

```bash
git clone https://github.com/SarmedHuss/HomworkTimer.git
cd HomworkTimer
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen. Zum schnellen Testen: `http://localhost:8000/?speed=60` – dann vergeht eine Minute in einer Sekunde.

Vom iPhone im selben WLAN: `http://<IP-des-Rechners>:8000`.

## Veröffentlichen (GitHub Pages)

Jeder Push auf `main` veröffentlicht die App automatisch über `.github/workflows/pages.yml`.
Einmalig nötig: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Nach Änderungen an den App-Dateien die Versionsnummer erhöhen: `VERSION` in `sw.js` und `?v=` an den Dateien in `index.html` und `sw.js` (alle gleich). So passen Seite und Skripte immer zusammen, und installierte Apps laden die neue Version beim nächsten Öffnen automatisch.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Bildschirme: Profil, Planen, Bewerten, Verlauf (Eltern); Timer, Wechsel, Geschafft (Kind) |
| `styles.css` | Gestaltung inkl. Bleistift |
| `i18n.js` | Alle Texte auf Deutsch und Englisch |
| `app.js` | Profile, Planung, Bewertung, Verlauf, Timer-Logik, Speichern, Ton, Wake Lock |
| `sw.js` | Offline-Unterstützung |
| `manifest.webmanifest`, `icons/` | Installation als App |

Keine Abhängigkeiten, kein Build-Schritt.

## Später: App Store

Weil die App aus reinem HTML/CSS/JS besteht, lässt sie sich mit [Capacitor](https://capacitorjs.com/) in eine native iOS-App verpacken:

```bash
npm init -y && npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "Hausaufgaben-Timer" de.example.homeworktimer --web-dir www
# App-Dateien nach www/ kopieren, dann:
npx cap add ios && npx cap open ios
```

Native Vorteile dort: Benachrichtigung am Ende auch bei gesperrtem Bildschirm (Local Notifications) und zuverlässiger Ton. Für den App Store sind ein Apple-Developer-Konto und Xcode auf einem Mac nötig; Apple verlangt bei reinen Web-Hüllen etwas „App-Mehrwert“ – Benachrichtigungen und Statistiken (z. B. geschaffte Runden pro Woche) wären gute Kandidaten.
