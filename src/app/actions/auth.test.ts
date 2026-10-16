import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  supabase: vi.fn(), signIn: vi.fn(), cookieSet: vi.fn(), cookieDelete: vi.fn(), token: vi.fn(),
  membership: vi.fn(), user: vi.fn(), provision: vi.fn(),
}));
vi.mock("@/lib/services/portfolio-demo", () => ({ provisionPortfolioDemo: state.provision }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: state.cookieSet, delete: state.cookieDelete }) }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("SUCCESS_REDIRECT"); } }));
vi.mock("@/lib/db", () => ({ getPrismaClient: () => ({ organizationMember: { findFirst: state.membership }, user: { findUnique: state.user } }) }));
vi.mock("@/lib/auth/session", () => ({
  getSupabaseServerClient: state.supabase, createSessionToken: state.token,
  getAuthenticatedSession: vi.fn(), SESSION_COOKIE_NAME: "kanzleiflow_session",
  ACTIVE_ORG_COOKIE_NAME: "kanzleiflow_active_org_id", SESSION_DURATION_MS: 10000,
}));
import { loginAction, demoLoginAction } from "./auth";
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
    expect(state.cookieDelete).toHaveBeenCalledWith("kanzleiflow_session");
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

describe("public portfolio demo login", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("ENABLE_DEMO_LOGIN", "true"); vi.stubEnv("NODE_ENV", "production"); });
  it("issues a one-hour production cookie only for the dedicated synthetic clerk", async () => {
    state.user.mockResolvedValue({ id: "usr_portfolio_demo", email: "portfolio-demo@example.test", fullName: "Demo-Gast", memberships: [{ organizationId: "org_portfolio_demo", role: "CLERK", organization: { slug: "portfolio-demo" } }] });
    state.token.mockReturnValue("restricted-demo-token");
    await expect(demoLoginAction({ success: false })).rejects.toThrow("SUCCESS_REDIRECT");
    expect(state.token).toHaveBeenCalledWith(expect.objectContaining({ userId: "usr_portfolio_demo", demoOrganizationId: "org_portfolio_demo" }), 3600000);
    expect(state.cookieSet).toHaveBeenCalledWith("kanzleiflow_session", "restricted-demo-token", expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax", maxAge: 3600 }));
    expect(state.signIn).not.toHaveBeenCalled();
  });
  it("fails closed when the account is missing", async () => {
    state.user.mockResolvedValue(null);
    expect((await demoLoginAction({ success: false })).success).toBe(false);
    expect(state.token).not.toHaveBeenCalled();
  });
  it.each(["ADMIN", "NOTARY"])("does not expose a privileged %s account", async (role) => {
    state.user.mockResolvedValue({ id: "usr_portfolio_demo", email: "portfolio-demo@example.test", memberships: [{ organizationId: "org_portfolio_demo", role, organization: { slug: "portfolio-demo" } }] });
    expect((await demoLoginAction({ success: false })).success).toBe(false);
    expect(state.token).not.toHaveBeenCalled();
  });
  it("opens the demo in production without an extra enable flag", async () => {
    vi.stubEnv("ENABLE_DEMO_LOGIN", undefined);
    state.user.mockResolvedValue({ id: "usr_portfolio_demo", email: "portfolio-demo@example.test", fullName: "Demo-Gast", memberships: [{ organizationId: "org_portfolio_demo", role: "CLERK", organization: { slug: "portfolio-demo" } }] });
    await expect(demoLoginAction({ success: false })).rejects.toThrow("SUCCESS_REDIRECT");
    expect(state.provision).toHaveBeenCalledOnce();
    expect(state.token).toHaveBeenCalled();
  });
  it("does not issue a session if synthetic setup fails", async () => {
    state.provision.mockRejectedValue(new Error("reserved identity conflict"));
    expect((await demoLoginAction({ success: false })).success).toBe(false);
    expect(state.user).not.toHaveBeenCalled();
    expect(state.token).not.toHaveBeenCalled();
  });
  it("signs in to the second demo only when explicitly selected", async () => {
    const data = new FormData(); data.set("demoOrganizationId", "org_portfolio_demo_b");
    state.user.mockResolvedValue({ id: "usr_portfolio_demo_b", email: "portfolio-demo-b@example.test", fullName: "Demo-Gast B", memberships: [{ organizationId: "org_portfolio_demo_b", role: "CLERK", organization: { slug: "portfolio-demo-b" } }] });
    await expect(demoLoginAction({ success: false }, data)).rejects.toThrow("SUCCESS_REDIRECT");
    expect(state.token).toHaveBeenCalledWith(expect.objectContaining({ userId: "usr_portfolio_demo_b", demoOrganizationId: "org_portfolio_demo_b" }), 3600000);
  });
  it("rejects arbitrary tenant choices before database access", async () => {
    const data = new FormData(); data.set("demoOrganizationId", "org_real_customer");
    expect((await demoLoginAction({ success: false }, data)).success).toBe(false);
    expect(state.provision).not.toHaveBeenCalled();
    expect(state.user).not.toHaveBeenCalled();
    expect(state.token).not.toHaveBeenCalled();
  });
  it("honors explicit disabling of demo login", async () => {
    vi.stubEnv("ENABLE_DEMO_LOGIN", "false");
    expect((await demoLoginAction({ success: false })).success).toBe(false);
    expect(state.user).not.toHaveBeenCalled();
    expect(state.provision).not.toHaveBeenCalled();
  });
});
