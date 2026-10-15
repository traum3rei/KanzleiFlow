import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const LOCAL_STORAGE_DIR = path.resolve(process.cwd(), ".storage/documents");

/**
 * Ensures the storage directory exists.
 */
async function ensureStorageDir(): Promise<void> {
  try {
    await fs.mkdir(LOCAL_STORAGE_DIR, { recursive: true });
  } catch (err) {
    console.error("Failed to create storage directory:", err);
  }
}

/**
 * Save an uploaded file buffer securely.
 * Credentials and files are stored strictly server-side.
 */
export async function saveFile(
  organizationId: string,
  fileName: string,
  buffer: Buffer
): Promise<{ storagePath: string; fileHash: string }> {
  await ensureStorageDir();

  // Create an unguessable unique file key scoped to organization
  const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const uniqueKey = `${organizationId}_${Date.now()}_${sanitizedName}`;
  const filePath = path.join(LOCAL_STORAGE_DIR, uniqueKey);

  await fs.writeFile(filePath, buffer);

  return {
    storagePath: uniqueKey,
    fileHash,
  };
}

/**
 * Retrieve a file buffer by storage path.
 */
export async function getFile(storagePath: string): Promise<Buffer> {
  // Prevent directory traversal attacks
  const safeBaseName = path.basename(storagePath);
  const filePath = path.join(LOCAL_STORAGE_DIR, safeBaseName);
  return await fs.readFile(filePath);
}

/**
 * Delete a file by storage path.
 */
export async function deleteFile(storagePath: string): Promise<void> {
  try {
    const safeBaseName = path.basename(storagePath);
    const filePath = path.join(LOCAL_STORAGE_DIR, safeBaseName);
    await fs.unlink(filePath);
  } catch (err) {
    console.warn("Could not delete file:", storagePath, err);
  }
}

const LOCAL_DRAFTS_DIR = path.resolve(process.cwd(), ".storage/drafts");

async function ensureDraftsDir(): Promise<void> {
  try {
    await fs.mkdir(LOCAL_DRAFTS_DIR, { recursive: true });
  } catch (err) {
    console.error("Failed to create drafts storage directory:", err);
  }
}

/**
 * Save a generated DOCX draft buffer securely in organization-scoped storage.
 */
export async function saveDraftDocx(
  organizationId: string,
  draftId: string,
  version: number,
  buffer: Buffer
): Promise<{ storagePath: string; fileHash: string }> {
  await ensureDraftsDir();

  const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const uniqueKey = `${organizationId}_draft_${draftId}_v${version}.docx`;
  const filePath = path.join(LOCAL_DRAFTS_DIR, uniqueKey);

  await fs.writeFile(filePath, buffer);

  return {
    storagePath: uniqueKey,
    fileHash,
  };
}

/**
 * Retrieve a generated draft DOCX file buffer.
 */
export async function getDraftDocx(storagePath: string): Promise<Buffer | null> {
  try {
    const safeBaseName = path.basename(storagePath);
    const filePath = path.join(LOCAL_DRAFTS_DIR, safeBaseName);
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

/**
 * Delete a draft file from storage.
 */
export async function deleteDraftDocx(
  storagePathOrOrgId: string,
  draftId?: string,
  version?: number
): Promise<void> {
  try {
    const safeBaseName = draftId
      ? `${storagePathOrOrgId}_draft_${draftId}_v${version ?? 1}.docx`
      : path.basename(storagePathOrOrgId);
    const filePath = path.join(LOCAL_DRAFTS_DIR, safeBaseName);
    await fs.unlink(filePath);
  } catch (err) {
    console.warn("Could not delete draft file:", storagePathOrOrgId, err);
  }
}

