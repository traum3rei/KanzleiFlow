import JSZip from "jszip";
import { describe, it, expect, beforeEach } from "vitest";

import { getPrismaClient } from "@/lib/db";
import { TenantContext } from "@/lib/auth/tenant";
import { createCase } from "@/lib/services/case-service";
import {
  ensureDefaultTemplateAndVersion,
  createConfiguration,
  getConfigurationById,
  saveConfiguration,
  generateConfiguredDraft,
  getGeneratedVersionDocx,
  ConfigurationValidationError,
} from "./configurator-service";
import { getDefaultConfigurationData } from "./rules-engine";

const TENANT_A: TenantContext = {
  organizationId: "org_configurator_test_a",
  organizationSlug: "notariat-config-a",
  organizationName: "Notariat A (München)",
  jurisdiction: "DE-BY",
  userId: "usr_config_a",
  userEmail: "notar-a@config-test.de",
  userName: "Dr. Notar A",
  userRole: "NOTARY",
};

const TENANT_B: TenantContext = {
  organizationId: "org_configurator_test_b",
  organizationSlug: "notariat-config-b",
  organizationName: "Notariat B (Nürnberg)",
  jurisdiction: "DE-BY",
  userId: "usr_config_b",
  userEmail: "notar-b@config-test.de",
  userName: "Dr. Notar B",
  userRole: "NOTARY",
};

describe("Structured Document Configurator — Service & Integration Suite", () => {
  const prisma = getPrismaClient();

  beforeEach(async () => {
    if (!prisma) return;
    // Ensure organizations exist in DB
    await prisma.organization.upsert({
      where: { id: TENANT_A.organizationId },
      update: {},
      create: {
        id: TENANT_A.organizationId,
        slug: TENANT_A.organizationSlug,
        name: TENANT_A.organizationName,
        jurisdiction: TENANT_A.jurisdiction,
      },
    });

    await prisma.organization.upsert({
      where: { id: TENANT_B.organizationId },
      update: {},
      create: {
        id: TENANT_B.organizationId,
        slug: TENANT_B.organizationSlug,
        name: TENANT_B.organizationName,
        jurisdiction: TENANT_B.jurisdiction,
      },
    });
  });

  it("ensures default template and clauses v1.0.0 are seeded idempotently", async () => {
    const { template, version } = await ensureDefaultTemplateAndVersion(TENANT_A);
    expect(template).toBeDefined();
    expect(template.slug).toBe("immobilienkaufvertrag");
    expect(version).toBeDefined();
    expect(version.version).toBe("1.0.0");

    // Calling again does not duplicate
    const reseeded = await ensureDefaultTemplateAndVersion(TENANT_A);
    expect(reseeded.template.id).toBe(template.id);
    expect(reseeded.version.id).toBe(version.id);
  });

  it("creates a document configuration linked to a case with tenant isolation", async () => {
    const testCase = await createCase(TENANT_A, {
      caseNumber: `2026-UR-${Date.now().toString().slice(-4)}`,
      title: "Kaufvertrag Schwabing Villa",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [
        { role: "Verkäufer", name: "Dr. Barbara Lindner", address: "Königinstr. 12, München" },
        { role: "Käufer", name: "Maximilian Huber", address: "Leopoldstr. 45, München" },
      ],
    });

    const config = await createConfiguration(TENANT_A, testCase.id);
    expect(config).toBeDefined();
    expect(config.organizationId).toBe(TENANT_A.organizationId);
    expect(config.caseId).toBe(testCase.id);
    expect(config.status).toBe("DRAFT");
    expect(config.step).toBe(1);

    // Retrieve by ID
    const retrieved = await getConfigurationById(TENANT_A, config.id);
    expect(retrieved.id).toBe(config.id);
    expect(retrieved.templateVersion.clauseDefinitions.length).toBeGreaterThan(5);
  });

  it("enforces tenant isolation: Tenant B cannot read Tenant A's configuration", async () => {
    const testCase = await createCase(TENANT_A, {
      caseNumber: `2026-ISO-${Date.now().toString().slice(-4)}`,
      title: "Isolation Test Case",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    const config = await createConfiguration(TENANT_A, testCase.id);

    // Tenant B attempts to read Tenant A's config
    await expect(getConfigurationById(TENANT_B, config.id)).rejects.toThrow();
  });

  it("autosaves and updates step data with rule evaluation feedback", async () => {
    const testCase = await createCase(TENANT_A, {
      caseNumber: `2026-SAVE-${Date.now().toString().slice(-4)}`,
      title: "Save Test Case",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    const config = await createConfiguration(TENANT_A, testCase.id);

    // Save with invalid data (e.g. 0 amount)
    const invalidSave = await saveConfiguration(
      TENANT_A,
      config.id,
      {
        purchasePrice: {
          amount: 0,
          currency: "EUR",
          useEscrowAccount: false,
          financingRequired: false,
        },
      },
      3
    );

    expect(invalidSave.evaluation.canGenerateDraft).toBe(false);
    expect(invalidSave.updated.status).toBe("DRAFT");

    // Now save valid complete data
    const validData = getDefaultConfigurationData(testCase.caseNumber);
    const validSave = await saveConfiguration(TENANT_A, config.id, validData, 5);

    expect(validSave.evaluation.canGenerateDraft).toBe(true);
    expect(validSave.updated.status).toBe("READY");
  });

  it("generates deterministic draft DOCX and preserves immutable snapshot across subsequent edits", async () => {
    const testCase = await createCase(TENANT_A, {
      caseNumber: `2026-SNAP-${Date.now().toString().slice(-4)}`,
      title: "Snapshot Immutability Test",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    const validData = getDefaultConfigurationData(testCase.caseNumber);
    const config = await createConfiguration(TENANT_A, testCase.id, validData);

    // Ensure status is READY
    await saveConfiguration(TENANT_A, config.id, validData, 5);

    // Generate version 1
    const { generatedVersion, generatedDraft, docxBuffer } = await generateConfiguredDraft(
      TENANT_A,
      config.id
    );

    expect(generatedVersion).toBeDefined();
    expect(generatedVersion.version).toBe(1);
    expect(generatedVersion.templateVersionString).toBe("1.0.0");
    expect(generatedDraft).toBeDefined();
    expect(docxBuffer).toBeDefined();
    expect(docxBuffer.length).toBeGreaterThan(1000);

    // Download file buffer verification
    const fileResult = await getGeneratedVersionDocx(TENANT_A, generatedVersion.id);
    expect(fileResult.buffer).toBeDefined();
    expect(fileResult.fileName).toContain(".docx");

    // Now mutate the configuration afterwards (e.g. change price to 5.000.000 EUR)
    const modifiedData = {
      ...validData,
      purchasePrice: {
        ...validData.purchasePrice,
        amount: 5000000,
      },
    };
    await saveConfiguration(TENANT_A, config.id, modifiedData, 3);

    // Verify version 1 snapshot still contains original 1.850.000 EUR
    const snapshotVer1 = await prisma?.generatedDocumentVersion.findUnique({
      where: { id: generatedVersion.id },
    });
    interface SnapshotPayload {
      formData: {
        purchasePrice: {
          amount: number;
        };
      };
    }
    const snapData = snapshotVer1?.configurationSnapshot as unknown as SnapshotPayload;
    expect(snapData.formData.purchasePrice.amount).toBe(1850000); // IMMUTABLE!

    // Generate version 2
    const ver2 = await generateConfiguredDraft(TENANT_A, config.id);
    expect(ver2.generatedVersion.version).toBe(2);
    const snapVer2Data = ver2.generatedVersion.configurationSnapshot as unknown as SnapshotPayload;
    expect(snapVer2Data.formData.purchasePrice.amount).toBe(5000000);
  });

  it("rejects draft generation when required fields or clause dependencies are unsatisfied", async () => {
    const testCase = await createCase(TENANT_A, {
      caseNumber: `2026-ERR-${Date.now().toString().slice(-4)}`,
      title: "Error Validation Case",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    const invalidData = getDefaultConfigurationData(testCase.caseNumber);
    // Introduce an error: empty buyer name
    invalidData.parties[1].name = "";

    const config = await createConfiguration(TENANT_A, testCase.id, invalidData);

    await expect(generateConfiguredDraft(TENANT_A, config.id)).rejects.toThrow(
      ConfigurationValidationError
    );
  });

  it("rejects cross-tenant download of generated document versions", async () => {
    const testCase = await createCase(TENANT_A, {
      caseNumber: `2026-DL-${Date.now().toString().slice(-4)}`,
      title: "Download Cross-Tenant Case",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    const validData = getDefaultConfigurationData(testCase.caseNumber);
    const config = await createConfiguration(TENANT_A, testCase.id, validData);
    await saveConfiguration(TENANT_A, config.id, validData, 5);

    const { generatedVersion } = await generateConfiguredDraft(TENANT_A, config.id);

    // Tenant B attempts to download Tenant A's generated version
    await expect(getGeneratedVersionDocx(TENANT_B, generatedVersion.id)).rejects.toThrow();
  });
  it("does not create competing versions or overwrite files on simultaneous generation", async () => {
    const target = await createCase(TENANT_A, { caseNumber: `RACE-${Date.now()}`, title: "Concurrent configuration generation", matterType: "REAL_ESTATE", status: "DRAFT", parties: [] });
    const config = await createConfiguration(TENANT_A, target.id, getDefaultConfigurationData(target.caseNumber));
    const results = await Promise.allSettled([generateConfiguredDraft(TENANT_A, config.id), generateConfiguredDraft(TENANT_A, config.id)]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    expect(await prisma!.generatedDocumentVersion.count({ where: { configurationId: config.id, organizationId: TENANT_A.organizationId } })).toBe(1);
  });

  it("recovers a historical configured DOCX using its original case number", async () => {
    const target = await createCase(TENANT_A, { caseNumber: `HISTORY-${Date.now()}`, title: "Historical configuration", matterType: "REAL_ESTATE", status: "DRAFT", parties: [] });
    const config = await createConfiguration(TENANT_A, target.id, getDefaultConfigurationData(target.caseNumber));
    const { generatedVersion } = await generateConfiguredDraft(TENANT_A, config.id);
    const { unlink } = await import("node:fs/promises");
    const path = await import("node:path");
    await unlink(path.resolve(process.env.STORAGE_ROOT!, "drafts", generatedVersion.docxStoragePath!));
    await prisma!.case.update({ where: { id: target.id, organizationId: TENANT_A.organizationId }, data: { caseNumber: `LATER-${Date.now()}` } });
    const result = await getGeneratedVersionDocx(TENANT_A, generatedVersion.id);
    const zip = await JSZip.loadAsync(result.buffer);
    expect(await zip.file("word/document.xml")!.async("text")).toContain(target.caseNumber);
    expect(result.fileName).toContain(target.caseNumber);
  });

});
