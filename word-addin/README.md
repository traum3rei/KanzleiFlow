# KanzleiFlow — Microsoft Word Add-in (Notariats-Assistent)

Das KanzleiFlow Microsoft Word Add-in verbindet Microsoft Word direkt mit dem KanzleiFlow Notariats-Portal. Es ermöglicht Notaren und Sachbearbeitern das sichere Durchsuchen von Akten und das punktgenaue Einfügen geprüfter Urkunden-, Beteiligten- und Grundbuchdaten als Microsoft Word Content Controls oder formatierte Tabellen.

---

## 1. Architektur & Sicherheit

### Authentifizierung im Aufgabenbereich (Task Pane)
In Desktop-Word (macOS WKWebView, Windows WebView2) sowie Word im Web können Drittanbieter-Cookies und partitionierte Sitzungscookies blockiert werden.
Das KanzleiFlow Word Add-in verwendet daher eine robuste, standardkonforme Token-Authentifizierung:

1. **Anmeldung**: Der Nutzer authentifiziert sich im Word Aufgabenbereich über `POST /api/addin/auth/login` mit Dienst-E-Mail und Kennwort (im Entwicklungsmodus steht eine Demo-Schnellanmeldung bereit).
2. **Kryptographisches Token**: Der Server erzeugt ein mit HMAC-SHA256 signiertes Bearer-Token (`createSessionToken`) mit 8 Stunden Gültigkeit (Arbeitsschicht im Notariat).
3. **Sitzungsspeicher**: Das Token wird sicher im lokalen Speicher des Aufgabenbereichs hinterlegt und bei allen Folgeanfragen im HTTP-Header `Authorization: Bearer <token>` mitgeführt.
4. **Mandanten-Isolation**: Jeder Aufruf validiert die Organisation im PostgreSQL-Schichtenmodell (`getAddinTenantContext`). Client-übermittelte Organisations-IDs werden niemals ungeprüft akzeptiert.
5. **Schutz von Geschäftsgeheimnissen**: Supabase Service-Role-Schlüssel und vertrauliche Datenbankpasswörter verbleiben ausnahmslos auf dem Server.

---

## 2. Word JavaScript API & Content Controls

Das Add-in nutzt die offizielle `Office.js` Word JavaScript API:

- **Rich-Text Content Controls**: Eingefügte Einzelfelder werden als Word-Inhaltssteuerelemente gekapselt:
  - `title`: Klartext-Bezeichnung des Feldes (z. B. `KanzleiFlow: Vollständiger Name (Käufer)`).
  - `tag`: Eindeutiger Identifikator nach dem Schema `KanzleiFlow:<Aktenzeichen>:<FeldKey>`.
  - `appearance`: `boundingBox` (visuelle Umrandung im Word-Dokument).
- **Tabellengenerierung**: Mehrzeilige Abschnitte (z. B. Beteiligtenlisten, Grundbuchverzeichnisse, Kaufpreisbedingungen) werden mit nativer Word-Tabellenformatierung (`gridTable4Accent1`) und formatierten Kopfzeilen eingefügt.
- **Auditierbarkeit**: Jede Datenübernahme in das aktive Word-Dokument wird revisionssicher als Audit-Event (`WORD_ADDIN_DATA_INSERTED`) protokolliert — ohne vertrauliche Freitexte oder PII im Logfile abzulegen.
- **Mehrfachklick-Schutz**: Einfügeaktionen sind debounced und sperren die Schaltflächen während der asynchronen `Word.run(...)` Ausführung.

---

## 3. Sideloading & Installation in Microsoft Word

### A. macOS (Word für Mac 2016 / 2019 / 2021 / Microsoft 365)
1. Beenden Sie Microsoft Word vollständig.
2. Kopieren Sie die Datei `manifest.xml` in das Word WEF-Verzeichnis:
   ```bash
   cp word-addin/manifest.xml ~/Library/Containers/com.microsoft.Word/Data/Documents/wef/
   ```
   *(Falls das Verzeichnis `wef` noch nicht existiert, erstellen Sie es mit `mkdir -p ~/Library/Containers/com.microsoft.Word/Data/Documents/wef`)*.
3. Starten Sie Microsoft Word und öffnen Sie ein beliebiges Dokument.
4. Klicken Sie im Menüband auf die Registerkarte **KanzleiFlow** und wählen Sie **Akten-Assistent** (oder über **Einfügen** > **Meine Add-Ins**).

### B. Windows (Word für Windows 10 / 11 / Microsoft 365)
1. Geben Sie den Ordner `word-addin` in Ihrem lokalen Netzwerk frei (Rechtsklick > Freigabe > Freigeben).
2. Öffnen Sie Word unter Windows:
   - Navigieren Sie zu **Datei** > **Optionen** > **Sicherheitscenter** > **Einstellungen für das Sicherheitscenter...** > **Kataloge vertrauenswürdiger Add-Ins**.
   - Tragen Sie den UNC-Pfad Ihrer Freigabe ein (z. B. `\\mein-pc\word-addin`).
   - Aktivieren Sie das Kontrollkästchen **Im Menü anzeigen**.
3. Nach einem Neustart von Word steht das Add-in unter **Einfügen** > **Meine Add-Ins** > **Freigegebener Ordner** bereit.

### C. Microsoft 365 / Word im Web (Browser)
1. Öffnen Sie ein beliebiges Dokument in [Word Online](https://office.com).
2. Wählen Sie **Einfügen** > **Add-Ins** > **Weitere Add-Ins**.
3. Wechseln Sie auf die Registerkarte **Meine Add-Ins** und klicken Sie auf **Eigenes Add-In hochladen**.
4. Wählen Sie die Datei `manifest.xml` aus.

---

## 4. Lokale Entwicklung & HTTPS-Anforderung

Microsoft Word verlangt für alle Add-In-Endpunkte zwingend HTTPS.
Für die lokale Entwicklung auf `localhost`:

1. **Zertifikate einrichten (mkcert)**:
   ```bash
   brew install mkcert
   mkcert -install
   mkcert localhost 127.0.0.1
   ```
2. **Next.js mit HTTPS starten**:
   ```bash
   npm run dev -- --experimental-https
   ```
   *Alternativ kann ein Tunnel wie ngrok verwendet werden:*
   ```bash
   ngrok http 3000
   ```
   Tragen Sie in diesem Fall die ngrok-HTTPS-URL in `word-addin/manifest.xml` ein.

---

## 5. Demonstration & Test-Workflow

1. Öffnen Sie die Add-in Taskpane URL direkt im Browser oder in Word:
   `https://localhost:3000/word-addin/taskpane`
2. Klicken Sie auf **Ausfüllen** bei der Demo-Schnellanmeldung:
   - E-Mail: `j.weiss@notariat-weiss-partner.de`
   - Kennwort: `notar-geheim-2026`
3. Wählen Sie die Akte **2026-UR-0142** (*Kaufvertrag Grundstück Flur 14, Gemarkung Schwabing*).
4. Wechseln Sie zwischen den Reitern:
   - **Stammdaten**: Klicken Sie auf `Einfügen` bei *Aktenzeichen / Urkunden-Nr.*
   - **Parteien**: Klicken Sie auf `Alle als Tabelle einfügen`
   - **Grundbuch**: Übernehmen Sie Flurstück und Grundbuchblatt
   - **Kaufpreis**: Übernehmen Sie den Kaufpreis (1.850.000 EUR)
5. Die Daten erscheinen sofort am aktuellen Cursor im aktiven Word-Dokument als strukturierte Content Controls!

---

## 6. Einschränkungen & Nicht unterstützte Clients

- **Word 2013 oder älter**: Nicht unterstützt (erfordert Word JavaScript API Requirement Set 1.1+).
- **Word für iOS / Android**: Mobile Word-Clients unterstützen keine Aufgabenbereich-Add-Ins.
- **Word im Lesemodus**: Im geschützten Lesemodus (`Protected View`) sind Dokumentenänderungen von Office.js unterbunden.
