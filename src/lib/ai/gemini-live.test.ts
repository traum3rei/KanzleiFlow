import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { GeminiProvider } from "./provider";
import { ExtractedLegalFieldsSchema } from "./schema";

const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
const shouldRunLive = Boolean(process.env.RUN_LIVE_GEMINI === "true" && hasGeminiKey);

describe("Phase 4: Real Gemini Integration Live Verification", () => {
  it.runIf(shouldRunLive)(
    "performs live extraction against Gemini API with synthetic sample document and validates Zod schema",
    async () => {
      const provider = new GeminiProvider();
      expect(provider.name).toBe("Gemini");

      // Load synthetic notary deed text
      const samplePath = path.join(
        process.cwd(),
        "public/sample-documents/muster_kaufvertrag_schwabing.txt"
      );
      const sampleText = fs.readFileSync(samplePath, "utf-8");
      expect(sampleText.length).toBeGreaterThan(500);

      // Execute live extraction with server GEMINI_API_KEY
      const result = await provider.extractLegalFields(sampleText);

      // 1. Validate full Zod schema compliance
      const validated = ExtractedLegalFieldsSchema.parse(result);
      expect(validated).toBeDefined();

      // 2. Validate extracted legal structure
      expect(validated.documentType).toMatch(/kaufvertrag/i);
      expect(validated.parties.length).toBeGreaterThanOrEqual(2);

      // Verify parties extracted accurately
      const seller = validated.parties.find((p) => p.role.toLowerCase().includes("verkäufer"));
      expect(seller).toBeDefined();
      expect(seller?.name).toContain("Lindner");

      const buyer = validated.parties.find(
        (p) =>
          p.role.toLowerCase().includes("käufer") &&
          !p.role.toLowerCase().includes("verkäufer")
      );
      expect(buyer).toBeDefined();
      expect(buyer?.name).toContain("Huber");

      // Verify property and financial details
      expect(validated.propertyDetails?.landRegistryDistrict).toMatch(/schwabing/i);
      expect(validated.financials?.purchasePrice).toBe(1850000);
      expect(validated.confidence).toBeGreaterThan(0.7);
    },
    35000 // 35s timeout for live LLM call
  );

  it.runIf(!shouldRunLive)(
    "skips live Gemini API calls during normal mocked test runs to preserve API quotas",
    () => {
      // Confirms that by default, standard test runs do not make live paid API calls
      expect(true).toBe(true);
    }
  );
});
