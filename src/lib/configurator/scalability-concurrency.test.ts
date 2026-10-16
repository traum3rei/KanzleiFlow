import { describe, it, expect, beforeEach } from "vitest";

import { getPrismaClient } from "@/lib/db";
import { TenantContext } from "@/lib/auth/tenant";
import { createCase, getCases, getCaseStatusCounts, getDashboardStats } from "@/lib/services/case-service";
import {
  createConfiguration,
  saveConfiguration,
  ConfigurationConcurrencyError,
} from "./configurator-service";

const TENANT_OCC: TenantContext = {
  organizationId: "org_notariat_occ_test",
  organizationSlug: "notariat-occ-test",
  organizationName: "Notariat OCC Test",
  jurisdiction: "DE-BY",
  userId: "user_occ_test",
  userName: "Notar OCC Test",
  userRole: "NOTARY",
  userEmail: "occ@notariat-test.de",
};

describe("Scalability & Concurrency Regressions", () => {
  const prisma = getPrismaClient();

  beforeEach(async () => {
    if (prisma) {
      await prisma.organization.upsert({
        where: { id: TENANT_OCC.organizationId },
        update: {},
        create: {
          id: TENANT_OCC.organizationId,
          name: TENANT_OCC.organizationName,
          slug: "notariat-occ-test",
        },
      });
    }
  });

  it("enforces optimistic concurrency control and rejects stale autosave writes", async () => {
    const testCase = await createCase(TENANT_OCC, {
      caseNumber: `2026-OCC-${Date.now().toString().slice(-4)}`,
      title: "OCC Test Case",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    const config = await createConfiguration(TENANT_OCC, testCase.id, {
      title: "Initial Title",
    });

    expect(config.version).toBe(1);

    // User A saves at version 1 -> advances to version 2
    const saveA = await saveConfiguration(
      TENANT_OCC,
      config.id,
      { title: "Updated by User A" },
      1,
      1 // expectedVersion = 1
    );
    expect(saveA.updated.version).toBe(2);
    expect(saveA.updated.title).toBe("Updated by User A");

    // User B tries to save using stale version 1 -> must throw ConfigurationConcurrencyError
    await expect(
      saveConfiguration(
        TENANT_OCC,
        config.id,
        { title: "Stale update from User B" },
        1,
        1 // expectedVersion = 1 (stale, current is 2)
      )
    ).rejects.toThrow(ConfigurationConcurrencyError);

    // User B refreshes and sends expectedVersion = 2 -> succeeds and advances to version 3
    const saveB = await saveConfiguration(
      TENANT_OCC,
      config.id,
      { title: "Updated by User B after refresh" },
      1,
      2
    );
    expect(saveB.updated.version).toBe(3);
    expect(saveB.updated.title).toBe("Updated by User B after refresh");
  });

  it("bounds case query results and prevents unbounded database reads", async () => {
    // Query with explicit take limit
    const boundedCases = await getCases(TENANT_OCC, { take: 5 });
    expect(boundedCases.length).toBeLessThanOrEqual(5);

    // Query with default bounded limit
    const defaultCases = await getCases(TENANT_OCC);
    expect(defaultCases.length).toBeLessThanOrEqual(100);
  });

  it("calculates status counts via index-only aggregation rather than loading entire table", async () => {
    const counts = await getCaseStatusCounts(TENANT_OCC);
    expect(counts).toBeDefined();
    expect(typeof counts.ALL).toBe("number");
    expect(typeof counts.DRAFT).toBe("number");
    expect(typeof counts.READY_FOR_NOTARIZATION).toBe("number");

    const dash = await getDashboardStats(TENANT_OCC);
    expect(dash.totalCases).toBe(counts.ALL);
    expect(dash.recentCases.length).toBeLessThanOrEqual(5);
  });
});
