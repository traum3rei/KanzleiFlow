import { it, expect, vi, afterEach } from "vitest";
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it("loads once across repeated mounts and restores router methods after Office.js clears them", async () => {
  const history = { pushState: vi.fn(), replaceState: vi.fn() };
  const originals = { ...history };
  const script = { src: "", onload: () => {}, onerror: () => {}, remove: vi.fn() };
  const appendChild = vi.fn();
  vi.stubGlobal("window", { history });
  vi.stubGlobal("document", { createElement: () => script, head: { appendChild } });
  const { loadOfficeLibrary } = await import("./office-loader");
  const first = loadOfficeLibrary();
  const second = loadOfficeLibrary();
  expect(first).toBe(second);
  expect(appendChild).toHaveBeenCalledTimes(1);
  Object.assign(history, { pushState: null, replaceState: null });
  script.onload();
  await first;
  expect(history).toEqual(originals);
});
