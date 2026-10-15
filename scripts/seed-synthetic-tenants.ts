/**
 * Synthetic Multi-Tenant Seeder for Scalability Benchmarks
 * Generates synthetic data representing 2,000 notary offices (or configurable count).
 * Uses batch inserts to minimize network roundtrips.
 */

import { getPrismaClient } from "../src/lib/db";

const GERMAN_CITIES = [
  "München", "Nürnberg", "Augsburg", "Würzburg", "Regensburg",
  "Ingolstadt", "Bamberg", "Bayreuth", "Landshut", "Rosenheim",
  "Frankfurt am Main", "Stuttgart", "Köln", "Düsseldorf", "Hamburg",
];

const GERMAN_SURNAMES = [
  "Müller", "Schmidt", "Schneider", "Fischer", "Weber",
  "Meyer", "Wagner", "Becker", "Schulz", "Hoffmann",
  "Schäfer", "Koch", "Bauer", "Richter", "Klein",
];

async function seedTenants() {
  const args = process.argv.slice(2);
  const tenantCountArg = args.find((a) => a.startsWith("--count="));
  const tenantCount = tenantCountArg ? parseInt(tenantCountArg.split("=")[1], 10) : 2000;
  const casesPerTenantArg = args.find((a) => a.startsWith("--cases="));
  const casesPerTenant = casesPerTenantArg ? parseInt(casesPerTenantArg.split("=")[1], 10) : 3;

  const prisma = getPrismaClient();
  if (!prisma) {
    console.error("Database connection unavailable.");
    process.exit(1);
  }

  console.log(`Starting synthetic seed for ${tenantCount} notary organizations (${casesPerTenant} cases each)...`);
  const startTime = Date.now();

  const BATCH_SIZE = 50;
  let createdOrgs = 0;
  let createdCases = 0;

  for (let i = 0; i < tenantCount; i += BATCH_SIZE) {
    const currentBatchSize = Math.min(BATCH_SIZE, tenantCount - i);
    const orgBatch: { id: string; name: string; slug: string; jurisdiction: string }[] = [];
    const casesBatch: {
      id: string;
      organizationId: string;
      caseNumber: string;
      title: string;
      matterType: "REAL_ESTATE";
      status: "READY_FOR_NOTARIZATION" | "IN_REVIEW" | "DRAFT";
      description: string;
      notaryName: string;
      assignedClerk: string;
      partiesSummary: object;
    }[] = [];

    for (let j = 0; j < currentBatchSize; j++) {
      const idx = i + j + 1;
      const padded = String(idx).padStart(4, "0");
      const orgId = `org_notariat_${padded}`;
      const city = GERMAN_CITIES[idx % GERMAN_CITIES.length];
      const notaryName = `Dr. ${GERMAN_SURNAMES[idx % GERMAN_SURNAMES.length]}`;
      const orgName = `Notariat ${notaryName} (${city})`;
      const slug = `notariat-${city.toLowerCase().replace(/[^a-z]/g, "")}-${padded}`;

      orgBatch.push({
        id: orgId,
        name: orgName,
        slug,
        jurisdiction: "DE-BY",
      });

      for (let k = 1; k <= casesPerTenant; k++) {
        const caseNumber = `2026-UR-${padded}-${k}`;
        const caseId = `case_${padded}_${k}`;
        casesBatch.push({
          id: caseId,
          organizationId: orgId,
          caseNumber,
          title: `Grundstückskaufvertrag Flur ${idx}, ${city}`,
          matterType: "REAL_ESTATE",
          status: k === 1 ? "READY_FOR_NOTARIZATION" : k === 2 ? "IN_REVIEW" : "DRAFT",
          description: `Kaufvertrag über Grundbesitz in ${city}. Urkundenrolle ${caseNumber}.`,
          notaryName,
          assignedClerk: "Stefanie Bauer",
          partiesSummary: {
            parties: [
              { role: "Verkäufer", name: `Eheleute ${GERMAN_SURNAMES[(idx + 1) % GERMAN_SURNAMES.length]}`, address: `${city}` },
              { role: "Käufer", name: `Familie ${GERMAN_SURNAMES[(idx + 2) % GERMAN_SURNAMES.length]}`, address: `${city}` },
            ],
            financials: { dealValue: 450000 + (idx * 1000), currency: "EUR" },
          },
        });
      }
    }

    // Insert organizations batch (skipDuplicates preserves existing)
    await prisma.organization.createMany({
      data: orgBatch,
      skipDuplicates: true,
    });
    createdOrgs += currentBatchSize;

    // Insert cases batch
    await prisma.case.createMany({
      data: casesBatch,
      skipDuplicates: true,
    });
    createdCases += casesBatch.length;

    if ((i + BATCH_SIZE) % 250 === 0 || i + BATCH_SIZE >= tenantCount) {
      console.log(`Progress: ${createdOrgs}/${tenantCount} organizations, ${createdCases} cases created...`);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Seeding complete: ${createdOrgs} organizations and ${createdCases} cases in ${durationSec}s.`);
}

seedTenants().catch((err) => {
  console.error("Seeding error:", err);
  process.exit(1);
});
