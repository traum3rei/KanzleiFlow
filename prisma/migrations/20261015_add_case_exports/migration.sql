-- CreateTable
CREATE TABLE "case_exports" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "job_id" TEXT,
    "export_type" TEXT NOT NULL,
    "format_version" TEXT NOT NULL DEFAULT '1.0.0',
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL DEFAULT 0,
    "file_hash" TEXT,
    "storage_path" TEXT NOT NULL,
    "source_snapshot" JSONB NOT NULL,
    "validation_report" JSONB,
    "is_authoritative" BOOLEAN NOT NULL DEFAULT false,
    "compatibility_notice" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "case_exports_organization_id_case_id_created_at_idx" ON "case_exports"("organization_id", "case_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "case_exports_organization_id_export_type_idx" ON "case_exports"("organization_id", "export_type");

-- AddForeignKey
ALTER TABLE "case_exports" ADD CONSTRAINT "case_exports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_exports" ADD CONSTRAINT "case_exports_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
