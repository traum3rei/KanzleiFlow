import { describe, it, expect } from "vitest";
import {
  getTenantContext,
  assertTenantOwnership,
  DEMO_NOTARIAT_CONTEXT,
} from "./tenant";

describe("Tenant Isolation Layer", () => {
  it("resolves the verified server tenant context", async () => {
    const tenant = await getTenantContext();
    expect(tenant.organizationId).toBe("org_notariat_weiss_01");
    expect(tenant.organizationSlug).toBe("notariat-weiss-partner");
    expect(tenant.userRole).toBe("NOTARY");
  });

  it("permits access when entity belongs to active tenant", () => {
    expect(() => {
      assertTenantOwnership("org_notariat_weiss_01", DEMO_NOTARIAT_CONTEXT);
    }).not.toThrow();
  });

  it("strictly rejects foreign tenant resource access (cross-tenant security)", () => {
    expect(() => {
      assertTenantOwnership("org_foreign_firm_999", DEMO_NOTARIAT_CONTEXT);
    }).toThrow(/Tenant Isolation Violation/);
  });
});
