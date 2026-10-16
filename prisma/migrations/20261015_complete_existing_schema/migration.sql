-- Add missing existing configurator and queue schema; preserve the original ascending case index.
-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('DOCUMENT_EXTRACTION', 'DRAFT_GENERATION', 'EXPORT_GENERATION');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConfigurationStatus" AS ENUM ('DRAFT', 'READY', 'APPROVED', 'GENERATED');

-- AlterTable
ALTER TABLE "document_templates" ADD COLUMN     "slug" TEXT;

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "job_type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "heartbeat_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_versions" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "schema_definition" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clause_definitions" (
    "id" TEXT NOT NULL,
    "template_version_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "description" TEXT NOT NULL,
    "required_fields" JSONB,
    "dependencies" JSONB,
    "incompatibilities" JSONB,
    "body_template" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clause_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_configurations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "template_version_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "step" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "form_data" JSONB NOT NULL,
    "selected_clause_codes" JSONB NOT NULL,
    "custom_clause_overrides" JSONB,
    "is_prefilled_from_extraction" BOOLEAN NOT NULL DEFAULT false,
    "prefilled_document_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selected_clauses" (
    "id" TEXT NOT NULL,
    "configuration_id" TEXT NOT NULL,
    "clause_definition_id" TEXT NOT NULL,
    "clause_code" TEXT NOT NULL,
    "custom_text" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "selected_clauses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_document_versions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "configuration_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "draft_id" TEXT,
    "template_version_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "template_version_string" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "configuration_snapshot" JSONB NOT NULL,
    "docx_storage_path" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "joined_on" TIMESTAMP(3) NOT NULL,
    "paid_until" TIMESTAMP(3),

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "background_jobs_idempotency_key_key" ON "background_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "background_jobs_status_priority_run_at_idx" ON "background_jobs"("status", "priority" DESC, "run_at" ASC);

-- CreateIndex
CREATE INDEX "background_jobs_organization_id_status_idx" ON "background_jobs"("organization_id", "status");

-- CreateIndex
CREATE INDEX "background_jobs_status_locked_at_idx" ON "background_jobs"("status", "locked_at");

-- CreateIndex
CREATE INDEX "background_jobs_organization_id_created_at_idx" ON "background_jobs"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "template_versions_template_id_version_key" ON "template_versions"("template_id", "version");

-- CreateIndex
CREATE INDEX "clause_definitions_template_version_id_sort_order_idx" ON "clause_definitions"("template_version_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "clause_definitions_template_version_id_code_key" ON "clause_definitions"("template_version_id", "code");

-- CreateIndex
CREATE INDEX "document_configurations_organization_id_case_id_updated_at_idx" ON "document_configurations"("organization_id", "case_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "document_configurations_organization_id_case_id_idx" ON "document_configurations"("organization_id", "case_id");

-- CreateIndex
CREATE INDEX "document_configurations_organization_id_status_idx" ON "document_configurations"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "selected_clauses_configuration_id_clause_code_key" ON "selected_clauses"("configuration_id", "clause_code");

-- CreateIndex
CREATE INDEX "generated_document_versions_organization_id_configuration_i_idx" ON "generated_document_versions"("organization_id", "configuration_id");

-- CreateIndex
CREATE INDEX "generated_document_versions_organization_id_case_id_idx" ON "generated_document_versions"("organization_id", "case_id");

-- CreateIndex
CREATE UNIQUE INDEX "generated_document_versions_configuration_id_version_key" ON "generated_document_versions"("configuration_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "members_email_key" ON "members"("email");

-- CreateIndex
CREATE INDEX "cases_organization_id_created_at_desc_idx" ON "cases"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "cases_organization_id_status_created_at_idx" ON "cases"("organization_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "cases_organization_id_id_idx" ON "cases"("organization_id", "id");

-- CreateIndex
CREATE INDEX "document_templates_organization_id_slug_idx" ON "document_templates"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "documents_organization_id_case_id_created_at_idx" ON "documents"("organization_id", "case_id", "created_at");

-- CreateIndex
CREATE INDEX "generated_drafts_case_id_document_id_version_idx" ON "generated_drafts"("case_id", "document_id", "version");

-- CreateIndex
CREATE INDEX "generated_drafts_organization_id_case_id_created_at_idx" ON "generated_drafts"("organization_id", "case_id", "created_at");

-- CreateIndex
CREATE INDEX "generated_drafts_organization_id_document_id_version_idx" ON "generated_drafts"("organization_id", "document_id", "version");

-- AddForeignKey
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "document_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clause_definitions" ADD CONSTRAINT "clause_definitions_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "template_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_configurations" ADD CONSTRAINT "document_configurations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_configurations" ADD CONSTRAINT "document_configurations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_configurations" ADD CONSTRAINT "document_configurations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "document_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_configurations" ADD CONSTRAINT "document_configurations_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "template_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selected_clauses" ADD CONSTRAINT "selected_clauses_configuration_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "document_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selected_clauses" ADD CONSTRAINT "selected_clauses_clause_definition_id_fkey" FOREIGN KEY ("clause_definition_id") REFERENCES "clause_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_document_versions" ADD CONSTRAINT "generated_document_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_document_versions" ADD CONSTRAINT "generated_document_versions_configuration_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "document_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_document_versions" ADD CONSTRAINT "generated_document_versions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_document_versions" ADD CONSTRAINT "generated_document_versions_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "generated_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_document_versions" ADD CONSTRAINT "generated_document_versions_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

