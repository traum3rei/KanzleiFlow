/** Dedicated synthetic portfolio identity. Never reuse a real account. */
export const PORTFOLIO_DEMO = {
  organizationId: "org_portfolio_demo",
  organizationSlug: "portfolio-demo",
  organizationName: "Fiktives Demo-Notariat",
  userId: "usr_portfolio_demo",
  email: "portfolio-demo@example.test",
  fullName: "Demo-Gast",
} as const;

export const PORTFOLIO_DEMOS = [
  PORTFOLIO_DEMO,
  {
    organizationId: "org_portfolio_demo_b",
    organizationSlug: "portfolio-demo-b",
    organizationName: "Fiktives Demo-Notariat B",
    userId: "usr_portfolio_demo_b",
    email: "portfolio-demo-b@example.test",
    fullName: "Demo-Gast B",
  },
] as const;

export function isDemoLoginEnabled(): boolean {
  // This repository is a public portfolio demo on localhost and Vercel.
  // Operators can explicitly disable the synthetic guest entry point.
  return process.env.ENABLE_DEMO_LOGIN !== "false";
}
