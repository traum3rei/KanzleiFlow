/**
 * Structured Document Configurator Service
 * Manages templates, clause catalogs, multi-step configurations,
 * deterministic drafting, versioning, and immutable snapshots.
 */

import { getPrismaClient } from "@/lib/db";
import { TenantContext, assertTenantOwnership } from "@/lib/auth/tenant";
import {
  DocumentConfigurationData,
  RulesEvaluationResult,
  ConfiguredParty,
} from "./types";
import {
  REAL_ESTATE_CLAUSES,
  REAL_ESTATE_TEMPLATE_SLUG,
  REAL_ESTATE_TEMPLATE_NAME,
  REAL_ESTATE_TEMPLATE_VERSION,
} from "./clauses";
import { evaluateConfiguration, getDefaultConfigurationData } from "./rules-engine";
import { generateConfiguredDocx } from "./docx-generator";
import { saveDraftDocx, getDraftDocx } from "@/lib/storage";

export class ConfigurationNotFoundError extends Error {
  constructor(configId: string) {
    super(`Dokument-Konfiguration mit ID '${configId}' nicht gefunden.`);
    this.name = "ConfigurationNotFoundError";
  }
}

export class ConfigurationValidationError extends Error {
  constructor(message: string, public issues: string[]) {
    super(message);
    this.name = "ConfigurationValidationError";
  }
}

export class ConfigurationConcurrencyError extends Error {
  constructor(message: string, public currentVersion: number) {
    super(message);
    this.name = "ConfigurationConcurrencyError";
  }
}

/**
 * Ensures the tenant has the default Immobilienkaufvertrag template and v1.0.0 clauses registered.
 */
export async function ensureDefaultTemplateAndVersion(tenant: TenantContext) {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Datenbankverbindung nicht verfügbar.");

  // 1. Template
  let template = await prisma.documentTemplate.findFirst({
    where: {
      organizationId: tenant.organizationId,
      slug: REAL_ESTATE_TEMPLATE_SLUG,
    },
  });

  if (!template) {
    template = await prisma.documentTemplate.create({
      data: {
        organizationId: tenant.organizationId,
        slug: REAL_ESTATE_TEMPLATE_SLUG,
        name: REAL_ESTATE_TEMPLATE_NAME,
        description: "Standardisierter notarieller Kaufvertragsentwurf für Grundstücke und Bestandsimmobilien.",
        matterType: "REAL_ESTATE",
        version: REAL_ESTATE_TEMPLATE_VERSION,
        isActive: true,
      },
    });
  }

  // 2. TemplateVersion
  let version = await prisma.templateVersion.findUnique({
    where: {
      templateId_version: {
        templateId: template.id,
        version: REAL_ESTATE_TEMPLATE_VERSION,
      },
    },
  });

  if (!version) {
    version = await prisma.templateVersion.create({
      data: {
        templateId: template.id,
        version: REAL_ESTATE_TEMPLATE_VERSION,
        title: `${REAL_ESTATE_TEMPLATE_NAME} v${REAL_ESTATE_TEMPLATE_VERSION}`,
        description: "Version 1.0.0 — Modulare Vertragsgestaltung mit Pflicht- und Wahlklauseln.",
        isActive: true,
      },
    });
  }

  // 3. ClauseDefinitions
  const existingClauses = await prisma.clauseDefinition.findMany({
    where: { templateVersionId: version.id },
  });

  const existingCodes = new Set(existingClauses.map((c) => c.code));

  for (const c of REAL_ESTATE_CLAUSES) {
    if (!existingCodes.has(c.code)) {
      await prisma.clauseDefinition.create({
        data: {
          templateVersionId: version.id,
          code: c.code,
          title: c.title,
          category: c.category,
          description: c.description,
          isDefault: c.isDefault,
          sortOrder: c.sortOrder,
          requiredFields: c.requiredFields || [],
          dependencies: c.dependencies || [],
          incompatibilities: c.incompatibilities || [],
          bodyTemplate: c.bodyTemplate,
        },
      });
    }
  }

  return { template, version };
}

/**
 * Creates a new document configuration for a case.
 */
export async function createConfiguration(
  tenant: TenantContext,
  caseId: string,
  initialData?: Partial<DocumentConfigurationData>
) {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Datenbankverbindung nicht verfügbar.");

  // Check Case ownership
  const targetCase = await prisma.case.findUnique({
    where: { id: caseId },
  });
  if (!targetCase) {
    throw new Error(`Akte mit ID '${caseId}' nicht gefunden.`);
  }
  assertTenantOwnership(tenant, targetCase.organizationId);

  // Ensure template and clauses exist
  const { template, version } = await ensureDefaultTemplateAndVersion(tenant);

  const baseData = getDefaultConfigurationData(targetCase.caseNumber);
  const formData: DocumentConfigurationData = {
    ...baseData,
    ...initialData,
    caseNumber: targetCase.caseNumber,
    notaryOfficeName: tenant.organizationName,
  };

  const selectedClauseCodes = formData.selectedClauseCodes || baseData.selectedClauseCodes;

  const config = await prisma.documentConfiguration.create({
    data: {
      organizationId: tenant.organizationId,
      caseId,
      templateId: template.id,
      templateVersionId: version.id,
      title: formData.title || `Kaufvertrag — ${targetCase.caseNumber}`,
      status: "DRAFT",
      step: 1,
      formData: formData as unknown as object,
      selectedClauseCodes: selectedClauseCodes as unknown as object,
      createdById: tenant.userId,
    },
  });

  // Create SelectedClause records
  const clauseDefs = await prisma.clauseDefinition.findMany({
    where: { templateVersionId: version.id },
  });
  const clauseMap = new Map(clauseDefs.map((c) => [c.code, c]));

  for (const code of selectedClauseCodes) {
    const def = clauseMap.get(code);
    if (def) {
      await prisma.selectedClause.create({
        data: {
          configurationId: config.id,
          clauseDefinitionId: def.id,
          clauseCode: code,
          sortOrder: def.sortOrder,
        },
      });
    }
  }

  // Audit event
  try {
    await prisma.auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        action: "DOCUMENT_CONFIGURATION_CREATED",
        entityType: "DocumentConfiguration",
        entityId: config.id,
        metadata: {
          caseId,
          caseNumber: targetCase.caseNumber,
          templateVersion: REAL_ESTATE_TEMPLATE_VERSION,
        },
      },
    });
  } catch (err) {
    console.warn("Audit logging failed:", err);
  }

  return config;
}

/**
 * Prefills a new configuration from previously extracted and approved case data.
 */
export async function prefillConfigurationFromApprovedCase(
  tenant: TenantContext,
  caseId: string,
  documentId?: string
) {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Datenbankverbindung nicht verfügbar.");

  const targetCase = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      documents: {
        include: { extractionResult: true },
      },
    },
  });

  if (!targetCase) {
    throw new Error(`Akte '${caseId}' nicht gefunden.`);
  }
  assertTenantOwnership(tenant, targetCase.organizationId);

  let approvedData: Record<string, unknown> | null = null;
  let sourceDocId: string | null = null;

  if (documentId) {
    const doc = targetCase.documents.find((d) => d.id === documentId);
    if (!doc) {
      throw new Error(`Dokument '${documentId}' gehört nicht zu dieser Akte.`);
    }
    const isApproved = doc.workflowStatus === "APPROVED" || doc.workflowStatus === "DRAFT_READY";
    if (!isApproved) {
      throw new Error(
        `Dokument '${doc.fileName}' befindet sich im Status '${doc.workflowStatus}'. Datenübernahme ist nur nach expliziter Freigabe ('APPROVED') zulässig.`
      );
    }
    approvedData = doc.extractionResult?.approvedData as Record<string, unknown> | null;
    sourceDocId = doc.id;
  } else {
    // Look for first approved document in case
    const approvedDoc = targetCase.documents.find(
      (d) => (d.workflowStatus === "APPROVED" || d.workflowStatus === "DRAFT_READY") && d.extractionResult?.approvedData
    );
    if (approvedDoc) {
      approvedData = approvedDoc.extractionResult?.approvedData as Record<string, unknown> | null;
      sourceDocId = approvedDoc.id;
    }
  }

  const baseConfig = getDefaultConfigurationData(targetCase.caseNumber);

  if (approvedData) {
    // Map approved parties
    if (Array.isArray(approvedData.parties) && approvedData.parties.length > 0) {
      baseConfig.parties = approvedData.parties.map((p, idx): ConfiguredParty => {
        const pRec = p as Record<string, unknown>;
        const rawRole = String(pRec.role || "");
        let role: ConfiguredParty["role"] = "Beteiligter";
        if (rawRole.toLowerCase().includes("verkäuf")) role = "Verkäufer";
        else if (rawRole.toLowerCase().includes("käuf")) role = "Käufer";

        return {
          id: `p_imported_${idx + 1}`,
          role,
          name: String(pRec.name || ""),
          address: String(pRec.address || ""),
          birthDate: pRec.birthDate ? String(pRec.birthDate) : null,
          taxId: pRec.taxId ? String(pRec.taxId) : null,
          actingForSelf: true,
        };
      });
    }

    // Map approved property details
    if (approvedData.propertyDetails && typeof approvedData.propertyDetails === "object") {
      const prop = approvedData.propertyDetails as Record<string, unknown>;
      if (prop.landRegistryDistrict) baseConfig.property.landRegistryDistrict = String(prop.landRegistryDistrict);
      if (prop.sheetNumber) baseConfig.property.sheetNumber = String(prop.sheetNumber);
      if (prop.parcelNumber) baseConfig.property.parcelNumber = String(prop.parcelNumber);
      if (prop.economicUse) baseConfig.property.economicUse = String(prop.economicUse);
      if (prop.areaSqm && typeof prop.areaSqm === "number") baseConfig.property.plotAreaSqm = prop.areaSqm;
    }

    // Map approved financials
    if (approvedData.financials && typeof approvedData.financials === "object") {
      const fin = approvedData.financials as Record<string, unknown>;
      if (fin.purchasePrice && typeof fin.purchasePrice === "number") {
        baseConfig.purchasePrice.amount = fin.purchasePrice;
      }
      if (fin.dealValue && typeof fin.dealValue === "number") {
        baseConfig.purchasePrice.amount = fin.dealValue;
      }
      if (fin.currency) baseConfig.purchasePrice.currency = String(fin.currency);
      if (fin.paymentDueDate) baseConfig.purchasePrice.paymentDueDate = String(fin.paymentDueDate);
      if (Array.isArray(fin.existingEncumbrances)) {
        baseConfig.property.existingEncumbrancesAbt2 = fin.existingEncumbrances.map(String);
      }
    }
  }

  // Create configuration
  const config = await createConfiguration(tenant, caseId, baseConfig);

  if (sourceDocId) {
    await prisma.documentConfiguration.update({
      where: { id: config.id },
      data: {
        isPrefilledFromExtraction: true,
        prefilledDocumentId: sourceDocId,
      },
    });
  }

  return config;
}

/**
 * Retrieves a configuration with its template, case, and generated versions.
 */
export async function getConfigurationById(tenant: TenantContext, configId: string) {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Datenbankverbindung nicht verfügbar.");

  const config = await prisma.documentConfiguration.findUnique({
    where: { id: configId },
    include: {
      case: true,
      template: true,
      templateVersion: {
        include: {
          clauseDefinitions: {
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      selectedClauses: {
        orderBy: { sortOrder: "asc" },
      },
      generatedVersions: {
        orderBy: { version: "desc" },
      },
    },
  });

  if (!config) {
    throw new ConfigurationNotFoundError(configId);
  }

  assertTenantOwnership(tenant, config.organizationId);

  return config;
}

/**
 * Lists all document configurations for a case.
 */
export async function listConfigurationsForCase(tenant: TenantContext, caseId: string) {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Datenbankverbindung nicht verfügbar.");

  const targetCase = await prisma.case.findUnique({
    where: { id: caseId },
  });
  if (!targetCase) throw new Error(`Akte '${caseId}' nicht gefunden.`);
  assertTenantOwnership(tenant, targetCase.organizationId);

  return await prisma.documentConfiguration.findMany({
    where: {
      organizationId: tenant.organizationId,
      caseId,
    },
    include: {
      generatedVersions: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Autosaves or updates an existing configuration and validates rules with optimistic concurrency control.
 */
export async function saveConfiguration(
  tenant: TenantContext,
  configId: string,
  updatedData: Partial<DocumentConfigurationData>,
  currentStep?: number,
  expectedVersion?: number
) {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Datenbankverbindung nicht verfügbar.");

  const existing = await prisma.documentConfiguration.findUnique({
    where: { id: configId },
    include: { templateVersion: true },
  });
  if (!existing) throw new ConfigurationNotFoundError(configId);
  assertTenantOwnership(tenant, existing.organizationId);

  // Optimistic Concurrency Control (OCC) check
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    throw new ConfigurationConcurrencyError(
      `Konflikt: Die Konfiguration wurde zwischenzeitlich auf Version ${existing.version} aktualisiert (gesendet: ${expectedVersion}).`,
      existing.version
    );
  }

  const currentFormData = existing.formData as unknown as DocumentConfigurationData;
  const mergedFormData: DocumentConfigurationData = {
    ...currentFormData,
    ...updatedData,
    parties: updatedData.parties || currentFormData.parties,
    property: { ...currentFormData.property, ...(updatedData.property || {}) },
    purchasePrice: { ...currentFormData.purchasePrice, ...(updatedData.purchasePrice || {}) },
    terms: { ...currentFormData.terms, ...(updatedData.terms || {}) },
    selectedClauseCodes: updatedData.selectedClauseCodes || currentFormData.selectedClauseCodes,
    customClauseOverrides: {
      ...(currentFormData.customClauseOverrides || {}),
      ...(updatedData.customClauseOverrides || {}),
    },
  };

  const selectedClauseCodes = mergedFormData.selectedClauseCodes || [];

  // Run Rules Engine
  const evaluation: RulesEvaluationResult = evaluateConfiguration(mergedFormData, selectedClauseCodes);

  const status = evaluation.canGenerateDraft ? "READY" : "DRAFT";
  const step = currentStep !== undefined ? currentStep : existing.step;

  // Clause definitions lookup
  const clauseDefs = await prisma.clauseDefinition.findMany({
    where: { templateVersionId: existing.templateVersionId },
  });
  const clauseMap = new Map(clauseDefs.map((c) => [c.code, c]));

  // Atomic database transaction: Update configuration + increment version + sync SelectedClause records
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.documentConfiguration.updateMany({
      where: { id: configId, organizationId: tenant.organizationId, version: existing.version },
      data: {
        title: mergedFormData.title || existing.title,
        formData: mergedFormData as unknown as object,
        selectedClauseCodes: selectedClauseCodes as unknown as object,
        status,
        step,
        version: { increment: 1 },
      },
    });

    if (result.count !== 1) {
      throw new ConfigurationConcurrencyError(
        "Die Konfiguration wurde in einem anderen Fenster geändert. Bitte sichern Sie Ihre Eingaben und laden Sie die Seite neu.",
        existing.version
      );
    }
    const updatedConfig = await tx.documentConfiguration.findUniqueOrThrow({
      where: { id: configId, organizationId: tenant.organizationId },
    });

    await tx.selectedClause.deleteMany({
      where: { configurationId: configId },
    });

    for (const code of selectedClauseCodes) {
      const def = clauseMap.get(code);
      if (def) {
        await tx.selectedClause.create({
          data: {
            configurationId: configId,
            clauseDefinitionId: def.id,
            clauseCode: code,
            customText: mergedFormData.customClauseOverrides?.[code] || null,
            sortOrder: def.sortOrder,
          },
        });
      }
    }

    return updatedConfig;
  });

  return { updated, evaluation };
}

/**
 * Generates deterministic preview text from configured clauses.
 */
export function generatePreviewText(data: DocumentConfigurationData): string {
  const selectedSet = new Set(data.selectedClauseCodes);
  const activeClauses = REAL_ESTATE_CLAUSES.filter((c) => selectedSet.has(c.code)).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  const lines: string[] = [];
  lines.push("================================================================================");
  lines.push(`IMMOBILIENKAUFVERTRAG (ENTWURF) — ${data.caseNumber || "2026-UR-0142"}`);
  lines.push("HINWEIS: TECHNISCHE DEMO. NICHT VON JURISTISCHEN FACHPERSONEN GEPRÜFT. NICHT FÜR ECHTE RECHTSGESCHÄFTE.");
  lines.push("================================================================================\n");

  lines.push("Abschnitt 1 BETEILIGTE DER URKUNDE:");
  data.parties.forEach((p, idx) => {
    lines.push(`  [${p.role}] #${idx + 1}: ${p.name}`);
    lines.push(`  Wohnanschrift: ${p.address}${p.city ? `, ${p.city}` : ""}`);
    if (p.birthDate) lines.push(`  Geburtsdatum: ${p.birthDate}`);
    if (p.taxId) lines.push(`  Steuer-ID: ${p.taxId}`);
    if (p.representativeName) lines.push(`  Vertreten durch: ${p.representativeName}`);
    lines.push("");
  });

  lines.push("Abschnitt 2 KAUFGEGENSTAND:");
  lines.push(`  Grundbuchbezirk: ${data.property.landRegistryDistrict || "— [fehlt] —"}`);
  lines.push(`  Grundbuchblatt: ${data.property.sheetNumber || "— [fehlt] —"}`);
  lines.push(`  Flurstück: ${data.property.parcelNumber || "— [fehlt] —"}`);
  lines.push(`  Lage: ${data.property.streetAddress || "— [fehlt] —"}`);
  if (data.property.plotAreaSqm) lines.push(`  Fläche: ${data.property.plotAreaSqm} m²`);
  lines.push("");

  lines.push("Abschnitt 3 KAUFPREIS:");
  lines.push(`  Betrag: ${data.purchasePrice.amount ? data.purchasePrice.amount.toLocaleString("de-DE") + " " + data.purchasePrice.currency : "— [fehlt] —"}`);
  lines.push(`  Fälligkeit: ${data.purchasePrice.paymentDueDate || "Nach Vormerkung und Lastenfreistellung"}`);
  lines.push(`  Abwicklung: ${data.purchasePrice.useEscrowAccount ? "Notaranderkonto" : "Direktzahlung"}`);
  lines.push("\n--------------------------------------------------------------------------------");
  lines.push("VEREINBARTE VERTRAGSBESTIMMUNGEN (KLAUSELN):");
  lines.push("--------------------------------------------------------------------------------\n");

  activeClauses.forEach((c) => {
    const custom = data.customClauseOverrides?.[c.code];
    lines.push(`${c.title}`);
    lines.push(custom || c.bodyTemplate);
    lines.push("");
  });

  return lines.join("\n");
}

/**
 * Validates, compiles, and persists an immutable generated document version.
 * Creates DOCX binary in storage and links draft record.
 */
export async function generateConfiguredDraft(
  tenant: TenantContext,
  configId: string
) {
  const client = getPrismaClient();
  if (!client) throw new Error("Datenbankverbindung nicht verfügbar.");
  return client.$transaction(async (prisma) => {
    const [lock] = await prisma.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(hashtext(${tenant.organizationId}), hashtext(${configId})) AS locked
    `;
    if (!lock.locked) throw new Error("Für diese Konfiguration wird bereits ein Entwurf erstellt. Bitte warten Sie auf den Abschluss.");

  const config = await prisma.documentConfiguration.findUnique({
    where: { id: configId },
    include: {
      case: true,
      templateVersion: true,
    },
  });
  if (!config) throw new ConfigurationNotFoundError(configId);
  assertTenantOwnership(tenant, config.organizationId);

  const formData = config.formData as unknown as DocumentConfigurationData;
  const clauseCodes = config.selectedClauseCodes as unknown as string[];

  // 1. Validate rules engine
  const evaluation = evaluateConfiguration(formData, clauseCodes);
  if (!evaluation.canGenerateDraft) {
    const errorMessages = evaluation.errors.map((e) => e.message);
    throw new ConfigurationValidationError(
      "Entwurfsgenerierung nicht zulässig: Es liegen Validierungsfehler oder fehlende Pflichtangaben vor.",
      errorMessages
    );
  }

  // 2. Determine next version number
  const latestVersion = await prisma.generatedDocumentVersion.findFirst({
    where: {
      organizationId: tenant.organizationId,
      configurationId: configId,
    },
    orderBy: { version: "desc" },
  });
  const nextVersionNumber = (latestVersion?.version || 0) + 1;

  // 3. Generate deterministic text and DOCX Buffer
  const textContent = generatePreviewText(formData);
  const docxBuffer = await generateConfiguredDocx(formData, {
    caseNumber: config.case.caseNumber,
    version: nextVersionNumber,
    templateVersion: config.templateVersion.version,
  });

  // 4. Save DOCX to storage
  const storageResult = await saveDraftDocx(
    tenant.organizationId,
    `config_${configId}`,
    nextVersionNumber,
    docxBuffer
  );

  // 5. Create immutable GeneratedDraft record for case integration
  const generatedDraft = await prisma.generatedDraft.create({
    data: {
      organizationId: tenant.organizationId,
      caseId: config.caseId,
      templateVersion: config.templateVersion.version,
      title: `${config.title} (v${nextVersionNumber})`,
      content: textContent,
      version: nextVersionNumber,
      status: "DRAFT",
      approvedDataSnapshot: {
        configId,
        formData,
        rulesEvaluation: evaluation,
      } as unknown as object,
    },
  });

  // 6. Create immutable GeneratedDocumentVersion record
  const generatedVersion = await prisma.generatedDocumentVersion.create({
    data: {
      organizationId: tenant.organizationId,
      configurationId: configId,
      caseId: config.caseId,
      draftId: generatedDraft.id,
      templateVersionId: config.templateVersionId,
      version: nextVersionNumber,
      templateVersionString: config.templateVersion.version,
      title: `${config.title} (Version ${nextVersionNumber})`,
      content: textContent,
      configurationSnapshot: {
        caseNumber: config.case.caseNumber,
        formData,
        selectedClauseCodes: clauseCodes,
        rulesEvaluation: evaluation,
      } as unknown as object,
      docxStoragePath: storageResult.storagePath,
      createdById: tenant.userId,
    },
  });

  // 7. Update configuration status to GENERATED
  await prisma.documentConfiguration.update({
    where: { id: configId },
    data: {
      status: "GENERATED",
      step: 6,
    },
  });

  // 8. Revisionssicheres Audit-Event
  try {
    await prisma.auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        action: "CONFIGURED_DOCUMENT_GENERATED",
        entityType: "GeneratedDocumentVersion",
        entityId: generatedVersion.id,
        metadata: {
          configurationId: configId,
          version: nextVersionNumber,
          caseNumber: config.case.caseNumber,
          storagePath: storageResult.storagePath,
        },
      },
    });
  } catch (err) {
    console.warn("Audit logging failed:", err);
  }

  return {
    generatedVersion,
    generatedDraft,
    docxBuffer,
  };
  }, { timeout: 30000 });
}

/**
 * Retrieves the DOCX binary file buffer for a generated version with strict tenant isolation.
 */
export async function getGeneratedVersionDocx(
  tenant: TenantContext,
  versionId: string
): Promise<{ buffer: Buffer; fileName: string; title: string }> {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("Datenbankverbindung nicht verfügbar.");

  const version = await prisma.generatedDocumentVersion.findUnique({
    where: { id: versionId },
    include: {
      configuration: {
        include: { case: true },
      },
    },
  });

  if (!version) {
    throw new Error(`Dokumentversion '${versionId}' nicht gefunden.`);
  }

  assertTenantOwnership(tenant, version.organizationId);

  const snapshot = version.configurationSnapshot as unknown as {
    formData: DocumentConfigurationData;
    caseNumber?: string;
  };
  const originalCaseNumber = snapshot.caseNumber || snapshot.formData?.caseNumber;
  let buffer: Buffer | null = null;
  if (version.docxStoragePath) {
    buffer = await getDraftDocx(version.docxStoragePath);
  }

  // Fallback regeneration from immutable snapshot if file not on disk
  if (!buffer) {
    if (snapshot?.formData && originalCaseNumber) {
      buffer = await generateConfiguredDocx(snapshot.formData, {
        caseNumber: originalCaseNumber,
        version: version.version,
        templateVersion: version.templateVersionString,
      });
    }
  }

  if (!buffer) {
    throw new Error("Dokumentdatei konnte nicht aus dem Speicher geladen werden.");
  }

  const sanitizedCase = (originalCaseNumber || "historische_akte").replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `Kaufvertrag_${sanitizedCase}_v${version.version}.docx`;

  return {
    buffer,
    fileName,
    title: version.title,
  };
}
