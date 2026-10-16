import { test, expect, type BrowserContext } from "@playwright/test";
import crypto from "node:crypto";
import { Client } from "pg";

async function authenticate(context: BrowserContext, foreign = false) {
  const now = Date.now();
  const payload = Buffer.from(JSON.stringify({
    userId: foreign ? "usr_e2e_b" : "usr_notary_weiss_01",
    email: foreign ? "b@example.test" : "j.weiss@notariat-weiss-partner.de",
    fullName: foreign ? "Testnotar B" : "Testnotar A", issuedAt: now, expiresAt: now + 3600000,
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(payload).digest("base64url");
  await context.addCookies([
    { name: "kanzleiflow_session", value: `${payload}.${signature}`, url: "http://127.0.0.1:3100", httpOnly: true, sameSite: "Lax" },
    { name: "kanzleiflow_active_org_id", value: foreign ? "org_e2e_b" : "org_notariat_weiss_01", url: "http://127.0.0.1:3100" },
  ]);
}
async function query(sql: string, values: unknown[] = []) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try { return await client.query(sql, values); } finally { await client.end(); }
}
test.beforeEach(async ({ context }) => authenticate(context));

test("case creation, search, filters, pagination and mobile layout", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ihr Notariat im Überblick" })).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard-desktop.png" });
  await page.goto("/cases/new");
  await page.screenshot({ path: "test-results/case-form-desktop.png" });
  await page.getByRole("button", { name: /Grundstückskauf/ }).click();
  await page.getByLabel("Aktenzeichen", { exact: false }).fill("E2E-NEU-2026");
  await page.getByLabel("Vorgangsbezeichnung", { exact: false }).fill("E2E Neu angelegte Testakte");
  await page.getByRole("button", { name: "Akte anlegen", exact: true }).click();
  await expect(page).toHaveURL(/\/cases\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "E2E Neu angelegte Testakte" })).toBeVisible();
  await page.goto("/cases?search=E2E-NEU-2026");
  await expect(page.getByRole("link", { name: "E2E Neu angelegte Testakte", exact: true })).toBeVisible();
  await page.goto("/cases?status=NOTARIZED&search=E2E-NEU-2026");
  await expect(page.getByRole("heading", { name: "Keine Akten für diesen Filter gefunden" })).toBeVisible();
  await page.goto("/cases?page=2");
  await expect(page.getByText(/Seite 2 von/)).toBeVisible();
  await page.goto("/cases?status=INVALID&page=9999");
  await expect(page).not.toHaveURL(/9999/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Aktenverwaltung" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/cases-mobile.png", fullPage: true });
});

test("unauthenticated and foreign tenant access are rejected", async ({ page, context, browser }) => {
  expect((await page.request.get("/api/cases/e2e_foreign_case")).status()).toBe(403);
  expect((await page.request.delete("/api/cases/e2e_foreign_case")).status()).toBe(403);
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get("http://127.0.0.1:3100/api/cases/e2e_case_0")).status()).toBe(401);
  await anonymous.close();
  await authenticate(context, true);
  expect((await page.request.get("/api/cases/e2e_case_0")).status()).toBe(403);
});

test("upload rejection, extraction, direct correction approval, DOCX and immutable history", async ({ page }) => {
  await page.goto("/cases/e2e_case_0");
  await page.screenshot({ path: "test-results/case-detail-desktop.png" });
  await page.locator('input[type="file"]').setInputFiles({ name: "invalid.exe", mimeType: "application/octet-stream", buffer: Buffer.from("invalid test executable") });
  await expect(page.getByText(/Nicht unterstützter Dateityp/)).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles("public/sample-documents/muster_kaufvertrag_schwabing.txt");
  await expect(page.getByText(/erfolgreich hochgeladen/)).toBeVisible();
  await page.getByRole("button", { name: /KI-Extraktion starten/ }).click();
  await expect(page.getByText(/KI-Extraktion erfolgreich abgeschlossen/)).toBeVisible();
  await page.getByLabel("Dokumenttyp", { exact: true }).fill("E2E Zwischenstand");
  await page.getByRole("button", { name: "Korrekturen zwischenspeichern" }).click();
  await expect(page.getByText("Korrekturen erfolgreich gespeichert.")).toBeVisible();
  let unexpectedDialog = false;
  page.once("dialog", async (dialog) => { unexpectedDialog = true; await dialog.dismiss(); });
  await page.getByRole("button").filter({ has: page.getByText("muster_kaufvertrag_schwabing.txt", { exact: true }) }).click();
  expect(unexpectedDialog).toBe(false);
  await expect(page.getByLabel("Dokumenttyp", { exact: true })).toHaveValue("E2E Zwischenstand");
  await page.getByLabel("Dokumenttyp", { exact: true }).fill("E2E Korrigierter Kaufvertrag");
  await page.getByRole("button", { name: /Daten freigeben/ }).click();
  await expect(page.getByText(/Extraktionsdaten durch Sachbearbeitung freigegeben/)).toBeVisible();
  const approval = await query("SELECT approved_data FROM extraction_results WHERE document_id IN (SELECT id FROM documents WHERE case_id = $1)", ["e2e_case_0"]);
  expect(approval.rows[0].approved_data.documentType).toBe("E2E Korrigierter Kaufvertrag");
  const xnp = await page.request.get("/api/cases/e2e_case_0/xnp/validate?type=XNOTAR_GRUNDBUCH_XML");
  expect(xnp.status()).toBe(200);
  expect((await xnp.json()).report.missingRequiredFields).not.toContain("Vertragsparteien (parties)");
  await expect(page.getByText("Es müssen mindestens die beteiligten Vertragsparteien erfasst sein.", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: /Entwurf generieren/ }).click();
  const downloadLink = page.locator('a[href^="/api/drafts/"]').first();
  await expect(downloadLink).toBeVisible();
  const response = await page.request.get((await downloadLink.getAttribute("href"))!);
  expect(response.status()).toBe(200);
  expect((await response.body()).subarray(0, 2).toString()).toBe("PK");
  const snapshot = await query("SELECT id, approved_data_snapshot FROM generated_drafts WHERE case_id = $1", ["e2e_case_0"]);
  await page.getByRole("button", { name: /Neue Version generieren/ }).click();
  await expect(page.locator('a[href^="/api/drafts/"][href$="format=docx"]')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('a[href^="/api/drafts/"]').first()).toBeVisible();
  expect((await query("SELECT approved_data_snapshot FROM generated_drafts WHERE id = $1", [snapshot.rows[0].id])).rows[0].approved_data_snapshot).toEqual(snapshot.rows[0].approved_data_snapshot);
});

test("configurator saves, validates, detects competing tabs and generates immutable versions", async ({ page, context }) => {
  await page.goto("/cases/e2e_case_1/configurator");
  await page.screenshot({ path: "test-results/configurator-desktop.png" });
  const seller = page.getByPlaceholder("z.B. Dr. Barbara Lindner").first();
  await seller.fill("E2E Verkäuferin");
  await expect(page.getByRole("status")).toContainText("Gespeichert");
  await page.reload();
  await expect(seller).toHaveValue("E2E Verkäuferin");
  const second = await context.newPage();
  await second.goto("/cases/e2e_case_1/configurator");
  await seller.fill("E2E Änderung A");
  await expect(page.getByRole("status")).toContainText("Gespeichert");
  await second.getByPlaceholder("z.B. Dr. Barbara Lindner").first().fill("E2E Änderung B");
  await expect(second.getByText(/Konflikt:|anderen Fenster geändert/)).toBeVisible();
  await second.close();
  await page.getByRole("button", { name: /^4\. Regelungen/ }).click();
  await page.getByRole("checkbox", { name: /Gesetzliche Gewährleistung bei Neubau/ }).check();
  await expect(page.getByText("[inkompatibilität]", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: /Gesetzliche Gewährleistung bei Neubau/ }).uncheck();
  await page.getByRole("button", { name: /^5\. Prüfung/ }).click();
  await expect(page.getByText(/bereit zur generierung/)).toBeVisible();
  await page.getByRole("button", { name: /^6\. Entwurf/ }).click();
  await page.getByRole("button", { name: "Word-Entwurf erstellen" }).click();
  const versionLink = page.locator('a[href^="/api/configurator/versions/"]').first();
  await expect(versionLink).toBeVisible();
  const href = (await versionLink.getAttribute("href"))!;
  const original = await page.request.get(href);
  expect(original.status()).toBe(200);
  expect((await original.body()).subarray(0, 2).toString()).toBe("PK");
  await page.getByRole("button", { name: /^1\. Beteiligte/ }).click();
  await seller.fill("E2E Spätere Änderung");
  await expect(page.getByRole("status")).toContainText("Gespeichert");
  expect(await (await page.request.get(href)).body()).toEqual(await original.body());
  await seller.fill("");
  await page.getByRole("button", { name: /^5\. Prüfung/ }).click();
  await expect(page.getByText(/Erforderliche Korrekturen/)).toBeVisible();
  await page.getByRole("button", { name: /^6\. Entwurf/ }).click();
  await expect(page.getByRole("button", { name: "Word-Entwurf erstellen" })).toBeDisabled();
});

test("XNP validates, exports only explicit partial prototypes and downloads", async ({ page }) => {
  await page.goto("/cases/e2e_case_2");
  await expect(page.getByText("Kompatibilität nicht bestätigt", { exact: true })).toBeVisible();
  const validation = await page.request.get("/api/cases/e2e_case_2/xnp/validate?type=UVZ_XML");
  expect(validation.status()).toBe(200);
  expect((await validation.json()).report.isValid).toBe(false);
  const blocked = await page.request.post("/api/cases/e2e_case_2/xnp/export", { data: { exportType: "UVZ_XML", includeAttachments: false, allowPartialDraft: false } });
  expect(blocked.status()).toBe(422);
  const partial = await page.request.post("/api/cases/e2e_case_2/xnp/export", { data: { exportType: "UVZ_XML", includeAttachments: false, allowPartialDraft: true } });
  expect(partial.status()).toBe(200);
  const body = await partial.json();
  const response = await page.request.get(`/api/cases/e2e_case_2/xnp/exports/${body.export.id}/download`);
  expect(response.status()).toBe(200);
  expect((await response.body()).subarray(0, 2).toString()).toBe("PK");
  await page.reload();
  await expect(page.locator('a[href*="/xnp/exports/"]')).toBeVisible();
});

test("Word task pane renders and bearer endpoints enforce tenant boundaries", async ({ page, browser }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/word-addin/taskpane");
  await expect(page.locator("body")).toContainText(/Word|KanzleiFlow/);
  await page.screenshot({ path: "test-results/word-preview.png" });
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get("http://127.0.0.1:3100/api/addin/auth/me")).status()).toBe(401);
  await anonymous.close();
  const cookies = await page.context().cookies();
  const token = cookies.find((cookie) => cookie.name === "kanzleiflow_session")!.value;
  const headers = { Authorization: `Bearer ${token}` };
  expect((await page.request.get("/api/addin/auth/me", { headers })).status()).toBe(200);
  expect((await page.request.get("/api/addin/cases", { headers })).status()).toBe(200);
  expect((await page.request.get("/api/addin/cases/e2e_foreign_case", { headers })).status()).toBe(403);
  expect(errors).toEqual([]);
});

test("invalid password cannot create a browser session", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/login");
  await page.screenshot({ path: "test-results/login-desktop.png" });
  await page.getByLabel("Dienstliche E-Mail-Adresse").fill("j.weiss@notariat-weiss-partner.de");
  await page.getByLabel("Passwort", { exact: false }).fill("wrong-password-2026");
  await page.getByRole("button", { name: /Anmelden/ }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/Anmeldung fehlgeschlagen/)).toBeVisible();
  expect((await context.cookies()).find((cookie) => cookie.name === "kanzleiflow_session")).toBeUndefined();
});

test("PDF upload and extraction render without horizontal page overflow", async ({ page }) => {
  await page.goto("/cases/e2e_case_3");
  await page.locator('input[type="file"]').setInputFiles("public/sample-documents/muster_kaufvertrag_schwabing.pdf");
  await expect(page.getByText(/erfolgreich hochgeladen/)).toBeVisible();
  await page.getByRole("button", { name: /KI-Extraktion starten/ }).click();
  await expect(page.getByText(/KI-Extraktion erfolgreich abgeschlossen/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/document-mobile.png", fullPage: true });
});

test("interrupted upload reports recovery and the same file can be retried", async ({ page }) => {
  await page.goto("/cases/e2e_case_4");
  let interrupt = true;
  await page.route("**/cases/e2e_case_4", async (route) => {
    if (interrupt && route.request().method() === "POST") { interrupt = false; await route.abort("failed"); }
    else await route.continue();
  });
  const file = "public/sample-documents/muster_kaufvertrag_schwabing.txt";
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText(/Die Verbindung wurde unterbrochen/)).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText(/erfolgreich hochgeladen/)).toBeVisible();
  expect((await query("SELECT count(*)::int AS count FROM documents WHERE case_id = $1", ["e2e_case_4"])).rows[0].count).toBe(1);
});

test("workspace remains readable and contained in light and dark mobile layouts", async ({ page }) => {
  test.setTimeout(120_000);
  const routes = ["/", "/cases", "/cases/new", "/cases/e2e_case_0", "/cases/e2e_case_1/configurator", "/login"];
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [index, route] of routes.entries()) {
        if (route === "/login") await page.context().clearCookies();
        await page.goto(route);
        await expect(page).toHaveURL(`http://127.0.0.1:3100${route}`);
        await expect(page.locator("main")).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        // The wizard has an h2; all other main workspace pages have an h1.
        const heading = page.locator("main h1, main h2").first();
        await expect(heading).toBeVisible();
        if (route.endsWith("/configurator")) {
          const contrast = await page.getByRole("button", { name: /^2\. Grundstück/ }).evaluate((el) => {
            const style = getComputedStyle(el);
            const luminance = (color: string) => {
              const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => {
                const channel = value / 255;
                return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
              });
              return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
            };
            const foreground = luminance(style.color), background = luminance(style.backgroundColor);
            return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
          });
          expect(contrast).toBeGreaterThanOrEqual(4.5);
        }
        if (route === "/cases") {
          const search = page.getByRole("textbox", { name: "Akten durchsuchen" });
          await expect(search).toHaveAccessibleName("Akten durchsuchen");
          expect(await search.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
        }
        await page.screenshot({ path: `test-results/ui-${colorScheme}-${width}-${index}.png` });
        if (route === "/login") await authenticate(page.context());
      }
    }
  }
  await page.goto("/cases/e2e_case_0");
  await page.getByRole("link", { name: "Dokumente und Entwürfe", exact: true }).click();
  await expect(page).toHaveURL(/#dokumente$/);
  const sectionTop = await page.locator("#dokumente").evaluate((el) => el.getBoundingClientRect().top);
  expect(sectionTop).toBeGreaterThanOrEqual(64);
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await expect(page.getByRole("button", { name: "Menü schließen" })).toHaveAttribute("aria-expanded", "true");
  await page.locator("#mobile-navigation").getByRole("link", { name: "Aktenverwaltung" }).click();
  await expect(page).toHaveURL(/\/cases$/);
  await expect(page.getByRole("button", { name: "Menü öffnen" })).toHaveAttribute("aria-expanded", "false");
});

test.describe("case editing", () => {
test.use({ timezoneId: "Europe/Berlin" });
test("case edit preserves inputs on errors, saves and clears data, rejects stale tabs", async ({ page, context }) => {
  await page.goto("/cases/e2e_case_3");
  await page.getByRole("link", { name: "Akte bearbeiten", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Akte bearbeiten", exact: true })).toBeVisible();
  await expect(page.locator('input[name="caseNumber"]')).toHaveValue("E2E-2026-3");
  const second = await context.newPage();
  await second.goto("/cases/e2e_case_3/edit");
  await page.locator('input[name="title"]').fill("E2E Bearbeitete Akte");
  await page.locator('input[name="notaryName"]').fill("Testnotarin Muster");
  await page.locator('input[name="caseNumber"]').fill("E2E-2026-0");
  await page.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("bereits vergeben");
  await expect(page.locator('input[name="notaryName"]')).toHaveValue("Testnotarin Muster");
  await page.locator('input[name="caseNumber"]').fill("E2E-2026-3");
  await page.locator('select[name="status"]').selectOption("IN_REVIEW");
  await page.locator('input[name="targetDate"]').fill("2027-05-15T10:30");
  await page.locator('input[name="financialDealValue"]').fill("100.50");
  await page.route("**/cases/e2e_case_3/edit", (route) => route.request().method() === "POST" ? route.abort("failed") : route.continue(), { times: 1 });
  await page.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Speichern fehlgeschlagen");
  await expect(page.locator('input[name="notaryName"]')).toHaveValue("Testnotarin Muster");
  await expect(page.locator('select[name="status"]')).toHaveValue("IN_REVIEW");
  await page.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  await expect(page).toHaveURL(/\/cases\/e2e_case_3$/);
  await expect(page.getByRole("heading", { name: "E2E Bearbeitete Akte", exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/cases/e2e_case_3")).json()).targetDate).toBe("2027-05-15T08:30:00.000Z");
  await expect(page.getByRole("main").getByText("In Prüfung", { exact: true })).toBeVisible();
  await second.locator('input[name="title"]').fill("E2E Veraltete Änderung");
  await second.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  await expect(second.getByRole("main").getByRole("alert")).toContainText("zwischenzeitlich geändert");
  await expect(second.locator('input[name="title"]')).toHaveValue("E2E Veraltete Änderung");
  second.on("dialog", (dialog) => dialog.accept());
  await second.close();
  await page.getByRole("link", { name: "Akte bearbeiten", exact: true }).click();
  await expect(page).toHaveURL(/\/cases\/e2e_case_3\/edit$/);
  await expect(page.getByRole("heading", { name: "Akte bearbeiten", exact: true })).toBeVisible();
  await expect(page.locator('input[name="targetDate"]')).toHaveValue("2027-05-15T10:30");
  await expect(page.locator('input[name="financialDealValue"]')).toHaveValue(/^100\.50?$/);
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/case-edit-mobile.png" });
  await page.locator('input[name="notaryName"]').fill("");
  await page.locator('input[name="targetDate"]').fill("");
  await page.getByRole("button", { name: "Änderungen speichern", exact: true }).click();
  await expect(page).toHaveURL(/\/cases\/e2e_case_3$/);
  const result = await page.request.get("/api/cases/e2e_case_3");
  const saved = await result.json();
  expect(saved.notaryName).toBe(""); expect(saved.targetDate).toBeNull(); expect(saved.status).toBe("IN_REVIEW");
  await page.screenshot({ path: "test-results/case-edit-saved.png" });
  await page.goto("/cases/e2e_foreign_case/edit");
  await expect(page.getByRole("heading", { name: "Akte nicht gefunden", exact: true })).toBeVisible();
});

});

test("public portfolio demo is visible, usable and isolated under configured runtime", async ({ page, context }) => {
  await context.clearCookies();
  expect((await page.request.get("/api/cases/e2e_case_0")).status()).toBe(401);
  await page.goto("/login");
  await expect(page.getByRole("complementary", { name: "Demo-Hinweis" })).toContainText("Nicht von juristischen Fachpersonen geprüft");
  await page.screenshot({ path: "test-results/demo-login-public.png" });
  await page.getByRole("button", { name: "Demo-Zugang verwenden", exact: true }).click();
  await expect(page).toHaveURL(/\/cases$/);
  await expect(page.getByRole("main").getByText("Fiktives Immobilienbeispiel", { exact: true })).toBeVisible();
  const sessionCookie = (await context.cookies()).find((cookie) => cookie.name === "kanzleiflow_session")!;
  const identity = JSON.parse(Buffer.from(sessionCookie.value.split(".")[0], "base64url").toString());
  expect(identity.demoOrganizationId).toBe("org_portfolio_demo");
  expect((await page.request.get("/api/cases/e2e_case_0")).status()).toBe(403);
  await page.screenshot({ path: "test-results/portfolio-demo.png" });
  const navigation = page.getByRole("banner");
  const marker = await navigation.evaluate((element) => element.outerHTML);
  const retainedNavigation = await navigation.elementHandle();
  await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Übersicht", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  expect(await retainedNavigation!.evaluate((element) => element.isConnected)).toBe(true);
  // Layout navigation survives: identity, user and a single navigation shell stay present.
  expect(marker).toContain("Demo-Gast");
  await expect(page.getByRole("banner")).toHaveCount(1);
  await page.getByRole("link", { name: "Funktionsumfang und Grenzen" }).click();
  await expect(page.getByRole("heading", { name: "Über diese Demo" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("nicht für den produktiven Kanzleibetrieb");
  await page.screenshot({ path: "test-results/demo-information.png" });
});
