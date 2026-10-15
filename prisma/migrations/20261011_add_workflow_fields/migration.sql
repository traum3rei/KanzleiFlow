-- CreateEnum
CREATE TYPE "DocumentWorkflowStatus" AS ENUM ('UPLOADED', 'EXTRACTING', 'NEEDS_REVIEW', 'APPROVED', 'GENERATING', 'DRAFT_READY', 'EXTRACTION_FAILED', 'GENERATION_FAILED');

-- AlterTable (Additive only)
ALTER TABLE "documents" ADD COLUMN "workflow_status" "DocumentWorkflowStatus" NOT NULL DEFAULT 'UPLOADED';

-- AlterTable (Additive only)
ALTER TABLE "extraction_results" ADD COLUMN "approved_data" JSONB,
ADD COLUMN "discrepancies" JSONB,
ADD COLUMN "missing_fields" JSONB,
ADD COLUMN "raw_text" TEXT,
ADD COLUMN "review_notes" TEXT,
ADD COLUMN "reviewed_at" TIMESTAMP(3),
ADD COLUMN "reviewed_by_id" TEXT,
ADD COLUMN "workflow_status" "DocumentWorkflowStatus" NOT NULL DEFAULT 'UPLOADED';

-- AlterTable (Additive only)
ALTER TABLE "generated_drafts" ADD COLUMN "approved_data_snapshot" JSONB,
ADD COLUMN "document_id" TEXT,
ADD COLUMN "template_version" TEXT NOT NULL DEFAULT '1.0.0';

-- CreateIndex
CREATE INDEX "documents_organization_id_workflow_status_idx" ON "documents"("organization_id", "workflow_status");

-- CreateIndex
CREATE INDEX "extraction_results_organization_id_workflow_status_idx" ON "extraction_results"("organization_id", "workflow_status");

-- CreateIndex
CREATE INDEX "generated_drafts_organization_id_document_id_idx" ON "generated_drafts"("organization_id", "document_id");

-- AddForeignKey
ALTER TABLE "generated_drafts" ADD CONSTRAINT "generated_drafts_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
