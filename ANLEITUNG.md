# Familien-Board als WebApp – Einrichtung

Die WebApp ist dasselbe Board wie in Claude. Nur drei Dinge laufen anders:

| Teil | im Claude-Board | in der WebApp |
|---|---|---|
| Daten (Aufgaben, Punkte, Essen …) | Claude-Datenbank | **Google Firebase** (kostenlos) |
| Kalender | Claude-Verbindung zu Google Kalender | **Google Apps Script** in deinem Google-Konto |
| Wetter | AccuWeather | **Open-Meteo** (kostenlos, ohne Anmeldung) |

Das Claude-Board läuft weiter, bis alles fertig ist. Am Umzugstag werden die Daten einmal übertragen.

Plane etwa 45 Minuten ein, am besten am Mac.

---

## 1. Firebase einrichten (ca. 15 Minuten)

1. **Projekt anlegen**
   - Öffne <https://console.firebase.google.com> und melde dich mit deinem Google-Konto an.
   - Klicke auf **Projekt erstellen**, Name: `familienboard`.
   - Google Analytics brauchst du nicht, schalte es aus.
2. **Anmeldung einschalten**
   - Gehe links zu **Erstellen → Authentication → Jetzt starten**.
   - Aktiviere unter **Anmeldemethode** die Methode **E-Mail-Adresse/Passwort**. Den Link per E-Mail lässt du aus.
   - Lege unter **Nutzer → Nutzer hinzufügen** diese Konten an:
     - das **Familien-Konto** für das Flur-iPad und die Eltern, zum Beispiel deine E-Mail-Adresse mit einem eigenen Passwort,
     - **Oma** mit ihrer E-Mail-Adresse und einem Passwort,
     - bei Bedarf **Veronika**.
3. **Datenbank anlegen**
   - Gehe zu **Erstellen → Firestore Database → Datenbank erstellen**.
   - Standort: **eur3 (Europa)**. Modus: **Produktionsmodus**.
4. **Sicherheitsregeln**
   - Öffne in der Firestore-Datenbank den Reiter **Regeln** und lösche den bisherigen Inhalt.
   - Füge den Inhalt der Datei `firestore.rules` ein.
   - Ersetze oben die Beispiel-Adressen durch eure echten Adressen aus Schritt 2.
   - Klicke auf **Veröffentlichen**.
5. **Web-App registrieren**
   - Klicke auf das Zahnrad **Projekteinstellungen**, dann **Allgemein → Meine Apps** und auf das Symbol **`</>`**.
   - App-Name: `Familien-Board`. Den Haken bei Firebase Hosting setzt du **nicht**.
   - Firebase zeigt dir jetzt einen Block `firebaseConfig` mit `apiKey`, `authDomain`, `projectId` usw. **Schick mir diesen Block.** Ich trage ihn in `config.js` ein. Die Werte sind nicht geheim, geschützt wird alles durch Anmeldung und Regeln.
6. **Domain erlauben**
   - Gehe zu **Authentication → Einstellungen → Autorisierte Domains → Domain hinzufügen**.
   - Trage `pakoggv.github.io` ein.

---

## 2. Kalender-Brücke mit Google Apps Script (ca. 10 Minuten)

Melde dich dafür mit dem Google-Konto an, in dem die Familienkalender sichtbar sind (`npakeiser@gmail.com`).

1. Öffne <https://script.google.com> und klicke auf **Neues Projekt**. Name: `Familien-Board Kalender`.
2. Lösche den Inhalt von `Code.gs` und füge den Inhalt der Datei `apps-script/Code.gs` ein.
3. Trage ganz oben bei `TOKEN` ein langes, zufälliges Kennwort ein, zum Beispiel aus einem Passwort-Manager. Es braucht keine Sonderzeichen.
4. Stelle unter **Projekteinstellungen (Zahnrad)** die Zeitzone auf **(GMT+01:00) Berlin**.
5. **Einmal testen:**
   - Wähle oben die Funktion `testKalender` aus und klicke auf **Ausführen**.
   - Google fragt nach Zugriff auf deinen Kalender. Klicke auf **Erweitert → Zu „Familien-Board Kalender“ wechseln → Zulassen**. Die Warnung erscheint, weil das Skript nur dir gehört.
   - Unten im Protokoll erscheint die Liste deiner Kalender.
6. **Veröffentlichen:**
   - Klicke auf **Bereitstellen → Neue Bereitstellung**, Typ **Web-App**.
   - Ausführen als: **Ich**. Zugriff: **Jeder**.
   - Klicke auf **Bereitstellen** und kopiere die **Web-App-URL**. Sie endet auf `/exec`.
   - Die URL und das Kennwort trägst du später im Board ein (Schritt 4). Bitte nicht per Chat oder Mail herumschicken.

> Ohne das Kennwort liefert das Skript keine Termine.

---

## 3. GitHub (ca. 5 Minuten)

1. Lege auf <https://github.com/new> ein neues Repository an:
   - Name: `Familienboard`
   - Sichtbarkeit: **Public**. GitHub Pages ist nur dann kostenlos. Im Code stehen keine privaten Daten, die liegen alle geschützt in Firebase.
   - Sonst nichts ankreuzen, das Repository bleibt leer.
2. Sag mir Bescheid, dann lade ich die Dateien hoch.
3. Danach stellst du unter **Settings → Pages → Branch: `main` / `(root)` → Save** die Seite ein. Nach ein bis zwei Minuten ist sie erreichbar unter: **https://pakoggv.github.io/familienboard/**

---

## 4. Erster Start (am Mac oder iPad)

1. Öffne die Adresse und melde dich mit dem **Familien-Konto** an. Das erste Konto bekommt automatisch das ganze Board.
2. Gehe zu **Eltern** (PIN) und in den Bereich **WebApp**:
   - Trage bei **Kalender-Verbindung** die Adresse und das Kennwort aus Schritt 2 ein und tippe auf **speichern**.
   - Wähle bei **Daten einspielen** die Datei mit den Daten aus dem alten Board, die du von mir bekommst.
3. Prüfe unter **Kalender zuordnen**, ob alle Kalender richtig zugeordnet sind.

## 5. Flur-iPad

1. Öffne die Adresse in **Safari** und melde dich mit dem Familien-Konto an.
2. Tippe auf **Teilen → Zum Home-Bildschirm**.
3. Starte das Board ab jetzt über das neue Symbol. Es öffnet sich im Vollbild ohne Safari-Leisten und ohne Claude-Leiste, auch im Querformat.
4. Den Geführten Zugriff startest du wie bisher, diesmal für das Board-Symbol.
5. Neue Geräte zeigen zuerst die Oma-Ansicht. Auf dem Flur-iPad deshalb einmal im Reiter **Eltern** die PIN eingeben. Danach zeigt es dauerhaft das ganze Board.

## 6. Oma

- Oma öffnet die Adresse im Browser und meldet sich mit ihrer E-Mail-Adresse und ihrem Passwort an. Ein Claude-Konto braucht sie nicht mehr.
- Sie sieht automatisch die Oma-Ansicht.

## 7. Konto für ein Kind (z. B. Charlottes Handy)

1. Lege das Konto in Firebase unter **Authentication → Nutzer** an.
2. Trage die E-Mail-Adresse in den **Firestore-Regeln** in die Liste bei `allowed()` ein und klicke auf **Veröffentlichen**.
3. Gehe im Board zu **Eltern → Kinder**, tippe beim Kind auf **ändern**, trage die E-Mail-Adresse bei **E-Mail-Adresse des eigenen Kontos** ein und tippe auf **speichern**.
4. Wer sich mit dieser Adresse anmeldet, sieht nur den Bereich dieses Kindes: eigene Aufgaben und Punkte, eigene Termine, Belohnungen, Essen (abstimmen und eigene Vorschläge) und „für Mama & Papa“ (nur die eigenen Einträge). Eintragungen bei Geschwistern oder Eltern sind dort nicht möglich, den Eltern-Bereich gibt es nicht.

## 8. PV-Anlage (SMA Sunny Portal)

Das Board zeigt auf der Startseite ein Fenster **Strom** mit der aktuellen Leistung (Sonne, Haus, Netz). Die Werte holt dein Apps Script etwa jede Minute aus dem Sunny Portal. Der Weg ist inoffiziell: Wenn SMA das Portal umbaut, fällt die Anzeige aus, bis das Skript angepasst ist.

### Apps Script erweitern (einmalig, ca. 5 Minuten)

1. Öffne dein Projekt „Familien-Board Kalender“ auf <https://script.google.com>.
2. Klicke links neben **Dateien** auf **+** → **Skript** und nenne die Datei `Sma`. Lösche den Inhalt und füge den Inhalt von `apps-script/Sma.gs` ein.
3. Öffne `Code.gs`. Suche in `doGet` die Zeile
   `if (p.action === 'ping') return json({ok: true});`
   und füge direkt darunter diese Zeile ein:
   `if (String(p.action || '').indexOf('sma') === 0) return json(smaAction(p));`
   Dein Kennwort oben bei `TOKEN` bleibt, wie es ist.
4. Speichern (Disketten-Symbol). Wähle oben die Funktion `smaEinrichten` und klicke auf **Ausführen**. Google fragt nach neuen Rechten (externe Dienste aufrufen, zeitgesteuert ausführen): **Erweitert → Zu „Familien-Board Kalender“ wechseln → Zulassen**.
5. **Bereitstellen → Bereitstellungen verwalten** → Stift-Symbol → bei **Version** „Neue Version“ wählen → **Bereitstellen**. Die Adresse bleibt gleich.

### Anmelde-Schlüssel holen (am Mac in Safari)

1. Safari → **Einstellungen → Erweitert** → Haken bei **Funktionen für Webentwickler anzeigen**.
2. Öffne <https://ennexos.sunnyportal.com> und melde dich an, bis dein Dashboard erscheint. Die Zahl in der Adresse nach `sunnyportal.com/` ist deine **Anlagen-Nummer**.
3. Menü **Entwickler → JavaScript-Konsole einblenden**. Tippe unten in die Konsole:
   `copy(localStorage.refresh_token)` und drücke die Eingabetaste. Der Schlüssel liegt jetzt in der Zwischenablage. Nicht in Chats oder Mails einfügen.
4. Wichtig: In diesem Safari-Fenster später **nicht auf „Abmelden“ klicken**. Das würde den Schlüssel ungültig machen. Fenster schließen ist kein Problem.

### Im Board verbinden

1. **Eltern** (PIN) → **WebApp** → **PV-Anlage (SMA)**.
2. Anlagen-Nummer eintragen, den Schlüssel ins Feld **Anmelde-Schlüssel** einfügen, auf **SMA verbinden** tippen.
3. Es erscheint „Verbindung klappt: Sonne gerade … kW“. Auf der Startseite ist jetzt das Fenster **Strom** zu sehen.

Das Skript erneuert den Schlüssel bei jeder Abfrage und zusätzlich alle 6 Stunden. Wenn SMA die Sitzung trotzdem einmal beendet, zeigt das Board „Die Verbindung zum Sunny Portal ist abgelaufen“. Dann die Schritte „Anmelde-Schlüssel holen“ und „Im Board verbinden“ wiederholen.
