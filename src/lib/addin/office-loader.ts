let pending: Promise<void> | undefined;

/** Load once across React Strict Mode mounts and preserve the client router. */
export function loadOfficeLibrary(): Promise<void> {
  if (pending) return pending;
  if (typeof Office !== "undefined") return Promise.resolve();
  pending = new Promise<void>((resolve, reject) => {
    // Office.js nulls both methods. Preserve Next.js wrappers, not prototype methods.
    // https://learn.microsoft.com/office/dev/add-ins/develop/connect-to-javascript-frameworks
    const history = { pushState: window.history.pushState, replaceState: window.history.replaceState };
    const restore = () => {
      window.history.pushState = history.pushState;
      window.history.replaceState = history.replaceState;
    };
    const script = document.createElement("script");
    script.src = "https://appsforoffice.microsoft.com/lib/1/hosted/office.js";
    script.onload = () => { restore(); resolve(); };
    script.onerror = () => { restore(); script.remove(); pending = undefined; reject(new Error("Office.js konnte nicht geladen werden.")); };
    document.head.appendChild(script);
  });
  return pending;
}
