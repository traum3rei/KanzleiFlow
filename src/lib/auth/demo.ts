/** Dedicated synthetic portfolio identity. Never reuse a real account. */
export const PORTFOLIO_DEMO = {
  organizationId: "org_portfolio_demo",
  organizationSlug: "portfolio-demo",
  organizationName: "Fiktives Demo-Notariat",
  userId: "usr_portfolio_demo",
  email: "portfolio-demo@example.test",
  fullName: "Demo-Gast",
} as const;

export function isDemoLoginEnabled(): boolean {
  return process.env.ENABLE_DEMO_LOGIN === "true";
}
