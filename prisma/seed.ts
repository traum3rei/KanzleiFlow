import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { getPrismaClient } from "../src/lib/db";
import { DEMO_NOTARIAT_CONTEXT } from "../src/lib/auth/tenant";

async function main() {
  const prisma = getPrismaClient();
  if (!prisma) {
    console.error("Database connection not configured in .env.local");
    process.exit(1);
  }

  console.log("Seeding KanzleiFlow database...");

  // 1. Organization
  const org = await prisma.organization.upsert({
    where: { id: DEMO_NOTARIAT_CONTEXT.organizationId },
    update: {
      name: DEMO_NOTARIAT_CONTEXT.organizationName,
      jurisdiction: DEMO_NOTARIAT_CONTEXT.jurisdiction,
    },
    create: {
      id: DEMO_NOTARIAT_CONTEXT.organizationId,
      name: DEMO_NOTARIAT_CONTEXT.organizationName,
      slug: DEMO_NOTARIAT_CONTEXT.organizationSlug,
      jurisdiction: DEMO_NOTARIAT_CONTEXT.jurisdiction,
    },
  });

  // 2. Notary User
  const notaryUser = await prisma.user.upsert({
    where: { id: DEMO_NOTARIAT_CONTEXT.userId },
    update: {
      fullName: DEMO_NOTARIAT_CONTEXT.userName,
      email: DEMO_NOTARIAT_CONTEXT.userEmail,
    },
    create: {
      id: DEMO_NOTARIAT_CONTEXT.userId,
      email: DEMO_NOTARIAT_CONTEXT.userEmail,
      fullName: DEMO_NOTARIAT_CONTEXT.userName,
    },
  });

  // 3. Organization Membership
  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: org.id,
        userId: notaryUser.id,
      },
    },
    update: { role: "NOTARY" },
    create: {
      organizationId: org.id,
      userId: notaryUser.id,
      role: "NOTARY",
    },
  });

  // Clean out any temporary test records
  await prisma.case.deleteMany({
    where: {
      title: { startsWith: "Testurkunde" },
    },
  });

  // 4. Seed Diverse Cases
  const casesData = [
    {
      id: "case_demo_01",
      organizationId: org.id,
      caseNumber: "2026-UR-0142",
      title: "Kaufvertrag Grundstück Flur 14, Gemarkung Schwabing",
      matterType: "REAL_ESTATE" as const,
      status: "READY_FOR_NOTARIZATION" as const,
      description:
        "Kaufvertrag über ein unbebautes Wohngrundstück (850 m²). Kaufpreis 1.850.000 EUR. Grundschuldbestellung der Käuferbank über 1.400.000 EUR liegt unterschriftsreif vor. Vorfälligkeitsentschädigung und Löschungsbewilligung der bisherigen Gläubigerin eingeholt.",
      notaryName: "Dr. Johannes Weiss",
      assignedClerk: "Stefanie Bauer",
      targetDate: new Date("2026-10-18T10:00:00.000Z"),
      partiesSummary: [
        { role: "Verkäuferin", name: "Dr. Barbara Lindner", address: "Königinstr. 12, 80539 München" },
        { role: "Käufer", name: "Maximilian Huber", address: "Leopoldstr. 45, 80802 München" },
        { role: "Finanzierende Bank", name: "Bayerische Landesbank", address: "Brienner Str. 1, 80333 München" },
      ],
      createdAt: new Date("2026-10-01T08:30:00.000Z"),
    },
    {
      id: "case_demo_02",
      organizationId: org.id,
      caseNumber: "2026-UR-0143",
      title: "Erbscheinsantrag nach Karoline Freifrau von Stauffen",
      matterType: "INHERITANCE" as const,
      status: "IN_REVIEW" as const,
      description:
        "Gesetzliche Erbfolge. Drei Miterben zu gleichen Teilen. Vorprüfung des Familienstammbaums, Sterbeurkunde und Geburtsurkunden der Abkömmlinge liegt vor. Termin zur Abgabe der eidesstattlichen Versicherung wird vorbereitet.",
      notaryName: "Dr. Johannes Weiss",
      assignedClerk: "Michael Köhler",
      targetDate: new Date("2026-10-22T14:30:00.000Z"),
      partiesSummary: [
        { role: "Erblasserin", name: "Karoline Freifrau von Stauffen (†)", address: "Schlossallee 4, 82319 Starnberg" },
        { role: "Antragsteller / Erbe", name: "Felix von Stauffen", address: "Ludwigstr. 18, 80539 München" },
        { role: "Miterbin", name: "Sophia von Stauffen", address: "Kaufingerstr. 8, 80331 München" },
      ],
      createdAt: new Date("2026-10-04T09:15:00.000Z"),
    },
    {
      id: "case_demo_03",
      organizationId: org.id,
      caseNumber: "2026-UR-0144",
      title: "Gründung AlpinTech Solutions GmbH & Gesellschafterliste",
      matterType: "CORPORATE" as const,
      status: "DRAFT" as const,
      description:
        "Bargründung mit Stammkapital 50.000 EUR. Zwei Gründungsgesellschafter mit Musterprotokoll-Abweichung bezüglich gesellschaftsvertraglicher Vorerwerbsrechte und Geschäftsführungsbefugnissen. Elektronische Einreichung beim Registergericht München vorbereitet.",
      notaryName: "Dr. Johannes Weiss",
      assignedClerk: "Stefanie Bauer",
      targetDate: new Date("2026-10-25T11:00:00.000Z"),
      partiesSummary: [
        { role: "Gründungsgesellschafterin", name: "Laura Bergmann", address: "Maximilianstr. 22, 80539 München" },
        { role: "Gründungsgesellschafter", name: "David Sommer", address: "Sendlinger Str. 9, 80331 München" },
      ],
      createdAt: new Date("2026-10-08T13:00:00.000Z"),
    },
    {
      id: "case_demo_04",
      organizationId: org.id,
      caseNumber: "2026-UR-0139",
      title: "General- und Vorsorgevollmacht Eheleute Weber",
      matterType: "POWER_OF_ATTORNEY" as const,
      status: "NOTARIZED" as const,
      description:
        "Umfassende vermögensrechtliche und persönliche Vorsorgevollmacht nebst Patientenverfügung. Beurkundung am 05.10.2026 vollzogen. Elektronische Registrierung beim Zentralen Vorsorgeregister (ZVR) der Bundesnotarkammer übermittelt.",
      notaryName: "Dr. Johannes Weiss",
      assignedClerk: "Michael Köhler",
      targetDate: new Date("2026-10-05T09:00:00.000Z"),
      partiesSummary: [
        { role: "Vollmachtgeber 1", name: "Heinrich Weber", address: "Prinzregentenstr. 54, 81675 München" },
        { role: "Vollmachtgeberin 2", name: "Margarete Weber", address: "Prinzregentenstr. 54, 81675 München" },
      ],
      createdAt: new Date("2026-09-28T10:00:00.000Z"),
    },
    {
      id: "case_demo_05",
      organizationId: org.id,
      caseNumber: "2026-UR-0130",
      title: "Kaufvertrag Eigentumswohnung Leopoldstraße 84",
      matterType: "REAL_ESTATE" as const,
      status: "COMPLETED" as const,
      description:
        "3-Zimmer-Eigentumswohnung mit Sondernutzungsrecht an Tiefgaragenstellplatz. Kaufpreiszahlung nachgewiesen. Unbedenklichkeitsbescheinigung des Finanzamts liegt vor. Eigentumsumschreibung im Grundbuch vollzogen. Akte abgeschlossen.",
      notaryName: "Dr. Johannes Weiss",
      assignedClerk: "Stefanie Bauer",
      targetDate: new Date("2026-09-15T15:00:00.000Z"),
      partiesSummary: [
        { role: "Verkäufer", name: "Jonas Eder", address: "Leopoldstr. 84, 80802 München" },
        { role: "Käuferin", name: "Dr. Sarah Richter", address: "Balanstr. 14, 81669 München" },
      ],
      createdAt: new Date("2026-09-01T11:00:00.000Z"),
    },
  ];

  for (const c of casesData) {
    await prisma.case.upsert({
      where: {
        organizationId_caseNumber: {
          organizationId: c.organizationId,
          caseNumber: c.caseNumber,
        },
      },
      update: {
        title: c.title,
        matterType: c.matterType,
        status: c.status,
        description: c.description,
        notaryName: c.notaryName,
        assignedClerk: c.assignedClerk,
        targetDate: c.targetDate,
        partiesSummary: c.partiesSummary,
      },
      create: {
        id: c.id,
        organizationId: c.organizationId,
        caseNumber: c.caseNumber,
        title: c.title,
        matterType: c.matterType,
        status: c.status,
        description: c.description,
        notaryName: c.notaryName,
        assignedClerk: c.assignedClerk,
        targetDate: c.targetDate,
        partiesSummary: c.partiesSummary,
        createdAt: c.createdAt,
      },
    });
  }

  console.log("Successfully seeded 5 diverse demo cases across all legal statuses!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  });
