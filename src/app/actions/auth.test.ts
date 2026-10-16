import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  supabase: vi.fn(), signIn: vi.fn(), cookieSet: vi.fn(), token: vi.fn(),
  membership: vi.fn(), user: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: state.cookieSet }) }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("SUCCESS_REDIRECT"); } }));
vi.mock("@/lib/db", () => ({ getPrismaClient: () => ({ organizationMember: { findFirst: state.membership }, user: { findUnique: state.user } }) }));
vi.mock("@/lib/auth/session", () => ({
  getSupabaseServerClient: state.supabase, createSessionToken: state.token,
  getAuthenticatedSession: vi.fn(), SESSION_COOKIE_NAME: "kanzleiflow_session",
  ACTIVE_ORG_COOKIE_NAME: "kanzleiflow_active_org_id", SESSION_DURATION_MS: 10000,
}));
import { loginAction } from "./auth";
const form = () => {
  const data = new FormData(); data.set("email", "j.weiss@notariat-weiss-partner.de"); data.set("password", "wrong-password"); return data;
};
describe("login fallback boundary", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("preserves a successful Supabase login without applying demo restrictions", async () => {
    state.supabase.mockResolvedValue({ auth: { signInWithPassword: state.signIn } });
    state.signIn.mockResolvedValue({ data: { user: { id: "supabase-user", email: "user@example.test" } }, error: null });
    state.membership.mockResolvedValue({ organizationId: "org-a" });
    await expect(loginAction({ success: false }, form())).rejects.toThrow("SUCCESS_REDIRECT");
    expect(state.cookieSet).toHaveBeenCalled();
    expect(state.token).not.toHaveBeenCalled();
  });
  it("does not issue a fallback token merely because an email exists", async () => {
    state.supabase.mockResolvedValue(null);
    state.user.mockResolvedValue({ id: "demo", email: "j.weiss@notariat-weiss-partner.de", fullName: "Demo", memberships: [{ organizationId: "org-a" }] });
    const result = await loginAction({ success: false }, form());
    expect(result.success).toBe(false);
    expect(state.token).not.toHaveBeenCalled();
    expect(state.cookieSet).not.toHaveBeenCalled();
  });
});
