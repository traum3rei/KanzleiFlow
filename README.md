# KanzleiFlow

**Full-Stack-Portfolio-Projekt: Aktenverwaltung und Dokumentenworkflows für fiktive Notariate.**

KanzleiFlow zeigt einen zusammenhängenden Arbeitsablauf: Akte anlegen, Dokument hochladen,
strukturierte Daten extrahieren und prüfen, einen Vertragsentwurf konfigurieren und als DOCX
herunterladen. Zwei getrennte Demo-Notariate machen die Mandantentrennung nachvollziehbar.

Das Projekt demonstriert die Verbindung von React-Oberflächen, serverseitiger Authentifizierung,
relationaler Datenmodellierung, Hintergrundverarbeitung und Dokumentengenerierung.
Es ist ein technischer Prototyp mit synthetischen Daten. Rechtliche Inhalte sind nicht fachlich
geprüft; produktive Eignung, Datenschutz-Compliance und offizielle XNP-Kompatibilität sind nicht nachgewiesen.

## Schnellüberblick

- **Aktenverwaltung:** Anlage und Bearbeitung, Beteiligte, Zuständigkeiten, Status, Suche, Filter und Pagination.
- **Dokumentenworkflow:** TXT-/PDF-Upload, PDF-Textextraktion, strukturierte Extraktion sowie manuelle Korrektur und Freigabe.
- **Vertragskonfigurator:** Schrittweise Erfassung, Regelprüfung, Speicherung und Erkennung konkurrierender Änderungen.
- **DOCX:** Erzeugung von Entwürfen mit gespeicherten Versionen und Downloads.
- **Mandantenfähigkeit:** Organisationsmitgliedschaften, serverseitige Zugriffskontrollen und Tests gegen Fremdzugriffe.
- **Integrationsprototypen:** Word-Aufgabenbereich mit Office.js und ZIP/XML-Exporte für XNP-bezogene Abläufe.

Die Demo verwendet standardmäßig **Mock-Extraktion**. Provider für Gemini, OpenAI und Anthropic
sind im Code implementiert; die lokale Demo benötigt keinen API-Schlüssel und belegt keine Live-Anbindung.

## Lokal ausprobieren

Voraussetzungen: Node.js 22 oder neuer und npm. Die Abhängigkeiten müssen für die erste Installation
heruntergeladen werden können. Eine eigene PostgreSQL-Installation, Supabase-Konfiguration oder
`.env.local` ist für diesen Vorführmodus nicht erforderlich.

```bash
npm ci
npm run test:serve
```

Anschließend [http://127.0.0.1:3100](http://127.0.0.1:3100) öffnen. Auf der Login-Seite
Demo-Notariat A oder B auswählen und **„Demo-Zugang verwenden“** anklicken.

Der Runner startet eine temporäre PostgreSQL-Instanz auf Port `55439`, richtet das Schema und
synthetische Daten ein und startet die Anwendung auf Port `3100`. Beide Ports müssen frei sein.
Mit `Ctrl+C` beenden; die temporäre Datenbank und die zugehörigen Dateien werden entfernt.
Nur synthetische Daten eingeben. Die Demo-Konten haben die Rolle `CLERK`.

### Rundgang für die Projektbesichtigung

1. **Übersicht und Aktenliste:** Eine Beispielakte öffnen, Stammdaten und Beteiligte ansehen sowie Suche und Filter ausprobieren.
2. **Dokumente:** Eine synthetische TXT- oder textbasierte PDF-Datei hochladen. Die Mock-Extraktion liefert Beispieldaten; diese können korrigiert und freigegeben werden.
3. **Entwurf:** Den Vertragskonfigurator öffnen, Angaben ergänzen und eine DOCX-Version erzeugen. Die erzeugte Datei und die Versionshistorie prüfen.
4. **Mandantentrennung:** Abmelden, das andere Demo-Notariat wählen und die getrennten Aktenbestände vergleichen.
5. **Integrationsgrenzen:** Unter `/demo` die Erläuterung zu implementierten Funktionen, Simulationen und offenen Nachweisen lesen.

## Technischer Aufbau

- **Frontend und Server:** Next.js 16.4 App Router, React 19, TypeScript und Tailwind CSS 4.
- **Datenbank:** PostgreSQL, Prisma ORM 7 und `@prisma/adapter-pg`.
- **Authentifizierung:** Supabase-SSR-Anbindung und signierte HMAC-Sitzungen; Bearer-Authentifizierung für das Word-Add-in.
- **Hintergrundjobs:** PostgreSQL-Queue mit `FOR UPDATE SKIP LOCKED`, Wiederholungen und Wiederaufnahme abgelaufener Job-Leases.
- **Dokumente:** `pdf-parse` für Textextraktion, `docx` für DOCX-Dateien und eigener ZIP-Writer für Exportpakete.
- **Prüfung:** Vitest, Playwright/Chromium, TypeScript und ESLint.

### Einstiegspunkte im Repository

```text
src/app/(workspace)/       Geschützte Arbeitsoberfläche und Aktenrouten
src/app/api/              HTTP-Endpunkte, unter anderem für das Word-Add-in
src/app/word-addin/        In Next.js integrierter Word-Aufgabenbereich
src/lib/auth/             Sitzungen, Tenant-Auflösung und Zugriffstests
src/lib/services/         Akten-, Dokumenten- und Entwurfslogik
src/lib/configurator/     Konfiguration, Regeln und Versionskonflikte
src/lib/queue/            Job-Queue und Worker
src/lib/integrations/xnp/ Exportdaten, XML und ZIP-Erstellung
prisma/                   Datenmodell und SQL-Migrationen
scripts/testing/          Isolierter PostgreSQL-Testaufbau
word-addin/               Office-Manifeste und Add-in-Anleitung
```

### Wie die Mandantentrennung funktioniert

Notariate teilen sich eine Datenbank; fachliche Datensätze sind einer `organizationId` zugeordnet.
Der Server ermittelt den Tenant aus einer geprüften Sitzung und den gespeicherten Mitgliedschaften.
Eine vom Client gewählte Organisation wird nur innerhalb dieser Mitgliedschaften berücksichtigt.
Fachliche Abfragen werden auf die Organisation begrenzt; Eigentümerschaftsprüfungen schützen
Einzelzugriffe und Änderungen.

Die dokumentierte Datenbankrolle umgeht PostgreSQL Row Level Security. Die Zugriffssicherheit
hängt daher von den Prüfungen in der Anwendung ab. Die Tests decken Fremdzugriffe ab, ersetzen
aber keine vollständige Sicherheitsprüfung. Details: [Mandantentrennung](docs/architecture/multi-tenancy.md).

## Prüfung und bekannter Stand

Die folgenden Datenbankläufe **nacheinander** ausführen: Sie verwenden denselben lokalen Testport.
Für die Browserprüfung einmalig Chromium installieren.

```bash
npm test
npx playwright install chromium
npm run test:e2e
node scripts/testing/run.mjs e2e-production
npx tsc --noEmit
npm run lint
```

`npm test` und die E2E-Runner verwenden eine frische lokale PostgreSQL-Instanz mit synthetischen
Daten. `e2e-production` generiert Prisma, baut die Anwendung und prüft die öffentlichen Demo-Abläufe
unter `next start`. Das ist kein Nachweis einer erfolgreichen externen Bereitstellung.

**Zuletzt dokumentierter Stand vom 16.10.2026:** 166 automatisierte Tests bestanden,
ein Live-Test übersprungen; die zwei Demo-Browsertests unter Produktionsbedingungen bestanden.
Im letzten vollständigen Browserlauf bestanden 12 von 13 Tests. Offen blieb eine Regression bei
der Aktenbearbeitung nach einem absichtlich unterbrochenen Speichervorgang: Nach der Rückkehr zur
Detailseite erschien ein alter Titel. Diese historischen Ergebnisse wurden für diese
README-Überarbeitung nicht erneut ausgeführt. Weitere Nachweise stehen im
[Projektstand](PROJECT_STATUS.md); dort sind auch frühere, inzwischen überholte Zwischenstände enthalten.

## Grenzen und nächste Entwicklungsschritte

- **Externe Integrationen:** Echte Word-Einfügungen im Office-Host, offizieller XNP-Import und amtliche XSD-Prüfung sind noch nicht nachgewiesen. Die ZIP/XML-Dateien sind technische Prototypen.
- **Dateispeicherung:** Dateien liegen lokal. Auf Vercel ist `/tmp` flüchtig; dauerhafte, instanzübergreifende Objektspeicherung fehlt.
- **Betrieb:** Migrationsbaseline, produktive Rollen/Rechte, externe Authentifizierung und dauerhaft betriebener Worker benötigen separate Abnahme.
- **Öffentliche Demo:** Die beiden Gastkonten bearbeiten gemeinsame synthetische Daten. Änderungen können für andere Gäste sichtbar sein; es gibt keinen privaten Arbeitsbereich pro Besucher.

Die Anleitung für eine öffentliche Demo steht unter [Demo-Betrieb](docs/operations/portfolio-demo.md).
Die Erreichbarkeit oder Übereinstimmung einer bereits veröffentlichten Instanz mit diesem Quellstand
wird hier nicht vorausgesetzt.

## Weiterführende Dokumentation

- [Architekturüberblick](docs/architecture/overview.md) und [Datenmodell](prisma/schema.prisma)
- [Architekturentscheidungen](docs/decisions/README.md)
- [Word-Add-in: Aufbau und lokale Prüfung](word-addin/README.md)
- [Isolierter Testaufbau](docs/operations/testing.md)
- [Öffentliche Demo und Deployment-Grenzen](docs/operations/portfolio-demo.md)
- [Entwicklungsübergabe](HANDOFF.md) und [Projektstand mit historischen Prüfprotokollen](PROJECT_STATUS.md)

Die Root-README beschreibt den Einstieg und die hier geprüfte Repository-Struktur. Ältere
Detaildokumente enthalten teilweise historische Architektur- und Milestone-Angaben; insbesondere
liegt das Word-Add-in aktuell unter `src/app/word-addin`, nicht in einem separaten Vite-Workspace.
