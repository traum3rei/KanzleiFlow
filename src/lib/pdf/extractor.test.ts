import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  extractPdfText,
  extractPdfTextFallback,
  PdfParseError,
} from "./extractor";

describe("PDF Extractor Layer", () => {
  const samplePdfPath = path.join(
    process.cwd(),
    "public/sample-documents/muster_kaufvertrag_schwabing.pdf"
  );
  const sampleBuffer = fs.readFileSync(samplePdfPath);

  it("extracts text accurately from a valid PDF document", async () => {
    const text = await extractPdfText(sampleBuffer, "muster_kaufvertrag_schwabing.pdf");
    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain("NOTARIELLE URKUNDE");
    expect(text).toContain("2026-UR-0142");
    expect(text).toContain("Weiss");
  });

  it("extracts text using the native stream fallback extractor", () => {
    const fallbackText = extractPdfTextFallback(sampleBuffer);
    expect(fallbackText.length).toBeGreaterThan(100);
    expect(fallbackText).toContain("NOTARIELLE URKUNDE");
    expect(fallbackText).toContain("2026-UR-0142");
  });

  it("rejects empty PDF files gracefully", async () => {
    const emptyBuffer = Buffer.alloc(0);
    await expect(extractPdfText(emptyBuffer, "empty.pdf")).rejects.toThrow(PdfParseError);
    await expect(extractPdfText(emptyBuffer, "empty.pdf")).rejects.toThrow(/leer/);
  });

  it("rejects files without valid PDF magic bytes", async () => {
    const invalidBuffer = Buffer.from("This is not a PDF file at all.");
    await expect(extractPdfText(invalidBuffer, "not_a_pdf.pdf")).rejects.toThrow(PdfParseError);
    await expect(extractPdfText(invalidBuffer, "not_a_pdf.pdf")).rejects.toThrow(/ungültiger PDF-Dateikopf/);
  });

  it("does not detach or invalidate the caller's ArrayBuffer during extraction", async () => {
    const inputBuffer = Buffer.from(sampleBuffer);
    expect(inputBuffer.buffer.byteLength).toBeGreaterThan(0);

    const text = await extractPdfText(inputBuffer, "buffer-safety-test.pdf");
    expect(text.length).toBeGreaterThan(100);

    // ArrayBuffer must remain attached and intact
    expect(inputBuffer.buffer.byteLength).toBeGreaterThan(0);
    if ("detached" in inputBuffer.buffer) {
      expect((inputBuffer.buffer as { detached?: boolean }).detached).toBe(false);
    }
    // Node.js Buffer operations (which throw "detached ArrayBuffer" if detached) must succeed
    expect(() => inputBuffer.subarray(0, 10)).not.toThrow();
    expect(() => Buffer.from(inputBuffer)).not.toThrow();
  });
});

