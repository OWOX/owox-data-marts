# Project Membership Requests on the New Members Page

**Status:** Approved (brainstorm) — ready for implementation planning
**Date:** 2026-05-08
**Fibery:** Add membership requests handling to the new Members page (#6529)
**Sprint:** Current (Apr 30 – May 13, 2026)
**Owner:** Yevhen Zapolskyi

---

## 1. Goal & Context

Restore project-membership-request handling on the new **Project Settings → Members** page. The new page replaced the legacy `platform.owox.com/ui/p/.../settings/members` UI but lost the **"You've received requests for project membership"** block where Project Admins could approve or decline pending requests from users asking to join the project.

The legacy page calls three direct billing endpoints from the browser:

- `GET /ui/api/billing/permissions-requests-for-admin/?project-name={projectId}`
- `POST /ui/api/billing/projects/{xProjectToken}/confirmed-permissions-requests/` (approve, form-urlencoded)
- `DELETE /ui/api/billing/permissions-requests/{requestToken}/` (decline)

The new architecture forbids talking to legacy billing directly. BI Node backend hits the Integrated-backend through chained C2C endpoints under `/idp/bi-project/{projectId}/...` (impersonated ID token, JSON bodies, no short-lived legacy JWTs leaked to BI).

Equivalent C2C contract for membership requests **does not yet exist** on the Java side. A separate ticket tracks adding `GET/POST/POST` under `/idp/bi-project/{projectId}/membership-requests`. This spec covers the **BI side** of the work and ships against a **mock** in the OWOX IDP provider — once the Java endpoints land, only the mock layer changes.

**Sibling reference flow:** the existing invite-member chain (`InviteMemberSheet` → `POST /members/invite` → `InviteProjectMemberService` → `IdpProjectionsFacade.inviteMember` → `IdentityOwoxClient`) is the structural template for everything below.

---

## 2. Scope

### In scope

- **IDP-protocol** extension: 1 new model, 3 new methods on `IdpProvider`, stubs in null-provider and idp-better-auth.
- **idp-owox-better-auth** implementation backed by a **per-request stateless mock** (no in-memory state, no env flag — see §5). Real HTTP wiring is added now but lives behind the same client-method shape so the eventual swap-in is local.
- **Backend** (apps/backend): 3 use-cases, 1 facade extension, 1 controller-method group on the existing `project-members.controller.ts`, DTOs, mappers, specs.
- **Web** (apps/web): pending-requests **table** above the existing members table on the Members tab (admin-only, hidden when empty), approve/decline **sheet** with the same form body as `InviteMemberSheet` (role + role scope + selected contexts) but two header buttons (Approve / Decline) — i.e. the legacy header buttons + the new full-fidelity invite form body.
- Optimistic removal of the row after approve/decline; refresh of members list after approve.
- Component / E2E tests scoped to mock data; staging verification deferred to the real-API ticket.
- Changeset.

### Out of scope

- New UI on the **legacy** page — not touched, must keep working.
- Real Java endpoints for membership requests — covered by sibling Java ticket.
- New permissions model — admin-only is preserved (matches legacy).
- Real-time updates / polling / sockets. List is fetched once on mount and re-fetched after a mutation.
- "Accepted user appears in members list without manual page reload" DoD criterion — verifiable **only on real API**. The mock is intentionally stateless (§5), so locally an approved user does **not** show up in `getProjectMembers`. Verified visually on staging once the Java contract ships.
- Email/notification delivery — owned by Java.
- Bulk approve/decline.
- Decommissioning the legacy page — out until product confirms deprecation. The legacy page must keep working in parallel.

---

## 3. Architecture overview

```text
[apps/web]
  ProjectSettingsPage (state for sheets, tombstones)
   └─ MembersSettingsProvider  (members + pendingRequests + refresh)
       └─ MembersTab
           ├─ <PendingRequestsSection>  ← new, admin-only, hidden when empty
           │    └─ <PendingRequestsTable> (BaseTable + TanStack columns)
           ├─ <MembersTable> (existing)
           └─ <MembershipRequestSheet> ← new, opened on row click

  features/project-members/services/project-members.service.ts
     getMembershipRequests / approveMembershipRequest / declineMembershipRequest

  features/project-settings/members/components/MemberFormFields/  ← extracted primitive
     RoleRadioCards + RoleScopeSelect + ContextsCheckboxList
     reused by InviteMemberSheet, MembershipRequestSheet, (later) MemberDetailsSheet

[apps/backend]
  data-marts/controllers/project-members.controller.ts
     GET    /members/requests
     POST   /members/requests/:requestId/approve
     POST   /members/requests/:requestId/decline

  data-marts/use-cases/project-members/
     list-membership-requests.service.ts
     approve-membership-request.service.ts   ← post-step: ContextAccessService.updateMember
     decline-membership-request.service.ts

  idp/facades/idp-projections.facade.ts          (+3 methods)
  idp/services/idp-projections.service.ts        (+3 methods, throws-or-empty per provider)

[packages/idp-protocol]
  types/models.ts        + ProjectMembershipRequest
  types/provider.ts      + listMembershipRequests / approveMembershipRequest / declineMembershipRequest
  providers/null-provider.ts   list → []   approve/decline → IdpOperationNotSupportedError

[packages/idp-better-auth]
  providers/better-auth-provider.ts   list → []   approve/decline → IdpOperationNotSupportedError

[packages/idp-owox-better-auth]
  client/IdentityOwoxClient.ts                  (+3 HTTP methods, real C2C URLs)
  services/core/membership-requests-service.ts  ← new, mocked for now (§5)
  owox-better-auth-idp.ts                       (+3 delegations)
```

**Data flow on approve (full path):**

1. Admin clicks **Approve request** on `MembershipRequestSheet` with chosen `role`, `roleScope`, `contextIds`.
2. Web → `POST /members/requests/:requestId/approve` `{ role, roleScope, contextIds }`.
3. Backend `ApproveMembershipRequestService.run()`:
    a. Validates `contextIds` exist (reuse `ContextService` validator).
    b. Calls `IdpProjectionsFacade.approveMembershipRequest(projectId, requestId, role, actor)` → returns `{ userId }` (or just resolves; see §4.1 for the chosen return shape).
    c. Calls `ContextAccessService.updateMember(userId, { roleScope, contextIds })` to apply scope/contexts on the BI side. **Same pattern as `InviteProjectMemberService`.**
4. Web `await` resolves → `optimisticRemoveRequest(requestId)` + `refresh()` → toast "Request approved".

**Data flow on decline:**

1. Admin clicks **Decline request** in the sheet header → `ConfirmationDialog` → confirm.
2. Web → `POST /members/requests/:requestId/decline` `{ reason? }` (no reason field in MVP UI; param reserved).
3. Backend `DeclineMembershipRequestService.run()` → `IdpProjectionsFacade.declineMembershipRequest`.
4. Web → `optimisticRemoveRequest(requestId)` + toast "Request declined".

---

## 4. Layer-by-layer design

### 4.1 IDP-protocol (`packages/idp-protocol`)

**`types/models.ts`** — add:

```ts
export type ProjectMembershipRequest = {
  requestId: string;          // stable id from Java; opaque to BI
  email: string;
  fullName?: string;
  avatar?: string;
  userId?: string;            // present if requester already exists in IDP
  requestedRole: Role;
  createdAt: string;          // ISO
  status: 'pending';
};

export type ApproveMembershipRequestResult = {
  userId: string;             // needed so backend can chain ContextAccessService.updateMember
  email: string;
  role: Role;
};
```

**`types/provider.ts`** — add three methods to `IdpProvider`:

```ts
listMembershipRequests(
  projectId: string,
  options?: { forceFresh?: boolean }
): Promise<ProjectMembershipRequest[]>;

approveMembershipRequest(
  projectId: string,
  requestId: string,
  role: Role,
  actorUserId: string,
): Promise<ApproveMembershipRequestResult>;

declineMembershipRequest(
  projectId: string,
  requestId: string,
  actorUserId: string,
  reason?: string,
): Promise<void>;
```

**`providers/null-provider.ts`** — `listMembershipRequests` → `[]`; approve/decline → `IdpOperationNotSupportedError(<methodName>)`.

**Exports** — re-export `ProjectMembershipRequest` and `ApproveMembershipRequestResult` from `index.ts`.

### 4.2 idp-better-auth (`packages/idp-better-auth`)

`better-auth-provider.ts` — same pattern as null-provider: list → `[]`, approve/decline → `IdpOperationNotSupportedError`. Local Better-Auth deployments don't have a remote membership-request inbox; this is consistent with current treatment of `inviteMember` (which returns a magic link instead of throwing only because the local DB can satisfy it).

### 4.3 idp-owox-better-auth (`packages/idp-owox-better-auth`)

**`services/core/membership-requests-service.ts`** — new file, sibling to `project-members-service.ts`. Wraps `IdentityOwoxClient`. **For MVP it is mocked**: see §5.

**`client/IdentityOwoxClient.ts`** — three methods sharing the `${clientBackchannelPrefix}/idp/bi-project/{projectId}/membership-requests` URL pattern (mirrors `…/members`):

```http
GET   {prefix}/idp/bi-project/{projectId}/membership-requests
POST  {prefix}/idp/bi-project/{projectId}/membership-requests/{requestId}/approve   { biUserId, role }
POST  {prefix}/idp/bi-project/{projectId}/membership-requests/{requestId}/decline   { biUserId, reason? }
```

**These methods are written but never called yet** — the service short-circuits to mock data (§5). Once the Java endpoints land, the service deletes the mock branch and starts calling these methods.

**`owox-better-auth-idp.ts`** — delegate the three new provider methods to `MembershipRequestsService`.

### 4.4 Backend (`apps/backend`)

**Controller** (`data-marts/controllers/project-members.controller.ts`):

```text
@Auth(Role.admin(Strategy.INTROSPECT))
GET    /members/requests                                 → ListMembershipRequestsService
@Auth(Role.admin(Strategy.INTROSPECT))
POST   /members/requests/:requestId/approve              → ApproveMembershipRequestService
@Auth(Role.admin(Strategy.INTROSPECT))
POST   /members/requests/:requestId/decline              → DeclineMembershipRequestService
```

**DTOs** (mirror existing `project-members` DTOs):

- `MembershipRequestApiDto` — `{ requestId, email, fullName?, avatar?, userId?, requestedRole, createdAt }`.
- `ApproveMembershipRequestApiDto` (request body) — `{ role, roleScope?, contextIds? }`.
- `ApproveMembershipRequestResponseApiDto` — `{ userId, email, role, roleScope, contextIds }`.
- `DeclineMembershipRequestApiDto` — `{ reason? }`.

**Use-cases** (`data-marts/use-cases/project-members/`):

- **`list-membership-requests.service.ts`** — `run(projectId)` → `IdpProjectionsFacade.listMembershipRequests(projectId)`. No business logic.
- **`approve-membership-request.service.ts`** — mirrors `InviteProjectMemberService`:
   1. Infer `roleScope`: if `role === admin` → `ENTIRE_PROJECT` (admins always have project-wide access); else if `contextIds?.length > 0` → `SELECTED_CONTEXTS`; else → `ENTIRE_PROJECT`. **Identical rule to `InviteProjectMemberService`**, lifted as-is.
   2. Validate `contextIds` via `ContextService` if scope is `SELECTED_CONTEXTS`.
   3. Call `IdpProjectionsFacade.approveMembershipRequest(projectId, requestId, role, actor)` → `{ userId }`.
   4. Call `ContextAccessService.updateMember(userId, { roleScope, contextIds })`.
   5. Return `{ userId, email, role, roleScope, contextIds }` for client convenience.
- **`decline-membership-request.service.ts`** — `IdpProjectionsFacade.declineMembershipRequest(projectId, requestId, actor, reason?)`. No post-step.

**Facade / projections** — `idp-projections.facade.ts` and `idp-projections.service.ts` get one trivial pass-through method per use-case. `IdpOperationNotSupportedError` continues to map to HTTP 501 via existing exception filter.

**Specs** — one `*.service.spec.ts` per use-case (mock facade + ContextAccessService), following `invite-project-member.service.spec.ts` style.

### 4.5 Web (`apps/web`)

**`features/project-members/types/index.ts`** — add `MembershipRequestDto`, `ApproveMembershipRequestPayload`, `ApproveMembershipRequestResult`, `DeclineMembershipRequestPayload`.

**`features/project-members/services/project-members.service.ts`** — three new methods on the existing `ApiService('/members')` instance:

```ts
getMembershipRequests(): Promise<MembershipRequestDto[]>
approveMembershipRequest(requestId, payload): Promise<ApproveMembershipRequestResult>
declineMembershipRequest(requestId, payload): Promise<void>
```

**`features/project-settings/members/model/members-settings.context.ts`** — extend `MembersSettingsStoreValue`:

```ts
pendingRequests: MembershipRequestDto[];
loadingRequests: boolean;
optimisticRemoveRequest: (requestId: string) => void;
openMembershipRequestSheet: (request: MembershipRequestDto) => void;
```

`refresh()` is updated to `Promise.all([getMembers(), getMembershipRequests()])`. Tombstones for requests reuse the `Set<string>` pattern already proven on members.

**`pages/project-settings/ProjectSettingsPage.tsx`**:

- Owns sheet state (`requestSheetTarget`).
- Mounts `<MembershipRequestSheet>` at the page root, like the other sheets.
- Passes `openMembershipRequestSheet`, `optimisticRemoveRequest` into the provider.
- On admin === false, request fetching and section rendering are no-ops.

**`features/project-settings/members/components/MemberFormFields/`** — **new shared primitive**, extracted from `InviteMemberSheet` body. Encapsulates `RoleRadioCards` + `RoleScopeSelect` + `ContextsCheckboxList` + their cross-field rules (admin role forces entire-project scope; non-admin + selected-contexts shows checkbox list). Consumed by both `InviteMemberSheet` and `MembershipRequestSheet`. Pure presentational; consumes a react-hook-form `useFormContext` instance.

**`features/project-settings/members/components/PendingRequestsSection/`** — new, `PendingRequestsSection.tsx` + `PendingRequestsTable/columns.tsx`:

- Section title: "You've received requests for project membership" (legacy copy).
- Renders `null` when `!isAdmin || pendingRequests.length === 0` (DoD: hidden when empty).
- Uses `BaseTable` with TanStack columns:
  - **REQUESTER** — avatar + email + fullName fallback (sortable).
  - **REQUESTED ROLE** — role badge using `getRoleDisplayName` (sortable).
  - **REQUESTED AT** — `createdAt` (sortable, formatted via existing date util).
  - **ACTIONS** — button "Manage request" (mirrors legacy CTA), opens sheet.
- Loading state: skeleton rows like `MembersTable`.
- Error state: in-section error banner with a Retry button (calls `refresh()`); never throws to ErrorBoundary.

**`features/project-settings/members/components/MembershipRequestSheet/MembershipRequestSheet.tsx`** — new. Layout:

- **Header:** title `Request from {email}`, two action buttons: `Decline request` (outline destructive) and `Approve request` (primary).
- **Body:** `MemberFormFields` primitive with `defaultValues = { role: request.requestedRole, roleScope: 'entire_project' }` and an `additionalInfo` slot that surfaces "User requested {requestedRole}" copy + a help-link.
- **Decline button:** opens `ConfirmationDialog` (existing) with copy "Decline request from {email}? They will be notified the request was rejected." On confirm → `declineMembershipRequest` → optimistic remove + close sheet + toast.
- **Approve button:** validates form → `approveMembershipRequest` → optimistic remove + close sheet + `refresh()` (so members list pulls in the new user once the real API ships) + toast "Request approved".
- Loading: both header buttons disabled with spinner on the active one. Form fields disabled during submit.
- Errors: inline error bar at the top of the sheet body. Sheet stays open so the user can retry.
- Sheet closes via `X` only when not submitting.

**Translations / styles** — match existing Members components: hardcoded English copy (no i18n in this feature, per existing convention), all primitives from `@owox/ui/components`, `lucide-react` icons (`UserCheck`, `UserX`, `Clock`).

---

## 5. Mock strategy (per-request, stateless)

> **Update (branch `feature/membership-requests`):** The Java Integrated-backend shipped the
> `GET/POST/POST` endpoints under `/internal-api/idp/bi-project/{projectId}/membership-requests`.
> `MembershipRequestsService` has been swapped to real `IdentityOwoxClient` calls with Zod-validated
> responses. The mock described below is no longer active; this section is kept as an accurate
> record of the approach used before the Java endpoints landed.

**Decision:** `MembershipRequestsService` (in idp-owox-better-auth) returns mocked data per call **without any in-memory state**.

- `listMembershipRequests(projectId)` → static array of 2 fixed-shape requests, derived from `projectId` (stable across calls). Examples: `requestId = "mock-req-1"`, `email = "alice@example.com"`, `requestedRole = "viewer"`, `createdAt = "2026-05-01T10:00:00Z"`.
- `approveMembershipRequest(...)` → resolves with `{ userId: "mock-user-${requestId}", email, role }`. **No state mutation.** Re-listing returns the same 2 requests.
- `declineMembershipRequest(...)` → resolves `void`. Same caveat.

**Consequence — local visibility (acknowledged):**

- After approve, the request **does** disappear from the UI list because of the frontend optimistic-remove tombstone Set held in `MembersSettingsProvider`. Tombstones live for the lifetime of the provider (i.e. until the user navigates off Project Settings).
- After a full page reload (or navigating back to Members), the same 2 mock requests reappear because the mock is intentionally stateless. This is acceptable for local development and is called out in the PR description.
- The DoD criterion "Accepted user appears in members list without manual page reload" is verified **only on staging with the real API** (the post-step `ContextAccessService.updateMember` requires a real userId from Java to be observable in `getProjectMembers`). This is documented in the PR description; manual staging verification is the gate.

**Why not seed-and-state in-memory:**

- No persistence cost vs. complexity tradeoff worth it: real API is days away.
- Avoids an extra dimension of "which env starts with state, which doesn't" when the real API replaces the mock.
- A dev-time toggle is unnecessary: per-request mock returns plausible data on every restart, and tests use their own mocks regardless.

**No env flag.** When the real API ships, the change is a single edit in `MembershipRequestsService` to call `IdentityOwoxClient` instead of returning mock data. Tests at the IDP-provider level pin that contract.

---

## 6. Permissions

- **All three endpoints:** `@Auth(Role.admin(Strategy.INTROSPECT))` on the controller. Matches legacy.
- **Controller-level guard is the source of truth** (consistent with existing `invite`, `update`, `remove`).
- **Self-protection invariant** (`actor !== request.userId`) is enforced on the Java side once the real API ships (out of scope here). For the mock period, the invariant is irrelevant because mock requests never share an email with the actor.
- **Frontend** hides `PendingRequestsSection` for non-admins (`isAdmin === false`). Backend will still 403 if a non-admin somehow calls the endpoint.

---

## 7. Empty / loading / error states

| State                                  | Behavior                                                                |
|----------------------------------------|-------------------------------------------------------------------------|
| Loading (`loadingRequests === true`)   | Skeleton rows in `PendingRequestsTable`. Section visible.               |
| No requests (`pendingRequests.length === 0`) | Section hidden completely (DoD).                                  |
| Fetch error                            | Section visible with inline error banner + Retry. Members list unaffected. |
| Approve / decline error                | Sheet stays open, inline error banner at top. Buttons re-enabled.       |
| Non-admin                              | Section never rendered. Endpoints return 403 if hit directly.           |

---

## 8. Tests

### Backend (apps/backend)

- `list-membership-requests.service.spec.ts` — happy path + facade throws.
- `approve-membership-request.service.spec.ts` — happy path; admin-role auto-scopes; selected-contexts validates ids; `ContextAccessService.updateMember` called with the userId from facade; facade throws → propagates.
- `decline-membership-request.service.spec.ts` — happy + facade throws.
- `idp-projections.facade.spec.ts` — extend with the three pass-throughs.

### IDP-protocol / providers

- `null-provider`: list → `[]`; approve/decline → throws `IdpOperationNotSupportedError`.
- `idp-better-auth`: same.
- `idp-owox-better-auth/MembershipRequestsService`: returns mock shape; spec is the contract pin so the real-API swap-in cannot accidentally change the response shape.

### Web (vitest + RTL)

- `PendingRequestsSection`:
  - renders rows when admin + non-empty,
  - returns `null` when `!isAdmin`,
  - returns `null` when empty,
  - shows error banner when `loadingRequests === false && error != null`,
  - clicking a row opens the sheet (verified via context spy).
- `MembershipRequestSheet`:
  - default `role === request.requestedRole`,
  - approve calls service with `{ role, roleScope, contextIds }`,
  - decline shows `ConfirmationDialog`, on confirm calls service,
  - approve error keeps sheet open with banner.
- `MembersSettingsProvider` already has tests; extend them to assert `pendingRequests` and `optimisticRemoveRequest` semantics.

### E2E (Playwright, against mock)

- Seed mock to return 1 fixed pending request.
- Admin opens Members → sees `Pending requests` section with 1 row.
- Click row → sheet opens with `role` defaulted to requested role.
- Click Approve → sheet closes, row disappears from section, toast appears.
- Reload → row comes back (mock is stateless — explicitly asserted as "expected, mock-only").
- Click Decline → ConfirmationDialog → Confirm → row disappears + toast.
- Switch to non-admin user → section is not visible.

Skipped E2E coverage (deferred to staging verification with real API):

- "Approved user appears in the members list."

---

## 9. Risks & open questions

| Risk | Mitigation |
|------|------------|
| Java contract diverges from our spec on `requestId` shape (e.g. they ship JWT-only, no stable id) | The sibling Java ticket lists "stable `requestId`" as a DoD item. If they push back, we add a thin id-extraction adapter inside `MembershipRequestsService` (single file). |
| `ContextAccessService.updateMember` has a different shape than we assume | The invite use-case uses the same call, so signature is locked. Verified by reading `InviteProjectMemberService`. |
| Header buttons in a `Sheet` not previously used in this codebase | Confirmed via screenshot of legacy. `Sheet` from `@owox/ui` accepts a custom header slot — verified during architecture exploration. |
| `MemberFormFields` extraction breaks `InviteMemberSheet` styling / behavior | Refactor first, port `InviteMemberSheet` to use it, run existing tests; only then add `MembershipRequestSheet`. Ordered as commit #5 in §11. |
| Mock UX confusion (admin tries to "approve" same request twice after reload) | PR description and section help text note "mock data — staging shows real behavior". Covered in §5. |

---

## 10. Sequence of commits (atomic)

1. `feat(idp-protocol): add membership requests model + provider methods + null stubs`
2. `feat(idp-better-auth): not-implemented stubs for membership requests`
3. `feat(idp-owox-better-auth): membership requests service with stateless per-request mock; HTTP client methods staged for real API`
4. `feat(backend): membership requests use-cases, facade extension, controller routes, DTOs, specs`
5. `refactor(web): extract MemberFormFields primitive from InviteMemberSheet`
6. `feat(web): pending requests section + membership request sheet on Project Settings → Members`
7. `test(web): component + provider tests`
8. `test(e2e): membership-requests playwright spec`
9. `chore: changeset`

Each commit is independently reviewable and reverts cleanly.
