# KanzleiFlow – Portfolio-Demo

Technische Demonstration einer mandantenfähigen Aktenverwaltung mit Dokumentenverarbeitung,
Formularkonfigurator, DOCX-Versionen und prototypischen Exportpaketen. Next.js, React, TypeScript,
Prisma und PostgreSQL.

**Nicht von juristischen Fachpersonen geprüft. Nicht für produktiven Kanzleibetrieb oder reale
Mandantendaten vorgesehen.** Beispielklauseln und Verfahrensschritte sind illustrativ. Es wird
keine rechtliche Gültigkeit, bestätigte Datenschutz-Compliance oder offizielle XNP-Kompatibilität
behauptet. Die Oberfläche erläutert echte Implementierungen und Simulationen unter `/demo`.

## Lokal mit ausschließlich synthetischen Daten

```bash
npm ci
npx playwright install chromium
npm run test:serve
```

Unter `http://127.0.0.1:3100` läuft eine isolierte Demo mit PostgreSQL und Mock-Extraktion.
Auf der Login-Seite Demo-Notariat A oder B auswählen und „Demo-Zugang verwenden“ anklicken.
Die Notariate besitzen getrennte Konten und Akten; zum Vergleich abmelden und neu auswählen.
Mit Ctrl+C beenden; Datenbank und Dateien werden abgebaut. Keine echten Daten eingeben.

## Prüfung

```bash
npm test
npm run test:e2e
node scripts/testing/run.mjs e2e-production
npx tsc --noEmit
npm run lint
```

Datenbankläufe nacheinander ausführen. Der Produktionslauf verwendet Prisma-Generierung,
Standardbuild und `next start` mit synthetischer Datenbank. Eine echte externe Bereitstellung
ist dadurch nicht automatisch geprüft.

- [Öffentlicher Demo-Zugang und Vercel-Einrichtung](docs/operations/portfolio-demo.md)
- [Projektstand](PROJECT_STATUS.md)
- [Handoff](HANDOFF.md)
- [Testaufbau](docs/operations/testing.md)

Die Arbeitsoberfläche liegt in `src/app/(workspace)`; ihre URLs bleiben `/`, `/cases` und Unterrouten.
Die gemeinsame Navigation bleibt im Layout erhalten. Login und Demo-Erklärung sind öffentliche Seiten.
