# KanzleiFlow Word-Add-in

Der Word-Aufgabenbereich ist ein Integrationsprototyp zur Übernahme von Akteninformationen
in ein geöffnetes Word-Dokument. Er verwendet die offizielle Office.js-Schnittstelle für
Content Controls und Tabellen. Eine erfolgreiche Ausführung in einem echten Word-Host ist
noch nicht nachgewiesen; Browser- und API-Tests decken nur Teile der Integration ab.

## Aufbau

Das Add-in ist direkt in die Next.js-Anwendung integriert. Es gibt aktuell keinen separaten
Vite-Workspace und keinen eigenen Add-in-Devserver.

- `src/app/word-addin/taskpane/page.tsx`: Oberfläche, Anmeldung und Aktenauswahl.
- `src/lib/addin/word-service.ts`: Einfügen über die Word JavaScript API.
- `src/lib/addin/office-loader.ts`: Laden und Initialisieren von Office.js.
- `src/app/api/addin/`: Anmeldung, Sitzungsprüfung, Aktenzugriff und Audit-Endpunkt.
- `word-addin/manifest.xml`: Manifest mit lokalen HTTPS-Adressen auf Port `3000`.
- `word-addin/manifest.prod.xml`: Separates Manifest für eine veröffentlichte Umgebung; Zieladressen vor Verwendung prüfen.

## Browser-Demo

Aus dem Repository-Hauptverzeichnis:

```bash
npm ci
npm run test:serve
```

Zunächst unter [http://127.0.0.1:3100](http://127.0.0.1:3100) ein Demo-Notariat auswählen.
Die Aufgabenbereich-Oberfläche liegt unter
[http://127.0.0.1:3100/word-addin/taskpane](http://127.0.0.1:3100/word-addin/taskpane).
Der Browserlauf dient zur Prüfung von Oberfläche und API-Zugriffen. Word-Einfügungen benötigen
einen Office-Host; der temporäre HTTP-Vorführmodus ist dafür nicht eingerichtet.

## Vorbereitung für einen echten Word-Host

Das lokale Manifest erwartet `https://localhost:3000/word-addin/taskpane`. Für einen Host-Test
werden eine separat konfigurierte synthetische Entwicklungsdatenbank, eine gültige Anmeldung
und ein vom Rechner akzeptiertes HTTPS-Zertifikat benötigt. Hinweise zum normalen
Entwicklungsbetrieb: [lokale Entwicklung](../docs/operations/local-development.md).

Next.js lässt sich aus dem Hauptverzeichnis mit HTTPS starten:

```bash
npm run dev -- --experimental-https
```

Vor dem Sideloading prüfen, dass die Aufgabenbereich-URL über HTTPS erreichbar ist und alle
Manifest-Adressen zum tatsächlich laufenden Server passen. Das Manifest wird nicht automatisch
an den HTTP-Vorführmodus auf Port `3100` angepasst.

Für einen lokalen macOS-Versuch kann das Manifest bei beendetem Word in dessen WEF-Verzeichnis
abgelegt werden:

```bash
mkdir -p ~/Library/Containers/com.microsoft.Word/Data/Documents/wef
cp word-addin/manifest.xml ~/Library/Containers/com.microsoft.Word/Data/Documents/wef/
```

Anschließend Word neu starten und das Add-in über die verfügbaren Add-in-Menüs laden.
Verfügbarkeit und Sideloading hängen vom Office-Client und den Organisationsrichtlinien ab.
Dieser Ablauf ist eine Vorbereitung für manuelle Tests, kein dokumentierter Host-Abnahmenachweis.

## Anmeldung und Mandantentrennung

Das Add-in kann signierte Bearer-Token verwenden, damit API-Aufrufe nicht ausschließlich von
Cookies im eingebetteten WebView abhängen. Die Standardgültigkeit regulärer HMAC-Sitzungen beträgt
acht Stunden. Der Aufgabenbereich speichert sein Bearer-Token derzeit in `localStorage`;
das ist keine gesondert abgesicherte Geheimnisablage und muss bei einer Produktionshärtung
berücksichtigt werden.

`getAddinTenantContext()` prüft das Token und löst die Organisation über Datenbankmitgliedschaften
auf. Ein Organisationsheader ermöglicht keine ungeprüfte Auswahl fremder Mandanten.
Datenbankzugangsdaten bleiben serverseitig. Die öffentliche Web-Demo hat einen eigenen
Anmeldeweg; frühere fest dokumentierte Entwicklungspasswörter sind keine gültige allgemeine Anleitung.

## Tests und offene Nachweise

```bash
npm test
npm run test:e2e -- --grep "Word task pane"
```

Die Befehle aus dem Hauptverzeichnis nacheinander ausführen. Für Playwright muss Chromium
installiert sein (`npx playwright install chromium`). Tests prüfen unter anderem Bearer-Endpunkte,
Tenant-Grenzen, Office.js-Laden und Word-Aufrufe mit Test-Doubles.

Noch manuell zu prüfen sind Sideloading, Zertifikatsvertrauen, Anmeldung im tatsächlichen WebView
und Einfügen von Content Controls und Tabellen in ein echtes Dokument. Audit-Ereignisse im Code
belegen keine zertifizierte Revisionssicherheit. Nur synthetische Akten und Dokumente verwenden.

[Zur Projektübersicht](../README.md)
