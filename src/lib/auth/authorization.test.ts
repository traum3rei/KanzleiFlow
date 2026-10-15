import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getTenantContext,
  resolveTenantContextFromUser,
  AuthenticationRequiredError,
  TenantIsolationError,
  NoOrganizationMembershipError,
  TenantContext,
} from "./tenant";
import {
  createSessionToken,
  verifySessionToken,
} from "./session";
import { getPrismaClient } from "@/lib/db";
import { getCaseById } from "@/lib/services/case-service";
import {
  ingestDocument,
  getDocumentById,
  deleteDocument,
} from "@/lib/services/document-service";
import {
  approveExtraction,
} from "@/lib/services/extraction-service";
import {
  generateDraft,
  getDraftById,
} from "@/lib/services/draft-service";

const TENANT_A: TenantContext = {
  organizationId: "org_notariat_weiss_01",
  organizationSlug: "notariat-weiss-partner",
  organizationName: "Notariat Dr. Johannes Weiss & Partner",
  jurisdiction: "DE-BY",
  userId: "usr_notary_weiss_01",
  userEmail: "j.weiss@notariat-weiss-partner.de",
  userName: "Dr. Johannes Weiss (Notar)",
  userRole: "NOTARY",
};

const TENANT_B: TenantContext = {
  organizationId: "org_notariat_schmidt_02",
  organizationSlug: "notariat-schmidt-nuernberg",
  organizationName: "Notariat Dr. Schmidt (Nürnberg)",
  jurisdiction: "DE-BY",
  userId: "usr_notary_schmidt_02",
  userEmail: "schmidt@notariat-schmidt.de",
  userName: "Dr. Friedrich Schmidt",
  userRole: "NOTARY",
};

describe("Milestone: Multi-Tenant Security & Server-Side Authorization Boundaries", () => {
  const originalEnv = { ...process.env };
  const prisma = getPrismaClient();

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // --------------------------------------------------------------------------
  // 1. Unauthenticated requests are rejected
  // --------------------------------------------------------------------------
  it("Boundary 1: Unauthenticated requests are rejected in production (no demo fallback)", async () => {
    process.env.APP_ENV = "production";
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    await expect(getTenantContext()).rejects.toThrow(AuthenticationRequiredError);
    await expect(getTenantContext()).rejects.toThrow(/Authentifizierung erforderlich/);
  });

  it("Boundary 1b: Unauthenticated requests are rejected in development when ALLOW_DEMO_AUTH is disabled", async () => {
    process.env.APP_ENV = "development";
    process.env.ALLOW_DEMO_AUTH = "false";

    await expect(getTenantContext()).rejects.toThrow(AuthenticationRequiredError);
  });

  // --------------------------------------------------------------------------
  // 2. Organization A cannot read organization B's cases
  // --------------------------------------------------------------------------
  it("Boundary 2: Organization A cannot read organization B's cases", async () => {
    if (!prisma) return;

    // Create a seed case for Org B
    const caseB = await prisma.case.upsert({
      where: {
        organizationId_caseNumber: {
          organizationId: TENANT_B.organizationId,
          caseNumber: "2026-UR-SCHMIDT-999",
        },
      },
      update: {},
      create: {
        organization: {
          connectOrCreate: {
            where: { slug: TENANT_B.organizationSlug },
            create: {
              id: TENANT_B.organizationId,
              name: TENANT_B.organizationName,
              slug: TENANT_B.organizationSlug,
              jurisdiction: TENANT_B.jurisdiction,
            },
          },
        },
        caseNumber: "2026-UR-SCHMIDT-999",
        title: "Kaufvertrag Nürnberg Ost (Streng Vertraulich Org B)",
        matterType: "REAL_ESTATE",
        status: "DRAFT",
      },
    });

    // Tenant A attempts to read Org B's case by ID
    await expect(getCaseById(TENANT_A, caseB.id)).rejects.toThrow(TenantIsolationError);
    await expect(getCaseById(TENANT_A, caseB.id)).rejects.toThrow(/Tenant Isolation Violation/);
  });

  // --------------------------------------------------------------------------
  // 3. Organization A cannot upload documents to organization B's cases
  // --------------------------------------------------------------------------
  it("Boundary 3: Organization A cannot upload documents to organization B's cases", async () => {
    if (!prisma) return;

    const caseB = await prisma.case.findFirst({
      where: { organizationId: TENANT_B.organizationId },
    });

    if (!caseB) return;

    const dummyBuffer = Buffer.from("Synthetischer Kaufvertrag Org A Attacke");

    // Tenant A attempts to ingest a document pointing to Case B
    await expect(
      ingestDocument(TENANT_A, {
        caseId: caseB.id,
        fileName: "angriff_kaufvertrag.txt",
        mimeType: "text/plain",
        buffer: dummyBuffer,
      })
    ).rejects.toThrow(TenantIsolationError);
  });

  // --------------------------------------------------------------------------
  // 4. Organization A cannot approve organization B's extraction results
  // --------------------------------------------------------------------------
  it("Boundary 4: Organization A cannot approve organization B's extraction results", async () => {
    if (!prisma) return;

    // Find or create a document belonging to Org B
    let docB = await prisma.document.findFirst({
      where: { organizationId: TENANT_B.organizationId },
    });

    if (!docB) {
      const caseB = await prisma.case.findFirst({
        where: { organizationId: TENANT_B.organizationId },
      });
      if (!caseB) return;

      docB = await prisma.document.create({
        data: {
          organizationId: TENANT_B.organizationId,
          caseId: caseB.id,
          fileName: "muster_org_b.txt",
          fileSize: 100,
          mimeType: "text/plain",
          storagePath: "/tmp/fake_org_b.txt",
          workflowStatus: "NEEDS_REVIEW",
          extractionResult: {
            create: {
              organizationId: TENANT_B.organizationId,
              status: "COMPLETED",
              workflowStatus: "NEEDS_REVIEW",
              extractedData: {
                documentType: "Kaufvertrag",
                confidence: 0.9,
                parties: [],
                missingFields: [],
                discrepancies: [],
                isSyntheticSample: true,
                disclaimer: "Test",
              },
            },
          },
        },
      });
    }

    // Tenant A attempts to approve Org B's extraction
    await expect(
      approveExtraction(TENANT_A, docB.id, "Böswillige Freigabe durch Tenant A")
    ).rejects.toThrow(TenantIsolationError);
  });

  // --------------------------------------------------------------------------
  // 5. Organization A cannot generate or download organization B's drafts
  // --------------------------------------------------------------------------
  it("Boundary 5: Organization A cannot generate or download organization B's drafts", async () => {
    if (!prisma) return;

    const caseB = await prisma.case.findFirst({
      where: { organizationId: TENANT_B.organizationId },
    });
    if (!caseB) return;

    // Create a draft for Org B
    const draftB = await prisma.generatedDraft.create({
      data: {
        organizationId: TENANT_B.organizationId,
        caseId: caseB.id,
        title: "Vorbereitungsvermerk Org B",
        content: "Vertraulicher Notariatsentwurf Org B",
        templateVersion: "1.0.0",
        version: 1,
      },
    });

    // 1. Tenant A attempts to generate draft from Org B document
    const docB = await prisma.document.findFirst({
      where: { organizationId: TENANT_B.organizationId },
    });
    if (docB) {
      await expect(generateDraft(TENANT_A, docB.id)).rejects.toThrow(TenantIsolationError);
    }

    // 2. Tenant A attempts to read/download Org B draft
    await expect(getDraftById(TENANT_A, draftB.id)).rejects.toThrow(TenantIsolationError);
  });

  // --------------------------------------------------------------------------
  // 6. Invalid or expired sessions are rejected
  // --------------------------------------------------------------------------
  it("Boundary 6: Invalid, tampered, or expired sessions are strictly rejected", () => {
    // 6a: Expired session token
    const expiredToken = createSessionToken(
      {
        userId: "usr_expired_01",
        email: "expired@notariat.de",
        fullName: "Abgelaufener Notar",
      },
      -1000 // Expired 1 second ago
    );

    const verifiedExpired = verifySessionToken(expiredToken);
    expect(verifiedExpired).toBeNull();

    // 6b: Tampered session token (modified payload)
    const validToken = createSessionToken({
      userId: "usr_valid_01",
      email: "valid@notariat.de",
      fullName: "Gültiger Notar",
    });

    const [payloadBase64, signature] = validToken.split(".");
    // Decode, modify userId, re-encode without signature recalculation
    const decoded = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf-8"));
    decoded.userId = "usr_hacked_admin";
    const forgedPayloadBase64 = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    const tamperedToken = `${forgedPayloadBase64}.${signature}`;

    const verifiedTampered = verifySessionToken(tamperedToken);
    expect(verifiedTampered).toBeNull();

    // 6c: Malformed garbage token
    expect(verifySessionToken("garbage.token.here")).toBeNull();
    expect(verifySessionToken("")).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 7. A user removed from an organization loses access
  // --------------------------------------------------------------------------
  it("Boundary 7: A user removed from an organization loses access to that organization", async () => {
    if (!prisma) return;

    // Create a temporary user with no organization memberships
    const userRemoved = await prisma.user.upsert({
      where: { email: "removed.clerk@notariat-test.de" },
      update: {},
      create: {
        id: "usr_removed_clerk_test",
        email: "removed.clerk@notariat-test.de",
        fullName: "Ehemalige Notarangestellte (Ausgeschieden)",
      },
    });

    // Ensure user has 0 memberships
    await prisma.organizationMember.deleteMany({
      where: { userId: userRemoved.id },
    });

    // Attempt to resolve tenant context for this user
    await expect(
      resolveTenantContextFromUser({
        userId: userRemoved.id,
        email: userRemoved.email,
        fullName: userRemoved.fullName,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 10000,
      })
    ).rejects.toThrow(NoOrganizationMembershipError);
  });

  // --------------------------------------------------------------------------
  // 8. Nested resources cannot be accessed through guessed IDs
  // --------------------------------------------------------------------------
  it("Boundary 8: Nested resources cannot be accessed through guessed IDs across tenants", async () => {
    if (!prisma) return;

    const docB = await prisma.document.findFirst({
      where: { organizationId: TENANT_B.organizationId },
    });

    if (docB) {
      // Attacker from Tenant A guesses docB.id
      await expect(getDocumentById(TENANT_A, docB.id)).rejects.toThrow(TenantIsolationError);
      await expect(getDocumentById(TENANT_A, docB.id)).rejects.toThrow(/Tenant Isolation Violation/);
    }

    const draftB = await prisma.generatedDraft.findFirst({
      where: { organizationId: TENANT_B.organizationId },
    });

    if (draftB) {
      // Attacker from Tenant A guesses draftB.id
      await expect(getDraftById(TENANT_A, draftB.id)).rejects.toThrow(TenantIsolationError);
    }

    if (docB) {
      // Attacker from Tenant A attempts to delete docB.id
      await expect(deleteDocument(TENANT_A, docB.id)).rejects.toThrow(TenantIsolationError);
      await expect(deleteDocument(TENANT_A, docB.id)).rejects.toThrow(/Tenant Isolation Violation/);
    }
  });
});
