# Technical Architecture Review

**Issue:** [CRE-34](/CRE/issues/CRE-34) — Technical architecture review of Dataclip, CrewBrief backend, and React Native app  
**Reviewer:** Hayes (Founding Engineer)  
**Date:** 2026-05-11  
**Scope:** Dataclip, CrewBrief, and the integration between them

---

## Overview

Three components were reviewed:

| Component | Path | Language | Version | Status |
|-----------|------|----------|---------|--------|
| **Dataclip** | `/opt/dataclip/` | TypeScript (ESM, Node 20+) | 0.0.1 | Pre-production skeleton |
| **CrewBrief** | `/opt/crewbrief/` | TypeScript (ESM, Node 20+) | 0.0.0 | Pre-production library |
| **React Native app** | Not found | N/A | N/A | Does not exist yet |

---

## Part 1: Dataclip — Intake & Orchestration Layer

### Architecture

```
[External Systems]          [Dataclip]                     [CrewBrief]

Postmark (Email) ──────►  ┌────────────────────┐         ┌──────────────────────┐
                           │  Intake Layer      │         │  Briefing Generation │
ICS Feeds ──────────────►  │  - adaptPostmark   │  ─────► │  & Presentation      │
                           │  - classify        │  HANDOFF│  (separate product)   │
Pilot Documents ────────►  │  - ingestIcs       │         │                      │
                           │  - persist events  │         └──────────────────────┘
Tail Sniffer ────────────► │  - client matching │
                           │  - attachment mgmt │
                           └────────┬───────────┘
                                    │
                           ┌────────▼───────────┐
                           │  Staging Layer     │
                           │  - SQLite DB       │
                           │  - trip_duty_day   │
                           │  - generation_runs │
                           │  - outputs         │
                           └────────┬───────────┘
                                    │
                           ┌────────▼───────────┐
                           │  Supabase Mirror   │
                           │  (fire-and-forget) │
                           └────────────────────┘
```

### Data Flow

1. **Postmark Webhook Flow** (`/webhooks/postmark/inbound`): Auth → read body → persist raw → adapt → classify → 200
2. **Foundation Intake Flow** (`/api/inbound/postmark`): Auth → normalize → client match → sender verify → persist → Supabase mirror → 200
3. **ICS Feed Ingestion**: Parse → persist per-event with dedup
4. **CrewBrief Generation Flow**: Validate → stage READY → invoke CrewBrief → persist run + output → stage GENERATED

### Strengths

- **Excellent TypeScript hygiene**: `readonly` everywhere, `strict: true`, `verbatimModuleSyntax`, discriminated union result types
- **Defense in depth on auth**: Postmark token + HMAC-SHA256 timing-safe comparison, shared-secret fallback, deterministic error codes
- **Idempotency by design**: Payload hash dedup on raw Postmark, composite key on ICS events, `message_id` on inbound events, content-hash on generation runs
- **Security-conscious**: Attachment bytes never stored, Content redacted to `__REDACTED__` before persistence, no HTML/JS injection surface
- **Comprehensive validation**: 10 attachment rejection reasons, 24 trip package error codes, 8 handoff error codes, two-tier (errors vs. warnings)
- **Security-hardened systemd unit**: `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`, `ProtectHome=true`
- **Well-documented operator runbooks**: Postmark setup, VPS reliability slice, debug smoke scripts
- **Supabase mirror is fire-and-forget**: Failures never throw; local SQLite is authoritative

### Weaknesses & Risks

| Risk | Location | Severity |
|------|----------|----------|
| **No graceful shutdown** | `index.ts` | HIGH |
| **No transaction wrapping in staging** | `stageAndGenerateCrewBriefPackage.ts` | HIGH |
| **Permissive auth fallback** | `dataclipInboundWebhookAuth.ts` | HIGH |
| **Monolithic HTTP handler** | `httpServer.ts` (1133 lines) | MEDIUM |
| **Two Postmark routes, unclear migration path** | `/webhooks/postmark/inbound` vs `/api/inbound/postmark` | MEDIUM |
| **No rate limiting on webhook routes** | `httpServer.ts` | MEDIUM |
| **`safeEqualUtf8`/`isPlainObject` duplicated** | 2-3 files each | MEDIUM |
| **ICS parser no RRULE, no escaping** | `ingestIcsFeed.ts` | MEDIUM |
| **Null vs undefined inconsistency in mappers** | `invokeCrewBriefDutyDayPackage.ts` | MEDIUM |
| **Classifier has no MEDIUM confidence** | `classifyInboundEmail.ts` | LOW |
| **Supabase mirror blocks webhook response** | mirror is synchronous within request | MEDIUM |
| **No CHECK constraints at DB level** | `schema.ts` | MEDIUM |
| **Sync DB ops block event loop** (better-sqlite3) | All DB modules | LOW |

### Recommendations (Dataclip)

1. **HIGH** — Add `process.on('SIGTERM')`/`process.on('SIGINT')` to close DB and stop accepting requests gracefully
2. **HIGH** — Wrap `stageAndGenerateCrewBriefPackage` in a `db.transaction()` for atomicity
3. **HIGH** — Remove permissive auth fallback; add `REQUIRE_AUTH` env var for production
4. **MEDIUM** — Extract shared utils (`safeEqualUtf8`, `isPlainObject`) into `src/utils/`
5. **MEDIUM** — Add rate limiting to webhook routes
6. **MEDIUM** — Refactor `httpServer.ts` routing into Map-based router with extracted handlers
7. **MEDIUM** — Add Zod or JSON Schema validation for Postmark request bodies
8. **MEDIUM** — Decouple Supabase mirror from webhook response path (async queue)
9. **MEDIUM** — Add DB-level CHECK constraints for enum columns
10. **LOW** — Clean up unused `errors` deprecation alias, dead `assertNever` utility

---

## Part 2: CrewBrief — Briefing Generation Engine

### Architecture

```
Source Documents (email, upload, webhook)
        │
        ▼
┌──────────────────┐
│  Document        │
│  Classifier      │
│  (deterministic) │
└────────┬─────────┘
         │ classified text
         ▼
┌──────────────────┐     ┌──────────────────────┐
│  JetInsight       │     │  Flight Plan / W&B   │
│  Itinerary Parser │     │  Parsers             │
└────────┬─────────┘     └──────────┬───────────┘
         │                          │
         ▼                          ▼
┌──────────────────┐     ┌──────────────────────┐
│  Itinerary       │     │  Planning Enrichment  │
│  → Briefing Leg  │     │  (fuel, W&B, route,   │
│  Adapter         │     │  ETE, altitude)       │
└────────┬─────────┘     └──────────┬───────────┘
         │                          │
         ▼                          ▼
┌─────────────────────────────────────────────────────┐
│           Leg Briefing Package Pipeline              │
│  1. enrichBriefingLegWithPlanning                    │
│  2. enrichBriefingLegWithWeather                     │
│  3. enrichBriefingLegWithNotamAirspace               │
│  4. applyFratToBriefingLeg                           │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────┐
│  Briefing Input Builders                              │
│  - buildFlightCrewBriefingInput                       │
│  - buildCabinCrewBriefingInput                        │
└──────────────────────┬───────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────┐
│  Briefing Generators                                  │
│  - generateFlightCrewBriefing → plain text            │
│  - generateCabinCrewBriefing → plain text             │
└──────────────────────┬───────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────┐
│  HTML Renderer                                        │
│  - renderBriefingHtml (section cards, D-ATIS, alerts) │
│  - renderOpsDayIndexHtml (portal index page)          │
└──────────────────────────────────────────────────────┘
                       │
                       ▼
                HTML output
```

### Strengths

- **Clean layered architecture**: Parsers → Adapters → Builders → Generators → Renderers. Each layer has clear responsibility.
- **Deterministic-first**: All safety-critical calculations (fuel, W&B, FRAT, OOOI) are pure deterministic functions. No AI dependency for core aviation math.
- **Audience separation**: Meticulous flight crew vs cabin crew content separation. Warnings carry `audience` metadata; builders filter accordingly.
- **Pipeline composition**: `legBriefingPackage.ts` demonstrates a clean enrichment pipeline (planning → weather → NOTAM → FRAT).
- **Warning code catalog**: Single source of truth (`warningCodes.ts`) for 100+ canonical warning codes with labels, audiences, severities, and readiness-blocking flags. Exceptional design.
- **Zero runtime dependencies**: Entire TypeScript library has zero runtime dependencies (only `@types/node` + `typescript` as dev deps). Remarkable for this complexity.
- **Consistent defensive coding**: Assertion functions (`assertFiniteNumber`, `requireNonEmptyString`) used throughout.
- **Exhaustive switch patterns**: Compile-time safety for all variant types.
- **Safe failure modes**: Parsers return `FAILED` or `NEEDS_REVIEW` instead of throwing.
- **Rich documentation**: 17 Markdown files including detailed product specs, data contracts, agent prompts, workflow definitions.
- **HTML design system**: Inline CSS is thoughtfully designed — premium executive aviation aesthetic, responsive, accessible, print-aware.

### Weaknesses & Risks

| Risk | Location | Severity |
|------|----------|----------|
| **Monolithic HTML renderer** | `briefingHtmlRenderer.ts` (1887 lines) | HIGH |
| **Plain text as intermediate format** | Generators produce text → Renderer re-parses it | HIGH |
| **No input validation at public API boundaries** | `buildDutyDayGeneratedBriefingPackage` etc. | HIGH |
| **Low test coverage (~40-50%)** | Many parsers, adapters, workflows lack tests | HIGH |
| **No integration tests for full pipeline** | No E2E parser→renderer coverage | HIGH |
| **Flight crew briefing file too large** | `flightCrewBriefing.ts` (944 lines) | MEDIUM |
| **Duplicated utilities** | `joinNonEmptyLines`, `dedupePreserveOrder` in 6+ files | MEDIUM |
| **METAR/TAF interpretation too narrow** | Only standard US formats; unknown formats return null | MEDIUM |
| **Inline CSS in template strings** | ~1300 lines of CSS embedded in JS strings | MEDIUM |
| **No persistence layer** | All processing is in-memory (by design as library) | LOW (by design) |
| **Placeholder doc files** | 11 of 17 doc files are empty | LOW |
| **Hardcoded timezone map** | Only 5 airports | LOW |
| **Hardcoded TAF fallback sites** | Only 10 US airports | LOW |

### Recommendations (CrewBrief)

1. **HIGH** — Add input validation at public API boundaries (Zod or runtime type guards)
2. **HIGH** — Replace plain-text intermediate format with structured section model (array of `{title, blocks}`)
3. **HIGH** — Add integration tests for the full pipeline: parse → adapt → build → generate → render
4. **HIGH** — Split `briefingHtmlRenderer.ts` into separate files (CSS tokens, section card renderers, weather renderers, etc.)
5. **HIGH** — Increase test coverage to 80%+ on core business logic
6. **MEDIUM** — Extract shared utilities into `src/lib/shared/`
7. **MEDIUM** — Split `flightCrewBriefing.ts` into section-specific modules
8. **MEDIUM** — Broaden METAR/TAF interpretation coverage
9. **MEDIUM** — Extract CSS to separate file or CSS-in-JS solution
10. **LOW** — Expand timezone support beyond MVP 5-airport map
11. **LOW** — Externalize aircraft profiles to JSON
12. **LOW** — Expand TAF site catalog from 10 to full NWS station list

---

## Part 3: Integration Between Dataclip and CrewBrief

### Current State

Dataclip depends on CrewBrief as a local file dependency (`"crewbrief": "file:../crewbrief"`). The integration layer is:

```
Dataclip: invokeCrewBriefDutyDayPackage()
  └→ mapCrewBriefTripPackageToDutyDayInput()
      └→ buildDutyDayGeneratedBriefingPackage() (CrewBrief)
```

The handoff contract is `CrewBriefTripPackage` (defined in Dataclip) → `DutyDayGeneratedBriefingPackageInput` (defined in CrewBrief).

### Strengths of Integration

- **Clean mapper pattern**: Dataclip owns its own `CrewBriefTripPackage` type (avoids direct import of CrewBrief types)
- **Validation before invocation**: Dataclip validates the trip package before calling CrewBrief
- **Idempotent generation**: Content-hash key prevents duplicate generation
- **Warning deduplication**: Deduped before returning to Dataclip's staging layer

### Weaknesses

- **No versioned contract**: File dependency means Dataclip always runs the same CrewBrief version. No API versioning.
- **Synchronous invocation**: CrewBrief runs in the same process. Long generation blocks the HTTP server.
- **Error propagation**: If CrewBrief throws (e.g., missing aircraft profile), error propagates unhandled through Dataclip's catch-all.
- **No timeout**: `invokeCrewBriefDutyDayPackage` has no timeout safeguard.

### Recommendations (Integration)

1. **MEDIUM** — Define a stable versioned API contract between Dataclip and CrewBrief (either npm package with semver, or JSON-RPC over IPC/HTTP)
2. **MEDIUM** — Add timeout + circuit breaker around CrewBrief invocation
3. **MEDIUM** — Consider async invocation pattern with callback/polling for long-running generations
4. **LOW** — Add structured error mapping between CrewBrief error codes and Dataclip staging states

---

## Part 4: React Native App

**Status: Does not exist yet.**

No React Native application was found in the filesystem (`/opt/`, `/home/ubuntu/`). The architecture review for this component cannot be completed until source code exists.

### Recommendations

- **Create the React Native app** as a companion viewer for CrewBrief HTML briefings
- Consider these architectural decisions upfront:
  - Is it a WebView wrapper around CrewBrief's HTML output, or a native UI that renders structured briefing data?
  - If native, what's the API contract with the backend (REST vs. GraphQL vs. WebSocket)?
  - Authentication: delegate to Dataclip's auth or separate mobile auth?
  - Offline support: cache briefings locally for offline viewing?
  - Push notifications: OOOI event alerts, briefing-ready notifications?

---

## Part 5: Cross-Cutting Concerns

### Security

| Concern | Component | Severity |
|---------|-----------|----------|
| Permissive auth fallback | Dataclip | HIGH |
| No rate limiting | Dataclip | MEDIUM |
| Single debug token | Dataclip | MEDIUM |
| No XSS guard in HTML renderer | CrewBrief | LOW (HTML is server-rendered, not user-injected) |

### Observability

| Concern | Component | Severity |
|---------|-----------|----------|
| No structured logging (only console.log) | Dataclip | MEDIUM |
| No tracing or distributed context | Both | MEDIUM |
| Prometheus /metrics only | Dataclip | LOW (basic coverage exists) |
| No observability at all | CrewBrief | LOW (library, not a service) |

### Testing

| Concern | Component | Severity |
|---------|-----------|----------|
| Unit tests exist (16 test files) | Dataclip | GOOD |
| No integration tests | Dataclip | MEDIUM |
| No E2E tests | Both | MEDIUM |
| ~40-50% test coverage | CrewBrief | HIGH |
| No integration tests for full pipeline | CrewBrief | HIGH |

---

## Summary of Priority Recommendations

### Must-fix (HIGH)

1. **Dataclip:** Add graceful shutdown handler (SIGTERM/SIGINT)
2. **Dataclip:** Wrap staging operations in transaction
3. **Dataclip:** Remove permissive auth fallback for production
4. **CrewBrief:** Add input validation at public API boundaries
5. **CrewBrief:** Replace plain-text intermediate format with structured section model
6. **CrewBrief:** Add integration tests for full pipeline
7. **CrewBrief:** Split monolithic HTML renderer (1887 lines)
8. **CrewBrief:** Increase test coverage to 80%+

### Should-fix (MEDIUM)

9. Dataclip: Extract shared utility functions
10. Dataclip: Add rate limiting to webhook routes
11. Dataclip: Refactor monolithic HTTP handler (1133 lines)
12. Dataclip: Add request body schema validation (Zod)
13. Dataclip: Decouple Supabase mirror from webhook response
14. Dataclip: Add DB-level CHECK constraints
15. CrewBrief: Extract shared utilities
16. CrewBrief: Split flightCrewBriefing.ts (944 lines)
17. CrewBrief: Broaden METAR/TAF interpretation
18. CrewBrief: Extract CSS to separate file
19. Integration: Versioned API contract between Dataclip and CrewBrief
20. Integration: Timeout + circuit breaker around CrewBrief invocation

### Nice-to-have (LOW)

21. Expand timezone support, aircraft profiles, TAF site catalog
22. Clean up deprecated aliases and dead code
23. Populate empty placeholder doc files
24. Add CI pipeline configuration

---

## Questions for the Team

1. What is the relationship between the two Postmark inbound routes? Is `/webhooks/postmark/inbound` being migrated to `/api/inbound/postmark`?
2. Should the Supabase mirror be async (background queue) or is synchronous latency acceptable?
3. What are the expected production volumes (emails/min, concurrent webhooks)?
4. Is the keyword classifier a permanent solution or an MVP placeholder?
5. What is the disaster recovery plan for SQLite data? Is Supabase the durable copy?
6. How are `clients` provisioned? Direct DB manipulation or admin API?
7. Is CrewBrief intended to be a standalone npm package or always deployed with Dataclip?
8. Should the React Native app use WebView (render CrewBrief HTML) or native UI components?
