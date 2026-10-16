<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# KanzleiFlow — AI Agent Engineering Manual

Welcome to KanzleiFlow. This document is the primary operational manual for autonomous AI coding agents and human engineers contributing to the codebase.

## 1. Project Philosophy & Core Constraints

KanzleiFlow is a specialized, multi-tenant legal-tech SaaS platform tailored for German notary offices (Notariate). The platform handles official deeds (Urkunden), sensitive personal identity data, real estate transactions, corporate registrations, and filings to the Bundesnotarkammer (BNotK).

### Strict Operating Rules
- Zero Emojis: Do not emit emojis in source code, user interfaces, log output, or markdown documentation.
- Maintain Tenant Isolation: Every query, mutation, file download, and background task must be strictly scoped to the authenticated tenant organization. Never trust tenant identity or organization IDs from client payloads.
- BNotK Alignment: When integrating with German judicial and notarial services (XNP, XNotar, UVZ, eNoVA, XJustiz), strictly adhere to published specifications. Mark generated outputs as technical prototypes requiring professional notarial verification.
- Documentation Integrity: Preserve existing documentation, types, and architectural invariants. Do not alter functioning features without explicit justification.

## 2. Technology Stack & Key Libraries

- Framework: Next.js 16.4.0 (App Router, Turbopack, Partial Prerendering enabled)
- Language: TypeScript 5 (Strict Mode, noImplicitAny)
- Database: PostgreSQL on Neon (accessed via Prisma ORM 7 with `@prisma/adapter-pg` pool adapter)
- Database Schema Management: Prisma schema with additive SQL migrations in `prisma/migrations/`
- Authentication: Supabase Auth SSR with fallback to cryptographic HMAC-SHA256 signed session tokens
- Asynchronous Processing: PostgreSQL-backed transactional job queue with `FOR UPDATE SKIP LOCKED`
- Document Parsing & AI: PDF extraction via `pdf-parse` / canvas, structured extraction via Google Gemini API
- Document Generation: Deterministic OpenXML DOCX assembly via `docx` library
- Archive Packaging: Zero-dependency, deterministic PKZIP 2.0 generator (`src/lib/integrations/xnp/zip-writer.ts`)
- Word Integration: Standalone Vite + React + TypeScript Microsoft Word Add-in using official Office.js Word API (`apps/word-addin`)
- Testing Suite: Vitest (131 tests across 19 suites, 100% passing)

## 3. Directory Structure

```
kanzleiflow/
├── AGENTS.md                          # Primary agent manual (this file)
├── PROJECT_STATUS.md                  # Milestone status & test metrics
├── HANDOFF.md                         # Quickstart & operational runbook
├── docs/                              # Comprehensive documentation suite
│   ├── architecture/                  # Deep-dive architecture specifications
│   │   ├── overview.md
│   │   ├── database.md
│   │   ├── multi-tenancy.md
│   │   ├── background-jobs.md
│   │   ├── authentication.md
│   │   └── document-workflows.md
│   ├── integrations/                  # External systems integration guides
│   │   ├── overview.md
│   │   ├── xnp-research.md
│   │   ├── xnp-implementation.md
│   │   └── word-addin.md
│   ├── operations/                    # Runbooks, testing, and performance
│   │   ├── local-development.md
│   │   ├── environment-variables.md
│   │   ├── testing.md
│   │   ├── deployment.md
│   │   └── performance.md
│   ├── decisions/                     # Architecture Decision Records (ADRs)
│   │   └── README.md
│   └── roadmap.md                     # Strategic feature roadmap
├── apps/
│   └── word-addin/                    # Standalone Microsoft Word Task Pane Add-in
├── prisma/
│   ├── schema.prisma                  # Data models and relations
│   └── migrations/                    # SQL migration scripts
└── src/
    ├── app/                           # Next.js App Router routes and layouts
    ├── components/                    # Reusable UI components
    └── lib/                           # Core business logic and integrations
        ├── auth/                      # Authentication & tenant authorization
        ├── configurator/              # Immobilienkaufvertrag configurator engine
        ├── db.ts                      # Prisma client factory & pool management
        ├── integrations/              # BNotK XNP adapters & PKZIP packaging
        ├── queue/                     # SKIP LOCKED background job queue
        ├── services/                  # Domain services (cases, documents, drafts)
        ├── storage/                   # Private file storage management
        └── validations/               # Zod schemas for input validation
```

## 4. Architectural Invariants

### 4.1. Multi-Tenant Authorization Rules
1. Database Connection Role Bypasses RLS: When connecting via Prisma (`neondb_owner` / `postgres`), the role has `BYPASSRLS`. Therefore, the application layer is strictly responsible for tenant isolation.
2. Mandatory Filtering: Every `findMany`, `findFirst`, `count`, `update`, `delete`, and `groupBy` call MUST include `{ organizationId: tenant.organizationId }`.
3. Entity Verification: Before mutating or returning a single entity, verify ownership using `assertTenantOwnership(entity.organizationId, tenant)`.
4. Tenant Resolution: Call `getTenantContext()` or `getTenantContextOrRedirect()`. Never trust an `organizationId` passed in HTTP bodies, query parameters, or form fields.
5. Cross-Tenant Test Coverage: Any new domain entity must have an isolation test in `src/lib/auth/production-security.test.ts`.

### 4.2. Performance & In-Memory Caching Rules
To guarantee fast response times over serverless PostgreSQL connections:
1. Memoized Database Health: `testDatabaseConnection()` is cached for 60 seconds in memory. Do not bypass the cache unless executing diagnostics.
2. Cached Assignees & Status Counts: `getAvailableAssignees()` (60s TTL) and `getCaseStatusCounts()` (15s TTL) avoid repetitive queries. When creating, updating, or deleting cases, always call `invalidateTenantCaches(tenant.organizationId)`.
3. Link Prefetching: All internal navigation links (`Link` components) MUST specify `prefetch={true}` to preload routes on hover/viewport entry.
4. Stable Loading Shells: `loading.tsx` skeletons must retain the exact header structure and color tokens to avoid visual shifts during transitions.

### 4.3. BNotK XNP / XNotar Integration Rules
1. Modul Grundbuch, UVZ, and eNoVA packages are assembled as structured PKZIP archives containing metadata manifests and XML payloads.
2. The local XNP REST interface (`127.0.0.1:12774–12824`) is strictly local to the workstation and cannot be reached from cloud SaaS browsers due to CORS, Mixed Content, and Private Network Access restrictions.
3. All exported packages must be validated against schema constraints before generation. Incomplete drafts may only be generated if partial export is explicitly requested.
4. Export snapshots are immutable and stored with SHA-256 hashes in `case_exports`.

## 5. Development & Verification Workflow

```bash
# 1. Type Check
npx tsc --noEmit

# 2. Lint Check (zero warnings, zero any casts)
npm run lint

# 3. Test Suite (131 tests across 19 files)
npm test

# 4. Production Build Verification
npm run build
```

Refer to [HANDOFF.md](file:///Users/traumerei/Documents/work/application_projects/kanzleiflow/HANDOFF.md) and [docs/architecture/overview.md](file:///Users/traumerei/Documents/work/application_projects/kanzleiflow/docs/architecture/overview.md) for complete technical guides.
