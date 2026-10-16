import Link from "next/link";

export default function DemoInformationPage() {
  return <main className="app-shell min-h-screen text-zinc-900 dark:text-zinc-100">
    <article className="max-w-3xl mx-auto px-4 py-10 space-y-7">
      <Link href="/" prefetch={true} className="text-sm underline">Zur Anwendung</Link>
      <h1 className="text-3xl font-semibold">Über diese Demo</h1>
      <p>KanzleiFlow ist ein technischer Demonstrationsprototyp. Die dargestellten Akten, Personen, Dokumente und Arbeitsabläufe dienen ausschließlich der Veranschaulichung. Rechtliche Inhalte wurden nicht fachlich geprüft. Die Anwendung ist nicht für den produktiven Kanzleibetrieb oder die Verarbeitung realer Mandantendaten vorgesehen.</p>
      <p>Die Anwendung wurde nicht von juristischen Fachpersonen, Rechtsanwältinnen, Rechtsanwälten oder Notariaten geprüft. Beispielklauseln und technische Prüfregeln sind keine Rechtsberatung und keine Bestätigung rechtlicher Richtigkeit, Vollständigkeit oder Verwendbarkeit.</p>
      <section className="space-y-3"><h2 className="text-xl font-semibold">Tatsächlich implementiert</h2><p>Aktenanlage und -bearbeitung, Suche, Filter, Dateiupload, Korrektur und Bestätigung strukturierter Angaben, Formularspeicherung mit Konflikterkennung sowie DOCX-Erstellung und Versionshistorie sind technische Funktionen. Eine Datenbestätigung in der Demo bedeutet keine juristische Freigabe.</p></section>
      <section className="space-y-3"><h2 className="text-xl font-semibold">Beispiele und Simulationen</h2><p>Vorlagen, Klauseln, Beispielpersonen und Verfahrensschritte sind illustrativ. Die KI-Extraktion kann je nach Serverkonfiguration synthetische Mock-Ergebnisse oder einen externen Anbieter verwenden; der aktive Modus wird im Dokumentenablauf angezeigt. Automatisierte lokale Tests verwenden Mock-Ergebnisse.</p><p>Der öffentliche Demo-Zugang verwendet ein eingeschränktes Konto in einer ausschließlich fiktiven, gemeinsam genutzten Organisation. Dort vorgenommene Änderungen können für andere Demo-Gäste sichtbar sein. Bitte verwenden Sie ausschließlich erfundene Daten.</p></section>
      <section className="space-y-3"><h2 className="text-xl font-semibold">Externe Integrationen und offene Nachweise</h2><p>XNP-Pakete können lokal erzeugt und heruntergeladen werden. Ein offizieller Schemaabgleich, ein erfolgreicher Import in XNP und eine direkte Behördenübertragung sind nicht bestätigt. Es besteht keine bestätigte offizielle XNP-Kompatibilität oder Zertifizierung.</p><p>Die Word-Oberfläche und ihre API sind implementiert. Installation und Einfügen in echtem Microsoft Word benötigen einen gesonderten Nachweis. Externe KI und Supabase-Anmeldung hängen von der Konfiguration ab und sind durch lokale Mock-Tests nicht als live geprüft nachgewiesen.</p><p>Die Demo beansprucht keine bestätigte Datenschutz- oder berufsrechtliche Compliance, Rechtsgültigkeit oder Eignung für den produktiven Betrieb.</p></section>
    </article>
  </main>;
}
