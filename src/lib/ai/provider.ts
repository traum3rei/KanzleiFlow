import {
  ExtractedLegalFields,
  ExtractedLegalFieldsSchema,
  EXTRACTION_SYSTEM_PROMPT,
} from "./schema";

export class LLMConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMConfigurationError";
  }
}

export class LLMExtractionError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "LLMExtractionError";
  }
}

export interface LLMProvider {
  name: string;
  extractLegalFields(untrustedDocumentText: string): Promise<ExtractedLegalFields>;
}

/**
 * OpenAI Provider implementation using native fetch with strict JSON response and timeout.
 */
export class OpenAIProvider implements LLMProvider {
  public name = "OpenAI";
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || "";
    this.model = model || process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!this.apiKey) {
      throw new LLMConfigurationError(
        "OpenAI API-Key fehlt. Bitte definieren Sie OPENAI_API_KEY in Ihrer .env.local."
      );
    }
  }

  async extractLegalFields(untrustedDocumentText: string): Promise<ExtractedLegalFields> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          response_format: { type: "json_object" },
          temperature: 0.1,
          messages: [
            { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
            {
              role: "user",
              content: `Zu analysierender Rohtext des Notariatsdokuments:\n\n${untrustedDocumentText}`,
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new LLMExtractionError(
          `OpenAI API-Fehler (${response.status}): ${errorText}`
        );
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new LLMExtractionError("OpenAI hat eine leere Antwort geliefert.");
      }

      const parsedJson = JSON.parse(content);
      return parseAndValidateExtractedData(parsedJson);
    } catch (err: unknown) {
      if (err instanceof LLMExtractionError) throw err;
      if ((err as Error).name === "AbortError") {
        throw new LLMExtractionError("Zeitüberschreitung (Timeout 30s) bei der OpenAI-Anfrage.");
      }
      throw new LLMExtractionError(`Fehler bei der OpenAI-Extraktion: ${(err as Error).message}`, err);
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Anthropic Provider implementation using native fetch.
 */
export class AnthropicProvider implements LLMProvider {
  public name = "Anthropic";
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || "";
    this.model = model || process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest";

    if (!this.apiKey) {
      throw new LLMConfigurationError(
        "Anthropic API-Key fehlt. Bitte definieren Sie ANTHROPIC_API_KEY in Ihrer .env.local."
      );
    }
  }

  async extractLegalFields(untrustedDocumentText: string): Promise<ExtractedLegalFields> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4096,
          system: EXTRACTION_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Zu analysierender Rohtext:\n\n${untrustedDocumentText}\n\nAntworte AUSSCHLIESSLICH im JSON-Format.`,
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new LLMExtractionError(
          `Anthropic API-Fehler (${response.status}): ${errorText}`
        );
      }

      const data = await response.json();
      const textBlock = data.content?.find((c: { type: string; text?: string }) => c.type === "text");
      if (!textBlock?.text) {
        throw new LLMExtractionError("Anthropic hat keine Textantwort geliefert.");
      }

      // Extract JSON if wrapped in markdown code blocks
      const cleanJson = extractJsonSubstring(textBlock.text);
      const parsedJson = JSON.parse(cleanJson);
      return parseAndValidateExtractedData(parsedJson);
    } catch (err: unknown) {
      if (err instanceof LLMExtractionError) throw err;
      if ((err as Error).name === "AbortError") {
        throw new LLMExtractionError("Zeitüberschreitung (Timeout 30s) bei der Anthropic-Anfrage.");
      }
      throw new LLMExtractionError(`Fehler bei der Anthropic-Extraktion: ${(err as Error).message}`, err);
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Google Gemini Provider implementation using native fetch.
 */
export class GeminiProvider implements LLMProvider {
  public name = "Gemini";
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || "";
    this.model = model || process.env.GEMINI_MODEL || "gemini-3.8-flash";

    if (!this.apiKey) {
      throw new LLMConfigurationError(
        "Gemini API-Key fehlt. Bitte definieren Sie GEMINI_API_KEY in Ihrer .env.local."
      );
    }
  }

  async extractLegalFields(untrustedDocumentText: string): Promise<ExtractedLegalFields> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: EXTRACTION_SYSTEM_PROMPT }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: `Zu analysierender Rohtext:\n\n${untrustedDocumentText}` }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new LLMExtractionError(
          `Gemini API-Fehler (${response.status}): ${errorText}`
        );
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new LLMExtractionError("Gemini hat keine Textantwort geliefert.");
      }

      const parsedJson = JSON.parse(rawText);
      return parseAndValidateExtractedData(parsedJson);
    } catch (err: unknown) {
      if (err instanceof LLMExtractionError) throw err;
      if ((err as Error).name === "AbortError") {
        throw new LLMExtractionError("Zeitüberschreitung (Timeout 30s) bei der Gemini-Anfrage.");
      }
      throw new LLMExtractionError(`Fehler bei der Gemini-Extraktion: ${(err as Error).message}`, err);
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Deterministic Mock LLM Provider for automated tests and offline preview demonstrations.
 * Never silently replaces real models unless explicitly configured via LLM_PROVIDER=mock
 * or in automated tests.
 */
export class MockLLMProvider implements LLMProvider {
  public name = "MockLLM (Synthetischer Demo-Extraktor)";

  async extractLegalFields(untrustedDocumentText: string): Promise<ExtractedLegalFields> {
    // Defense against prompt injection test
    // Even if the text contains commands, the mock ignores them and parses factual entities.
    const text = untrustedDocumentText.toLowerCase();

    const isLueckenhafterVertrag = text.includes("lücken") || text.includes("unvollständig") || text.includes("vorvertrag");

    // Dynamic extraction based on synthetic sample patterns
    const parties = [];

    // Check Seller
    if (text.includes("verkäufer") || text.includes("lindner")) {
      parties.push({
        role: "Verkäufer",
        name: "Dr. Barbara Lindner",
        address: "Königinstr. 12, 80539 München",
        birthDate: "1974-05-14",
        taxId: isLueckenhafterVertrag ? null : "12 345 678 901",
      });
    }

    // Check Buyer
    if (text.includes("käufer") || text.includes("huber")) {
      parties.push({
        role: "Käufer",
        name: "Maximilian Huber",
        address: "Leopoldstr. 45, 80802 München",
        birthDate: isLueckenhafterVertrag ? null : "1988-11-23",
        taxId: isLueckenhafterVertrag ? null : "98 765 432 109",
      });
    }

    // Check Bank / Lender
    if (text.includes("landesbank") || text.includes("gläubiger")) {
      parties.push({
        role: "Gläubigerin (Grundschuld)",
        name: "Bayerische Landesbank A.d.ö.R.",
        address: "Brienner Str. 1, 80333 München",
        birthDate: null,
        taxId: null,
      });
    }

    // Property details
    const propertyDetails = {
      landRegistryDistrict: "Schwabing",
      sheetNumber: isLueckenhafterVertrag ? null : "4521",
      parcelNumber: isLueckenhafterVertrag ? null : "Flur 14, Flurstück 88/2",
      areaSqm: 850,
      economicUse: "Wohnbaufläche",
    };

    // Financials
    const financials = {
      purchasePrice: 1850000,
      currency: "EUR",
      paymentDueDate: isLueckenhafterVertrag ? null : "2026-11-15",
      existingEncumbrances: [
        "Abt. II: Geh- und Fahrtrecht zugunsten des jeweiligen Eigentümers Flurstück 88/1",
        "Abt. III: Keine Vorlasten",
      ],
    };

    // Missing fields and discrepancies calculation
    const missingFields: string[] = [];
    const discrepancies: string[] = [];

    if (isLueckenhafterVertrag) {
      missingFields.push("Grundbuchblatt-Nummer fehlt (Abt. I)");
      missingFields.push("Flurstücksnummer nicht abschließend bezeichnet");
      missingFields.push("Zahlungsfälligkeit für Kaufpreis nicht präzisiert");
      missingFields.push("Steuer-Identifikationsnummern der Beteiligten fehlen");
      discrepancies.push("Kaufpreis-Fälligkeit hängt von unbestimmter Bedingung ab");
    }

    if (parties.length === 0) {
      missingFields.push("Keine Vertragsparteien eindeutig identifizierbar");
    }

    const result: ExtractedLegalFields = {
      documentType: "Grundstückskaufvertrag",
      deedDate: isLueckenhafterVertrag ? null : "2026-10-18",
      notaryOffice: "Notariat Dr. Johannes Weiss & Partner, München",
      parties,
      propertyDetails,
      financials,
      missingFields,
      discrepancies,
      confidence: isLueckenhafterVertrag ? 0.62 : 0.94,
      isSyntheticSample: true,
      disclaimer: "SYNTHETISCHER DEMO-DATENSATZ. Keine rechtliche Verbindlichkeit oder Gewähr nach § 17 BeurkG.",
    };

    return ExtractedLegalFieldsSchema.parse(result);
  }
}

/**
 * Validates raw JSON output from any LLM against the Zod schema.
 */
function parseAndValidateExtractedData(raw: unknown): ExtractedLegalFields {
  const result = ExtractedLegalFieldsSchema.safeParse(raw);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new LLMExtractionError(
      `Das LLM-Ergebnis entspricht nicht dem Notariats-Validierungsschema: ${errorDetails}`
    );
  }
  return result.data;
}

/**
 * Helper to strip markdown JSON code fences if returned by the LLM.
 */
function extractJsonSubstring(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return text.trim();
}

/**
 * Returns the configured LLM provider according to environment variables.
 *
 * Configuration rules:
 * - If LLM_PROVIDER === 'mock', returns MockLLMProvider.
 * - If OPENAI_API_KEY is present (or LLM_PROVIDER === 'openai'), returns OpenAIProvider.
 * - If ANTHROPIC_API_KEY is present (or LLM_PROVIDER === 'anthropic'), returns AnthropicProvider.
 * - If GEMINI_API_KEY is present (or LLM_PROVIDER === 'gemini'), returns GeminiProvider.
 * - In test environment (process.env.NODE_ENV === 'test'), defaults to MockLLMProvider if no key is set.
 * - Otherwise, throws LLMConfigurationError explaining required environment variables.
 */
export function getLLMProvider(): LLMProvider {
  const explicitProvider = process.env.LLM_PROVIDER?.toLowerCase();

  if (explicitProvider === "mock") {
    return new MockLLMProvider();
  }

  if (explicitProvider === "openai" || (!explicitProvider && process.env.OPENAI_API_KEY)) {
    return new OpenAIProvider();
  }

  if (explicitProvider === "anthropic" || (!explicitProvider && process.env.ANTHROPIC_API_KEY)) {
    return new AnthropicProvider();
  }

  if (explicitProvider === "gemini" || (!explicitProvider && process.env.GEMINI_API_KEY)) {
    return new GeminiProvider();
  }

  if (process.env.NODE_ENV === "test") {
    return new MockLLMProvider();
  }

  throw new LLMConfigurationError(
    "Kein KI-Provider konfiguriert. Um die KI-Extraktion zu aktivieren, hinterlegen Sie bitte " +
      "einen API-Schlüssel in '.env.local' (z.B. OPENAI_API_KEY, ANTHROPIC_API_KEY oder GEMINI_API_KEY) " +
      "oder setzen Sie 'LLM_PROVIDER=mock' für den lokalen Demonstrationsmodus."
  );
}
