import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultConfigurationData } from "./rules-engine";
import type { TenantContext } from "@/lib/auth/tenant";

const db = vi.hoisted(() => ({
  documentConfiguration: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    updateMany: vi.fn(),
  },
  clauseDefinition: { findMany: vi.fn() },
  selectedClause: { deleteMany: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getPrismaClient: () => db }));
vi.mock("@/lib/auth/tenant", () => ({
  assertTenantOwnership: (tenant: TenantContext, organizationId: string) => {
    if (tenant.organizationId !== organizationId) throw new Error("Tenant mismatch");
  },
}));
import { saveConfiguration, ConfigurationConcurrencyError } from "./configurator-service";

const tenant = { organizationId: "org-a" } as TenantContext;

describe("configuration save concurrency", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.documentConfiguration.findUnique.mockResolvedValue({
      id: "config-a", organizationId: "org-a", version: 4,
      formData: getDefaultConfigurationData("TEST-1"), templateVersionId: "template-a", step: 1,
    });
    db.clauseDefinition.findMany.mockResolvedValue([]);
    db.$transaction.mockImplementation((operation) => operation(db));
  });

  it("rejects a stale tab before starting the transaction", async () => {
    await expect(saveConfiguration(tenant, "config-a", {}, 1, 3)).rejects.toBeInstanceOf(ConfigurationConcurrencyError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a competing write after the initial version check without replacing clauses", async () => {
    db.documentConfiguration.updateMany.mockResolvedValue({ count: 0 });
    await expect(saveConfiguration(tenant, "config-a", {}, 1, 4)).rejects.toBeInstanceOf(ConfigurationConcurrencyError);
    expect(db.documentConfiguration.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "config-a", organizationId: "org-a", version: 4 },
    }));
    expect(db.selectedClause.deleteMany).not.toHaveBeenCalled();
  });

  it("returns the new version after a successful atomic update", async () => {
    db.documentConfiguration.updateMany.mockResolvedValue({ count: 1 });
    db.documentConfiguration.findUniqueOrThrow.mockResolvedValue({ id: "config-a", version: 5 });
    const result = await saveConfiguration(tenant, "config-a", {}, 2, 4);
    expect(result.updated.version).toBe(5);
    expect(db.selectedClause.deleteMany).toHaveBeenCalledOnce();
  });

  it("blocks another tenant before any write", async () => {
    await expect(saveConfiguration({ organizationId: "org-b" } as TenantContext, "config-a", {}, 1, 4)).rejects.toThrow("Tenant mismatch");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
