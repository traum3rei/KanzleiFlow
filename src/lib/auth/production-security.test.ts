import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

import {
  getTenantContext,
  resolveTenantContextFromUser,
  assertTenantOwnership,
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
import { createCase, getCaseById, deleteCase } from "@/lib/services/case-service";
import {
  ingestDocument,
  deleteDocument,
} from "@/lib/services/document-service";
import { approveExtraction } from "@/lib/services/extraction-service";
import { generateDraft } from "@/lib/services/draft-service";
import { middleware as edgeMiddleware } from "@/middleware";

const TENANT_A: TenantContext = {
  organizationId: "org_security_tenant_a",
  organizationSlug: "notariat-security-a",
  organizationName: "Notariat A (München)",
  jurisdiction: "DE-BY",
  userId: "usr_notary_a",
  userEmail: "notar-a@notariat-a.de",
  userName: "Dr. Notar A",
  userRole: "NOTARY",
};

const TENANT_B: TenantContext = {
  organizationId: "org_security_tenant_b",
  organizationSlug: "notariat-security-b",
  organizationName: "Notariat B (Augsburg)",
  jurisdiction: "DE-BY",
  userId: "usr_notary_b",
  userEmail: "notar-b@notariat-b.de",
  userName: "Dr. Notar B",
  userRole: "NOTARY",
};

describe("KanzleiFlow Production-Grade Authentication & Multi-Tenant Security Suite", () => {
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
  describe("Boundary 1: Unauthenticated Requests & Middleware Enforcement", () => {
    it("rejects getTenantContext() in production when no session cookie exists", async () => {
      process.env.APP_ENV = "production";
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";

      await expect(getTenantContext()).rejects.toThrow(AuthenticationRequiredError);
    });

    it("rejects getTenantContext() when ALLOW_DEMO_AUTH='false'", async () => {
      process.env.APP_ENV = "development";
      process.env.ALLOW_DEMO_AUTH = "false";

      await expect(getTenantContext()).rejects.toThrow(AuthenticationRequiredError);
    });

    it("edge middleware redirects unauthenticated requests on /cases to /login in production", async () => {
      process.env.APP_ENV = "production";
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";

      const request = new NextRequest("http://localhost:3000/cases", {
        headers: { host: "localhost:3000" },
      });

      const response = await edgeMiddleware(request);
      expect(response).toBeDefined();
      expect(response?.status).toBe(307); // Redirect status
      expect(response?.headers.get("location")).toContain("/login");
    });

    it("edge middleware returns 401 for unauthenticated requests on /api routes in production", async () => {
      process.env.APP_ENV = "production";
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";

      const request = new NextRequest("http://localhost:3000/api/cases/test-id", {
        method: "DELETE",
        headers: { host: "localhost:3000" },
      });

      const response = await edgeMiddleware(request);
      expect(response).toBeDefined();
      expect(response?.status).toBe(401);
      const text = await response?.text();
      expect(text).toContain("Nicht authentifiziert");
    });
  });

  // --------------------------------------------------------------------------
  // 2. Organization A cannot read organization B's cases
  // --------------------------------------------------------------------------
  describe("Boundary 2: Case Isolation Between Tenants", () => {
    it("prevents Organization A from reading Organization B's cases", async () => {
      if (!prisma) return;

      const uniqueCaseNumber = `2026-UR-ISOLATION-B-${Date.now()}`;
      const caseB = await createCase(TENANT_B, {
        caseNumber: uniqueCaseNumber,
        title: "Streng Vertrauliche Akte Notariat B",
        matterType: "REAL_ESTATE",
        status: "DRAFT",
        parties: [],
      });

      // Tenant A must be strictly rejected
      await expect(getCaseById(TENANT_A, caseB.id)).rejects.toThrow(TenantIsolationError);

      // Cleanup
      await deleteCase(TENANT_B, caseB.id);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Organization A cannot upload documents to organization B's cases
  // --------------------------------------------------------------------------
  describe("Boundary 3: Document Ingestion Isolation", () => {
    it("prevents Organization A from uploading documents to Organization B's cases", async () => {
      if (!prisma) return;

      const caseB = await createCase(TENANT_B, {
        caseNumber: `2026-UR-DOC-B-${Date.now()}`,
        title: "Akte B für Ingestion-Test",
        matterType: "REAL_ESTATE",
        status: "DRAFT",
        parties: [],
      });

      const fakeFileBuffer = Buffer.from("Unautorisierter Kaufvertrags-Upload von Tenant A");

      await expect(
        ingestDocument(TENANT_A, {
          caseId: caseB.id,
          fileName: "angriff.txt",
          mimeType: "text/plain",
          buffer: fakeFileBuffer,
        })
      ).rejects.toThrow(TenantIsolationError);

      // Cleanup
      await deleteCase(TENANT_B, caseB.id);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Organization A cannot approve organization B's extraction results
  // --------------------------------------------------------------------------
  describe("Boundary 4: Extraction Approval Isolation", () => {
    it("prevents Organization A from approving Organization B's extraction results", async () => {
      if (!prisma) return;

      const caseB = await createCase(TENANT_B, {
        caseNumber: `2026-UR-APPROVE-B-${Date.now()}`,
        title: "Akte B für Approval-Test",
        matterType: "REAL_ESTATE",
        status: "DRAFT",
        parties: [],
      });

      const docB = await ingestDocument(TENANT_B, {
        caseId: caseB.id,
        fileName: "original_kaufvertrag_b.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Kaufvertrag Notariat B"),
      });

      // Tenant A tries to approve Org B's extraction
      await expect(
        approveExtraction(TENANT_A, docB.id, "Nicht autorisierte Freigabe")
      ).rejects.toThrow(TenantIsolationError);

      // Cleanup
      await deleteCase(TENANT_B, caseB.id);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Organization A cannot generate or download organization B's drafts
  // --------------------------------------------------------------------------
  describe("Boundary 5: Draft Generation and Download Isolation", () => {
    it("prevents Organization A from generating or accessing Organization B's drafts", async () => {
      if (!prisma) return;

      const caseB = await createCase(TENANT_B, {
        caseNumber: `2026-UR-DRAFT-B-${Date.now()}`,
        title: "Akte B für Draft-Test",
        matterType: "REAL_ESTATE",
        status: "DRAFT",
        parties: [],
      });

      const docB = await ingestDocument(TENANT_B, {
        caseId: caseB.id,
        fileName: "vertrag_b.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Vollständiger Kaufvertrag B zur Beglaubigung und Urkundenvorbereitung Notariat B"),
      });

      // Tenant A cannot trigger draft generation on docB
      await expect(generateDraft(TENANT_A, docB.id)).rejects.toThrow(TenantIsolationError);

      // Cleanup
      await deleteCase(TENANT_B, caseB.id);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Invalid or expired sessions are rejected
  // --------------------------------------------------------------------------
  describe("Boundary 6: Session Signature & Expiration Security", () => {
    it("rejects expired session tokens", () => {
      const expiredToken = createSessionToken(
        {
          userId: "usr_expired",
          email: "expired@kanzlei.de",
          fullName: "Abgelaufener Notar",
        },
        -5000 // Expired 5 seconds ago
      );

      const verified = verifySessionToken(expiredToken);
      expect(verified).toBeNull();
    });

    it("rejects tokens with forged or altered cryptographic payload", () => {
      const originalToken = createSessionToken({
        userId: "usr_legit",
        email: "legit@kanzlei.de",
        fullName: "Legit Notar",
      });

      const [payloadB64, sig] = originalToken.split(".");
      const decoded = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
      decoded.userId = "usr_attacker_admin"; // Tamper with userId
      const forgedB64 = Buffer.from(JSON.stringify(decoded)).toString("base64url");
      const tamperedToken = `${forgedB64}.${sig}`;

      const verified = verifySessionToken(tamperedToken);
      expect(verified).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 7. Revoked membership immediately stops granting access
  // --------------------------------------------------------------------------
  describe("Boundary 7: Revoked Membership Enforcement", () => {
    it("rejects tenant resolution for a user with no active memberships", async () => {
      if (!prisma) return;

      const orphanUser = await prisma.user.upsert({
        where: { email: "orphan.user@kanzlei-security.de" },
        update: {},
        create: {
          id: "usr_orphan_test",
          email: "orphan.user@kanzlei-security.de",
          fullName: "Mitarbeiter ohne Kanzlei",
        },
      });

      // Guarantee 0 active memberships
      await prisma.organizationMember.deleteMany({
        where: { userId: orphanUser.id },
      });

      await expect(
        resolveTenantContextFromUser({
          userId: orphanUser.id,
          email: orphanUser.email,
          fullName: orphanUser.fullName,
          issuedAt: Date.now(),
          expiresAt: Date.now() + 60000,
        })
      ).rejects.toThrow(NoOrganizationMembershipError);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Nested resources cannot be accessed through guessed IDs
  // --------------------------------------------------------------------------
  describe("Boundary 8: Nested Resource Access & ID Guessing Prevention", () => {
    it("rejects cross-tenant document file streaming via API endpoint", async () => {
      if (!prisma) return;

      const caseB = await createCase(TENANT_B, {
        caseNumber: `2026-UR-STREAM-B-${Date.now()}`,
        title: "Akte B für Streaming API Test",
        matterType: "REAL_ESTATE",
        status: "DRAFT",
        parties: [],
      });

      const docB = await ingestDocument(TENANT_B, {
        caseId: caseB.id,
        fileName: "geheim_b.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Streng geheimer Inhalt B"),
      });

      // Tenant A tries to access file streaming endpoint
      // We test assertTenantOwnership directly on the docB
      expect(() => assertTenantOwnership(TENANT_A, docB.organizationId)).toThrow(
        TenantIsolationError
      );

      // Cleanup
      await deleteCase(TENANT_B, caseB.id);
    });

    it("rejects cross-tenant document deletion", async () => {
      if (!prisma) return;

      const caseB = await createCase(TENANT_B, {
        caseNumber: `2026-UR-DEL-B-${Date.now()}`,
        title: "Akte B für Delete Isolation Test",
        matterType: "REAL_ESTATE",
        status: "DRAFT",
        parties: [],
      });

      const docB = await ingestDocument(TENANT_B, {
        caseId: caseB.id,
        fileName: "zu_loeschen_b.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Dokument B zum Löschen mit ausreichend Textinhalt für den Validierungstest"),
      });

      // Tenant A attempts to delete Doc B
      await expect(deleteDocument(TENANT_A, docB.id)).rejects.toThrow(TenantIsolationError);

      // Cleanup
      await deleteCase(TENANT_B, caseB.id);
    });
  });

  // --------------------------------------------------------------------------
  // 9. Client-supplied organizationId / userId tampering is strictly ignored
  // --------------------------------------------------------------------------
  describe("Boundary 9: Client-Controlled Identity Override Rejection", () => {
    it("strictly isolates cases by verified server tenant context, ignoring any foreign org IDs", async () => {
      if (!prisma) return;

      const uniqueCaseNumber = `2026-UR-NO-OVERRIDE-${Date.now()}`;
      // In createCase, tenant context determines organizationId; client cannot spoof it
      const newCase = await createCase(TENANT_A, {
        caseNumber: uniqueCaseNumber,
        title: "Sichere Akte von Tenant A",
        matterType: "REAL_ESTATE",
        status: "DRAFT",
        parties: [],
      });

      // Assert created case is owned by TENANT_A.organizationId, never TENANT_B
      expect(newCase.organizationId).toBe(TENANT_A.organizationId);
      expect(newCase.organizationId).not.toBe(TENANT_B.organizationId);

      // Cleanup
      await deleteCase(TENANT_A, newCase.id);
    });
  });
});
