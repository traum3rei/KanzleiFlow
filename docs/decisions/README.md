# Architekturentscheidungen

Diese Übersicht erklärt die wichtigsten technischen Entscheidungen von KanzleiFlow und ihre
Folgen. Sie beschreibt den im Repository vorhandenen Aufbau. Frühere Aussagen zu einem separaten
Vite-Add-in, garantierter Skalierung oder bestätigter XNP-Kompatibilität werden hier korrigiert.
Die Einträge sind keine nachträglichen Leistungs- oder Produktionsnachweise.

## 1. Next.js App Router für Oberfläche und Server

**Entscheidung:** React-Oberflächen, serverseitige Datenzugriffe, Server Actions und HTTP-Endpunkte
liegen in einer Next.js-Anwendung. `next.config.ts` aktiviert Cache Components und Partial Prefetching.
Die geschützten Seiten teilen sich das Layout unter `src/app/(workspace)`.

**Grund:** Eine gemeinsame Anwendung hält den Weg zwischen Formularen, Authentifizierung und
Fachlogik kurz. Das Layout erhält die Navigation bei Seitenwechseln.

**Folge:** Server- und Client-Grenzen sowie das Zusammenspiel von Caching, Cookies und dynamischen
Daten müssen bewusst behandelt werden. Für die eingesetzte Next.js-Version gelten die mitgelieferten
Guides unter `node_modules/next/dist/docs/`.

## 2. PostgreSQL und Prisma mit Isolation in der Anwendung

**Entscheidung:** Organisationen teilen sich eine relationale Datenbank. Fachliche Daten werden
über `organizationId` zugeordnet. Ein geprüfter Tenant-Kontext begrenzt Zugriffe; zusätzliche
Eigentümerschaftsprüfungen schützen einzelne Ressourcen.

**Grund:** Prisma liefert typisierte Zugriffe; PostgreSQL unterstützt Beziehungen, Transaktionen
und atomare Bedingungen für konkurrierende Änderungen.

**Folge:** Die dokumentierte Verbindungsrolle umgeht RLS. Vergessene Filter oder Prüfungen können
Daten offenlegen. Die Isolation ist keine automatisch durch Prisma garantierte Eigenschaft.
Cross-Tenant-Tests sind deshalb Teil der Sicherheitsprüfung.

Quellen im Projekt: [Tenant-Auflösung](../../src/lib/auth/tenant.ts),
[Schema](../../prisma/schema.prisma), [Isolationstests](../../src/lib/auth/production-security.test.ts).

## 3. Hintergrundjobs in PostgreSQL

**Entscheidung:** Eine datenbankgestützte Queue beansprucht Jobs mit `FOR UPDATE SKIP LOCKED`.
Der Worker unterstützt Wiederholungen und die Wiederaufnahme abgelaufener Leases.

**Grund:** Hintergrundverarbeitung benötigt damit keinen zusätzlichen Redis- oder Message-Broker-Dienst.

**Folge:** Worker-Betrieb, Fehlerbehandlung und Datenbanklast bleiben betriebliche Aufgaben.
Die Implementierung belegt keine bestimmte Zahl gleichzeitig unterstützter Notariate oder Jobs.

Implementierung: [Queue und Worker](../../src/lib/queue).

## 4. Cookie- und Bearer-Authentifizierung

**Entscheidung:** Die Webanwendung unterstützt Supabase-SSR-Sitzungen und signierte HMAC-Sitzungen.
Für den Word-Aufgabenbereich existiert zusätzlich ein Bearer-Zugriffspfad.

**Grund:** Eingebettete Office-WebViews können andere Cookie-Bedingungen als der normale Browser haben.

**Folge:** Beide Zugriffswege müssen dieselben Organisationsmitgliedschaften und Zugriffskontrollen
anwenden. Demo-Sitzungen sind an reservierte synthetische Identitäten gebunden.
Ein externer Supabase-Betrieb muss separat geprüft werden.

Implementierung: [Sitzungen](../../src/lib/auth/session.ts), [Tenant-Auflösung](../../src/lib/auth/tenant.ts).

## 5. Datei-Exporte als XNP-Integrationsprototyp

**Entscheidung:** XML-Daten und Metadaten werden als ZIP-Pakete erzeugt. Exporte besitzen gespeicherte
Snapshots und Hashes. Sie sind ausdrücklich als technische Prototypen gekennzeichnet.

**Grund:** Ein cloudbasierter Browser kann eine lokale XNP-Schnittstelle nicht als allgemein
verfügbaren Integrationsweg voraussetzen. Datei-Exporte ermöglichen die Untersuchung einer Übergabe.

**Folge:** Interne Pflichtfeldprüfungen und ZIP-Erzeugung belegen weder amtliche XSD-Konformität
noch einen erfolgreichen Import. Ein offizieller XNP-Import und die fachliche Abnahme stehen aus.

Implementierung: [XNP-Prototyp](../../src/lib/integrations/xnp).

## 6. Word-Aufgabenbereich innerhalb von Next.js

**Entscheidung:** Der Aufgabenbereich liegt unter `src/app/word-addin/taskpane`; Office.js-Helfer
liegen unter `src/lib/addin`. Das Verzeichnis `word-addin/` enthält die Manifeste.

**Grund:** Oberfläche und API nutzen dieselbe Anwendung und denselben Entwicklungsserver.

**Folge:** Es gibt keinen separaten Vite-Build. Ein echter Office-Test benötigt passende
Manifest-Adressen und vertrauenswürdiges HTTPS. Browser-Tests ersetzen keine Word-Host-Prüfung.

Anleitung: [Word-Add-in](../../word-addin/README.md).

## 7. Zeitlich begrenzte Caches und stabile Navigation

**Entscheidung:** Datenbankgesundheit, verfügbare Zuständigkeiten und Statuszahlen werden zeitlich
begrenzt zwischengespeichert. Fachliche Caches werden pro Organisation geführt und nach
Aktenänderungen invalidiert. Gemeinsame Layouts, Ladeansichten und Link-Prefetching unterstützen Navigation.

**Grund:** Weniger wiederholte Datenbankabfragen und ein stabiler Seitenrahmen verbessern die Bedienung.

**Folge:** In-Memory-Caches gelten nur innerhalb einer Serverinstanz. Änderungen und Cache-Schlüssel
müssen die Mandantengrenzen respektieren; eine konkrete Beschleunigung ist separat zu messen.

## 8. Reproduzierbare Prüfung mit temporärem PostgreSQL

**Entscheidung:** Der Test-Runner startet eine wegwerfbare PostgreSQL-Instanz, richtet synthetische
Daten ein, prüft Schemaabweichungen und entfernt die Testdaten anschließend.

**Grund:** Datenbanktests und Vorführungen sollen ohne Zugriff auf bestehende Entwicklungs- oder
Produktionsdaten reproduzierbar sein.

**Folge:** Läufe verwenden feste lokale Ports und werden nacheinander ausgeführt. Die historischen
Migrationsnamen erfordern vor einem externen Deployment eine gesonderte Baselineprüfung;
der Test-Runner führt sie ausdrücklich in Abhängigkeitsreihenfolge aus.

Anleitung: [Testaufbau](../operations/testing.md), [Runner](../../scripts/testing/run.mjs).

[Zur Projektübersicht](../../README.md)
