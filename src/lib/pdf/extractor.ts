import zlib from "zlib";
import { PDFParse } from "pdf-parse";

// 1. Ensure Node.js DOM Globals are polyfilled so pdfjs-dist never throws ReferenceError: DOMMatrix is not defined
class PolyfillDOMMatrix {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  m11 = 1; m12 = 0; m21 = 0; m22 = 1; m41 = 0; m42 = 0;
  is2D = true;
  constructor(init?: number[] | Float32Array | Float64Array) {
    if (init && init.length >= 6) {
      this.a = init[0]; this.b = init[1]; this.c = init[2];
      this.d = init[3]; this.e = init[4]; this.f = init[5];
      this.m11 = this.a; this.m12 = this.b; this.m21 = this.c;
      this.m22 = this.d; this.m41 = this.e; this.m42 = this.f;
    }
  }
  multiply() { return this; }
  translate() { return this; }
  scale() { return this; }
}

class PolyfillDOMPoint {
  constructor(public x = 0, public y = 0, public z = 0, public w = 1) {}
}

class PolyfillDOMRect {
  constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
}

class PolyfillPath2D {}

const g = globalThis as Record<string, unknown>;
if (typeof g.DOMMatrix === "undefined") g.DOMMatrix = PolyfillDOMMatrix;
if (typeof g.DOMPoint === "undefined") g.DOMPoint = PolyfillDOMPoint;
if (typeof g.DOMRect === "undefined") g.DOMRect = PolyfillDOMRect;
if (typeof g.Path2D === "undefined") g.Path2D = PolyfillPath2D;

export class PdfParseError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "PdfParseError";
  }
}

/**
 * Resilient native PDF stream extractor that parses uncompressed and FlateDecode streams
 * directly from the binary PDF structure. Does not require browser DOM or external workers.
 */
export function extractPdfTextFallback(buffer: Buffer): string {
  const chunks: string[] = [];
  const content = buffer.toString("latin1");

  // Matches stream ... endstream blocks
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(content)) !== null) {
    const rawData = Buffer.from(match[1], "latin1");
    let decompressed = "";

    try {
      decompressed = zlib.inflateSync(rawData).toString("latin1");
    } catch {
      try {
        decompressed = zlib.inflateRawSync(rawData).toString("latin1");
      } catch {
        decompressed = rawData.toString("latin1");
      }
    }

    // 1. Match array TJ: [ (text1) -12 (text2) ] TJ
    const arrayTjRegex = /\[([\s\S]*?)\]\s*TJ/g;
    let arrayMatch: RegExpExecArray | null;
    while ((arrayMatch = arrayTjRegex.exec(decompressed)) !== null) {
      const inner = arrayMatch[1];
      const strParts = inner.match(/\(([^)]*)\)/g);
      if (strParts) {
        chunks.push(strParts.map((s) => s.slice(1, -1)).join(""));
      }
      const hexParts = inner.match(/<([0-9a-fA-F]+)>/g);
      if (hexParts) {
        for (const h of hexParts) {
          const hex = h.slice(1, -1);
          if (hex.length >= 2) {
            chunks.push(Buffer.from(hex, "hex").toString("latin1"));
          }
        }
      }
    }

    // 2. Match simple (text) Tj, ', or "
    const tjRegex = /\(([^)]*)\)\s*(?:Tj|'|")/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = tjRegex.exec(decompressed)) !== null) {
      chunks.push(sMatch[1]);
    }

    // 3. Match <hex> Tj, ', or "
    const hexTjRegex = /<([0-9a-fA-F]+)>\s*(?:Tj|'|")/g;
    let hMatch: RegExpExecArray | null;
    while ((hMatch = hexTjRegex.exec(decompressed)) !== null) {
      const hex = hMatch[1];
      if (hex.length >= 2) {
        chunks.push(Buffer.from(hex, "hex").toString("latin1"));
      }
    }
  }

  const rawText = chunks.join(" ");
  return rawText.replace(/\s+/g, " ").trim();
}

/**
 * Extracts raw text from any PDF buffer using a multi-strategy architecture:
 * 1. Primary: PDFParse (pdfjs-dist) with polyfilled Node DOMMatrix / Path2D
 * 2. Secondary fallback: Native zlib stream text extractor
 * 3. Diagnostic analysis if text is empty (scanned vs password protected vs corrupted)
 */
export async function extractPdfText(buffer: Buffer, fileName: string): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new PdfParseError(`Die PDF-Datei '${fileName}' ist leer (0 Bytes).`);
  }

  // Check magic bytes
  const isPdfHeader = buffer.subarray(0, 5).toString("ascii").startsWith("%PDF");
  if (!isPdfHeader) {
    throw new PdfParseError(
      `Die Datei '${fileName}' ist keine gültige PDF-Datei (ungültiger PDF-Dateikopf).`
    );
  }

  let text = "";
  let primaryError: Error | null = null;

  // Strategy 1: PDFParse (pdfjs-dist) with polyfilled globals
  try {
    // Allocate an independent ArrayBuffer copy so worker transfers cannot detach the caller's buffer
    const isolatedUint8 = new Uint8Array(buffer.length);
    isolatedUint8.set(buffer);

    const parser = new PDFParse({
      data: isolatedUint8,
      disableFontFace: true,
      isEvalSupported: false,
    });
    const result = await parser.getText();
    text = (result?.text || "").trim();
    await parser.destroy();
  } catch (err: unknown) {
    primaryError = err as Error;
    console.warn(
      `PDFParse Primär-Extraktion fehlgeschlagen für '${fileName}', starte Fallback-Extraktor:`,
      primaryError.message
    );
  }

  // Strategy 2: If primary parser failed or returned empty text, invoke resilient fallback
  if (!text || text.length < 15) {
    try {
      const fallbackText = extractPdfTextFallback(buffer);
      if (fallbackText && fallbackText.length >= 15) {
        text = fallbackText;
      }
    } catch (fallbackErr) {
      console.warn(
        `PDF Fallback-Extraktion fehlgeschlagen für '${fileName}':`,
        (fallbackErr as Error).message
      );
    }
  }

  // Strategy 3: Diagnosis & clear error messaging if still no text
  const trimmed = text.trim();
  if (trimmed.length < 15) {
    // Check if error was password-related
    const errMsg = primaryError?.message?.toLowerCase() || "";
    if (errMsg.includes("password") || errMsg.includes("passwort") || errMsg.includes("encrypted")) {
      throw new PdfParseError(
        `Die PDF-Datei '${fileName}' ist passwortgeschützt. Bitte entfernen Sie das Kennwort vor dem Hochladen.`
      );
    }

    // Check if valid PDF with no text layer (e.g. scanned image / portfolio / Canva vector paths)
    throw new PdfParseError(
      `Aus der PDF-Datei '${fileName}' konnte keine lesbare Textschicht extrahiert werden (nur ${trimmed.length} Zeichen gefunden). ` +
      `Möglicherweise handelt es sich um ein reines Scan-/Bilddokument ohne OCR-Textschicht oder die Schriftarten sind als Vektoren/Bilder eingebettet. ` +
      `Bitte verwenden Sie eine PDF mit durchsuchbarem Text oder ein Textdokument (.txt).`
    );
  }

  return trimmed;
}
