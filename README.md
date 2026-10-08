# Hausaufgaben-Timer

Ein Timer für Grundschulkinder, die mit ihren Eltern Hausaufgaben machen. Inspiriert von der Pomodoro-Technik, aber mit kürzeren Intervallen. Die verbleibende Zeit wird nicht als Zahl angezeigt, sondern als Bleistift, der während der Lernzeit immer kürzer wird. Eine gestrichelte Kontur zeigt, wie lang er am Anfang war.

## So funktioniert's

1. **Eltern stellen ein:** Lernzeit (5–25 Min), Pause (2–8 Min), Anzahl Runden (1–4), Ton an/aus. Die Auswahl wird gespeichert.
2. **Lernzeit:** Ein gelber Bleistift wird kürzer. Oben zeigen Sterne, welche Runde gerade läuft.
3. **Wechsel:** Am Ende ertönt ein kurzer Klang, das Kind bekommt einen Stern. Die Pause startet erst nach einem Tipp – so geht keine Pause unbemerkt verloren.
4. **Pause:** Der Bleistift ist türkis.
5. **Geschafft:** Alle Sterne leuchten.

Weitere Details:

- **Anhalten/Weiter** für Unterbrechungen.
- **Beenden** muss man gedrückt halten, damit es nicht aus Versehen passiert.
- Der Bildschirm bleibt während des Timers an (Wake Lock, ab iOS 16.4).
- Der Timer rechnet mit echten Uhrzeiten: Wird die App kurz verlassen oder neu geladen, läuft er korrekt weiter.
- Funktioniert nach dem ersten Öffnen auch offline.

## Auf dem iPhone verwenden

1. Seite in Safari öffnen: `https://sarmedhuss.github.io/homworktimer/`
2. Teilen-Symbol → **Zum Home-Bildschirm**.
3. Die App startet dann im Vollbild ohne Safari-Leiste.

> Hinweis: iOS pausiert Web-Apps im Hintergrund. Der Klang am Ende kommt nur, wenn die App offen ist. Die Zeit stimmt trotzdem.

## Lokal starten

```bash
git clone https://github.com/SarmedHuss/homworktimer.git
cd homworktimer
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen. Zum schnellen Testen: `http://localhost:8000/?speed=60` – dann vergeht eine Minute in einer Sekunde.

Vom iPhone im selben WLAN: `http://<IP-des-Rechners>:8000`.

## Veröffentlichen (GitHub Pages)

Jeder Push auf `main` veröffentlicht die App automatisch über `.github/workflows/pages.yml`.
Einmalig nötig: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Nach Änderungen an den App-Dateien in `sw.js` die `VERSION` erhöhen, damit installierte Apps die neue Version laden.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Bildschirme: Einstellungen, Timer, Wechsel, Geschafft |
| `styles.css` | Gestaltung inkl. Bleistift |
| `app.js` | Timer-Logik, Speichern, Ton, Wake Lock |
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
