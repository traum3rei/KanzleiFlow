# Architecture Decision Records (ADRs) — KanzleiFlow

This directory documents the core architectural decisions made throughout the evolution of KanzleiFlow.

---

## ADR Index

| ADR ID | Title | Status | Date |
| :--- | :--- | :--- | :--- |
| [ADR-001](#adr-001-nextjs-app-router-with-server-components-and-partial-prerendering) | Next.js App Router with Server Components and Partial Prerendering | Accepted | 2026-10-10 |
| [ADR-002](#adr-002-prisma-7-with-pg-pool-adapter-and-application-level-multi-tenant-isolation) | Prisma 7 with pg Pool Adapter and Application-Level Multi-Tenant Isolation | Accepted | 2026-10-11 |
| [ADR-003](#adr-003-postgresql-backed-background-job-queue-with-skip-locked) | PostgreSQL-backed Background Job Queue with SKIP LOCKED | Accepted | 2026-10-12 |
| [ADR-004](#adr-004-dual-authentication-architecture) | Dual Authentication Architecture (Supabase Auth SSR + Cryptographic HMAC Session Tokens) | Accepted | 2026-10-13 |
| [ADR-005](#adr-005-file-based-xnp-import-packages-over-local-rest) | File-Based XNP / XNotar Import Packages over Local REST due to Browser Sandbox Restrictions | Accepted | 2026-10-14 |
| [ADR-006](#adr-006-dedicated-vitereact-workspace-for-microsoft-word-add-in) | Dedicated Vite/React Workspace for Microsoft Word Task Pane Add-in | Accepted | 2026-10-15 |
| [ADR-007](#adr-007-in-memory-ttl-caching-and-route-prefetching) | In-Memory TTL Caching and Route Prefetching for Sub-Second Multi-Tenant Navigation | Accepted | 2026-10-15 |

---

## ADR-001: Next.js App Router with Server Components and Partial Prerendering

### Context
KanzleiFlow requires dense, data-rich legal interfaces that render quickly, handle streaming for AI extraction feedback, and protect sensitive legal data on the server without exposing full API routes to the client.

### Decision
Adopt Next.js 16 App Router using Turbopack, Server Actions for mutations, and Partial Prerendering (PPR).

### Consequences
- Pros: Server-side rendering keeps database queries and secrets off client machines; PPR delivers instant static shells while dynamic case data streams in.
- Cons: Developers must understand the boundary between Client and Server Components.

---

## ADR-002: Prisma 7 with pg Pool Adapter and Application-Level Multi-Tenant Isolation

### Context
When connecting via Prisma with database roles (`neondb_owner` / `postgres`), PostgreSQL Row Level Security (RLS) is automatically bypassed due to the superuser `BYPASSRLS` attribute. We needed a strategy to guarantee tenant isolation across 2,000 notaries.

### Decision
Enforce strict application-level multi-tenancy. Every Prisma query must include `{ organizationId: tenant.organizationId }`, and every mutation must invoke `assertTenantOwnership()`. A dedicated security test suite (`production-security.test.ts`) verifies these invariants.

### Consequences
- Pros: Type-safe database queries with Prisma 7, complete control over query plans, zero risk of accidental global data leakage when using helper guards.
- Cons: Developers must remember to always pass the verified `TenantContext` to all service functions.

---

## ADR-003: PostgreSQL-backed Background Job Queue with SKIP LOCKED

### Context
Long-running workloads (OCR, Gemini AI extraction, OpenXML DOCX assembly, PKZIP exports) need asynchronous processing to keep UI response times fast. Introducing Redis or RabbitMQ would add operational complexity.

### Decision
Implement a database-backed job queue in PostgreSQL using `SELECT ... FOR UPDATE SKIP LOCKED` with automatic stale lease recovery and exponential backoff retries.

### Consequences
- Pros: Zero additional infrastructure dependencies; transactional consistency with cases and documents; full tenant isolation inside the database.
- Cons: Not suited for ultra-high-frequency (millions of jobs/second) streaming workloads, but exceptionally suited for 2,000 notary offices processing tens of thousands of deeds per day.

---

## ADR-004: Dual Authentication Architecture

### Context
Standard browser cookies work well for web users, but embedded Microsoft Word task-pane WebViews frequently block third-party cookies or run in sandboxed contexts.

### Decision
Support both Supabase Auth SSR cookies for browser sessions and cryptographically signed HMAC-SHA256 session tokens supporting `Authorization: Bearer <token>` for Word Add-in WebViews.

### Consequences
- Pros: Seamless authentication in both desktop Word and modern browsers; robust fallback during local testing.
- Cons: Two session resolution paths must be maintained in `session.ts`.

---

## ADR-005: File-Based XNP Import Packages over Local REST

### Context
The Bundesnotarkammer provides a local REST WebService on `127.0.0.1:12774–12824`. However, modern browsers enforce W3C Private Network Access (PNA) and Mixed Content blocking, preventing cloud SaaS web pages from directly calling localhost HTTP endpoints.

### Decision
Implement structured PKZIP 2.0 import packages containing specification-compliant XML manifests (XNotar Grundbuch, UVZ, eNoVA) and deed attachments for manual or automated import into XNP.

### Consequences
- Pros: Works immediately in all browsers without security blocks or local network configuration; produces verifiable, immutable audit archives.
- Cons: Requires one additional click in XNP ("Importieren -> Aus Datei") compared to direct REST push.

---

## ADR-006: Dedicated Vite/React Workspace for Microsoft Word Add-in

### Context
Microsoft Word Add-ins require specific HTTPS localhost certificates, Office.js scripts, and an isolated bundle structure distinct from the Next.js SaaS shell.

### Decision
Place the Word Add-in inside a separate workspace in `apps/word-addin/` using Vite, React 19, and `@vitejs/plugin-basic-ssl`.

### Consequences
- Pros: Clean separation of concerns; fast Vite HMR during add-in development; independent build and deployment lifecycle.
- Cons: Requires running a separate dev server (`npm run dev` in `apps/word-addin`) during local add-in development.

---

## ADR-007: In-Memory TTL Caching and Route Prefetching

### Context
Serverless PostgreSQL (Neon) introduces network round-trip latency (50-150 ms per query from Germany to Frankfurt) and cold-start connection handshakes (~850 ms). Running multiple un-cached queries per navigation created noticeable UI lag.

### Decision
Implement multi-tier performance enhancements:
1. In-memory TTL caching for `testDatabaseConnection` (60s), `getAvailableAssignees` (60s), and `getCaseStatusCounts` (15s).
2. Automatic cache invalidation (`invalidateTenantCaches`) on case mutations.
3. Explicit `prefetch={true}` on all internal navigation links, table rows, filter tabs, and pagination buttons.
4. Stable loading skeletons in `loading.tsx` retaining identical header dimensions to prevent visual jumps.

### Consequences
- Pros: Page transitions accelerated by 5x (from ~1,200 ms to ~240 ms); eliminates 5 to 6 database queries per page visit; zero navbar flickering.
- Cons: Status count changes may take up to 15 seconds to reflect if not triggered by an internal mutation action.
