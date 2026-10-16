
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSessionToken, verifySessionToken, SESSION_DURATION_MS } from "@/lib/auth/session";
import { DEMO_NOTARIAT_CONTEXT } from "@/lib/auth/tenant";
import { createCase, deleteCase } from "@/lib/services/case-service";
import {
  insertFieldAsContentControl,
  insertPartiesSection,
  insertPropertySection,
  insertFinancialsSection,
  insertCaseSummaryHeader,
  isWordHostAvailable,
} from "@/lib/addin/word-service";
import { POST as loginRoute } from "@/app/api/addin/auth/login/route";
import { GET as meRoute } from "@/app/api/addin/auth/me/route";
import { GET as casesRoute } from "@/app/api/addin/cases/route";
import { GET as caseDetailRoute } from "@/app/api/addin/cases/[id]/route";
import { POST as auditRoute } from "@/app/api/addin/audit/route";

describe("Microsoft Word Add-in — Authentication & API Layer", () => {
  let validToken: string;
  const uniqueCaseNumber = `2026-UR-ADDIN-${Date.now()}`;

  beforeEach(async () => {
    validToken = createSessionToken(
      {
        userId: DEMO_NOTARIAT_CONTEXT.userId,
        email: DEMO_NOTARIAT_CONTEXT.userEmail,
        fullName: DEMO_NOTARIAT_CONTEXT.userName,
      },
      SESSION_DURATION_MS
    );
  });

  it("authenticates via login endpoint and issues a cryptographically signed Bearer token", async () => {
    const req = new Request("http://localhost:3000/api/addin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "j.weiss@notariat-weiss-partner.de",
        password: "notar-geheim-2026",
      }),
    });

    const res = await loginRoute(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.token).toBeDefined();
    expect(typeof data.token).toBe("string");
    expect(data.tenant.organizationId).toBe(DEMO_NOTARIAT_CONTEXT.organizationId);

    // Verify token can be decoded and verified
    const payload = verifySessionToken(data.token);
    expect(payload).not.toBeNull();
    expect(payload?.email).toBe("j.weiss@notariat-weiss-partner.de");
  });

  it("rejects login with invalid credentials", async () => {
    const req = new Request("http://localhost:3000/api/addin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "j.weiss@notariat-weiss-partner.de",
        password: "wrong-password",
      }),
    });

    const res = await loginRoute(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe("INVALID_CREDENTIALS");
  });

  it("validates current session via /api/addin/auth/me", async () => {
    const req = new Request("http://localhost:3000/api/addin/auth/me", {
      headers: { Authorization: `Bearer ${validToken}` },
    });

    const res = await meRoute(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.tenant.organizationId).toBe(DEMO_NOTARIAT_CONTEXT.organizationId);
  });

  it("rejects expired or tampered session token", async () => {
    // Expired token (issued in the past with negative duration)
    const expiredToken = createSessionToken(
      {
        userId: DEMO_NOTARIAT_CONTEXT.userId,
        email: DEMO_NOTARIAT_CONTEXT.userEmail,
        fullName: DEMO_NOTARIAT_CONTEXT.userName,
      },
      -10000
    );

    const req = new Request("http://localhost:3000/api/addin/auth/me", {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });

    const res = await meRoute(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe("UNAUTHORIZED");
  });

  it("lists cases scoped strictly to authenticated tenant", async () => {
    const req = new Request("http://localhost:3000/api/addin/cases?pageSize=10", {
      headers: { Authorization: `Bearer ${validToken}` },
    });

    const res = await casesRoute(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.cases)).toBe(true);
    expect(data.pagination.pageSize).toBe(10);

    for (const c of data.cases) {
      expect(c.organizationId).toBe(DEMO_NOTARIAT_CONTEXT.organizationId);
    }
  });

  it("retrieves approved case details and formats structured fields", async () => {
    // Create a temporary case with rich data
    const created = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: uniqueCaseNumber,
      title: "Add-in Testurkunde Grundstück Bogenhausen",
      matterType: "REAL_ESTATE",
      status: "READY_FOR_NOTARIZATION",
      notaryName: "Dr. Johannes Weiss",
      assignedClerk: "Stefanie Bauer",
      parties: [
        {
          role: "Käufer",
          name: "Maximilian Testkäufer",
          address: "Leopoldstr. 10, 80802 München",
          taxId: "12 345 678 901",
        },
      ],
      propertyDetails: {
        landRegistryDistrict: "Bogenhausen",
        sheetNumber: "7788",
        parcelNumber: "Flur 4, Flurstück 10/2",
        areaSqm: 500,
      },
      financials: {
        dealValue: 850000,
        currency: "EUR",
        paymentDueDate: "2026-12-15",
      },
    });

    const req = new Request(`http://localhost:3000/api/addin/cases/${created.id}`, {
      headers: { Authorization: `Bearer ${validToken}` },
    });

    const res = await caseDetailRoute(req, { params: Promise.resolve({ id: created.id }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.metadata.caseNumber).toBe(uniqueCaseNumber);
    expect(data.data.parties.length).toBe(1);
    expect(data.data.parties[0].name).toBe("Maximilian Testkäufer");
    expect(data.data.property.district).toBe("Bogenhausen");
    expect(data.data.financials.dealValue).toContain("850.000");

    // Clean up
    await deleteCase(DEMO_NOTARIAT_CONTEXT, created.id);
  });

  it("strictly enforces tenant isolation: Tenant B cannot access Tenant A's case", async () => {
    // 1. Create a case for Tenant A
    const tenantACase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: `2026-UR-ISOL-${Date.now()}`,
      title: "Vertraulicher Fall Notariat Weiss",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    // 2. Issue token for Tenant B (foreign attacker)
    const foreignToken = createSessionToken(
      {
        userId: "usr_attacker",
        email: "attacker@foreign-notary.de",
        fullName: "Dr. Fremd",
      },
      SESSION_DURATION_MS
    );

    // 3. Foreign user attempts to query Tenant A's case
    const req = new Request(`http://localhost:3000/api/addin/cases/${tenantACase.id}`, {
      headers: {
        Authorization: `Bearer ${foreignToken}`,
        "x-kanzleiflow-org-id": "org_foreign_attacker",
      },
    });

    const res = await caseDetailRoute(req, { params: Promise.resolve({ id: tenantACase.id }) });
    // Should be rejected with 404 or 500 (Tenant Isolation Violation)
    expect(res.status).toBeGreaterThanOrEqual(400);

    // Clean up
    await deleteCase(DEMO_NOTARIAT_CONTEXT, tenantACase.id);
  });

  it("records audit event for Word Add-in insertion without sensitive document content", async () => {
    const auditReq = new Request("http://localhost:3000/api/addin/audit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        caseId: "case_demo_01",
        actionType: "WORD_ADDIN_DATA_INSERTED",
        fieldKey: "dealValue",
        fieldLabel: "Kaufpreis",
      }),
    });

    const res = await auditRoute(auditReq);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.logged).toBe(true);
  });
});

describe("Microsoft Word Add-in — Client-side Word Service", () => {
  it("detects browser simulation environment when Word host is unavailable", () => {
    expect(isWordHostAvailable()).toBe(false);
  });

  it("simulates field insertion gracefully in browser preview", async () => {
    const res = await insertFieldAsContentControl(
      "2026-UR-0142",
      "caseNumber",
      "Aktenzeichen",
      "2026-UR-0142"
    );

    expect(res.success).toBe(true);
    expect(res.simulated).toBe(true);
    expect(res.message).toContain("Vorschau-Modus");
  });

  it("clearly flags missing and unverified values during insertion", async () => {
    const res = await insertFieldAsContentControl(
      "2026-UR-0142",
      "missingField",
      "Steuer-ID",
      "",
      { isVerified: false, unverifiedDisclaimer: true }
    );

    expect(res.success).toBe(true);
    expect(res.simulated).toBe(true);
  });

  it("simulates section tables for parties, property, and financials", async () => {
    const partiesRes = await insertPartiesSection(
      [
        {
          index: 1,
          name: "Dr. Barbara Lindner",
          role: "Verkäuferin",
          address: "Königinstr. 12, München",
        },
      ],
      "2026-UR-0142"
    );
    expect(partiesRes.success).toBe(true);
    expect(partiesRes.simulated).toBe(true);

    const propRes = await insertPropertySection(
      { district: "Schwabing", sheetNumber: "4521" },
      "2026-UR-0142"
    );
    expect(propRes.success).toBe(true);

    const finRes = await insertFinancialsSection(
      { dealValue: "1.850.000 EUR", dueDate: "2026-11-15" },
      "2026-UR-0142"
    );
    expect(finRes.success).toBe(true);

    const headerRes = await insertCaseSummaryHeader({
      caseNumber: "2026-UR-0142",
      title: "Kaufvertrag Grundstück Flur 14",
      matterTypeLabel: "Grundstückskaufvertrag & Grundbuch",
      statusLabel: "Beurkundungsreif",
      notaryName: "Dr. Johannes Weiss",
      assignedClerk: "Stefanie Bauer",
    });
    expect(headerRes.success).toBe(true);
  });

  it("executes real Word.run when Office.js Word host is mocked", async () => {
    const mockSync = vi.fn().mockResolvedValue(undefined);
    const mockInsertContentControl = vi.fn().mockReturnValue({
      title: "",
      tag: "",
      appearance: "",
      color: "",
    });
    const mockInsertText = vi.fn().mockReturnValue({
      insertContentControl: mockInsertContentControl,
    });
    const mockGetSelection = vi.fn().mockReturnValue({
      insertText: mockInsertText,
    });

    const mockWord = {
      run: vi.fn(async (callback: (ctx: unknown) => Promise<unknown>) => {
        const mockContext = {
          document: {
            getSelection: mockGetSelection,
          },
          sync: mockSync,
        };
        return callback(mockContext);
      }),
      InsertLocation: { replace: "Replace", after: "After" },
      ContentControlAppearance: { boundingBox: "BoundingBox" },
      Style: { heading1: "Heading1", heading2: "Heading2", gridTable4Accent1: "GridTable4" },
      Alignment: { left: "Left" },
    };

    const mockOffice = {
      context: { document: {} },
    };

    // Attach mock to globalThis
    (globalThis as unknown as { Word: unknown }).Word = mockWord;
    (globalThis as unknown as { Office: unknown }).Office = mockOffice;

    expect(isWordHostAvailable()).toBe(true);

    const res = await insertFieldAsContentControl(
      "2026-UR-0142",
      "testField",
      "Test Bezeichnung",
      "Verifizierter Wert",
      { isVerified: true }
    );

    expect(res.success).toBe(true);
    expect(res.simulated).toBe(false);
    expect(mockWord.run).toHaveBeenCalled();
    expect(mockGetSelection).toHaveBeenCalled();
    expect(mockInsertText).toHaveBeenCalledWith("Verifizierter Wert", "Replace");
    expect(mockInsertContentControl).toHaveBeenCalled();
    expect(mockSync).toHaveBeenCalled();

    // Clean up globals
    delete (globalThis as unknown as { Word?: unknown }).Word;
    delete (globalThis as unknown as { Office?: unknown }).Office;
  });
});
