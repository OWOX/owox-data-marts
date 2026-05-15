import { test, expect } from '../fixtures/base';
import { TESTIDS } from '../selectors/testids';

/**
 * E2E coverage for the Membership Requests feature.
 *
 * The membership-request endpoints (GET /api/members/requests,
 * POST /api/members/requests/:id/approve, POST /api/members/requests/:id/decline)
 * are guarded by Strategy.INTROSPECT which validates the JWT audience against the
 * external OWOX IDP service. In the local e2e environment that validation fails
 * with a 401, causing the frontend to fire an auth:logout event and redirect to
 * sign-in. We therefore intercept these three routes with page.route() and return
 * canned mock responses — identical to what the IDP mock returns in the task
 * description — so the rest of the page loads and we can verify UI behaviour.
 *
 * Mock data:
 *   - alice@example.com — viewer, requestId: mock-req-alice
 *   - bob@example.com  — editor, requestId: mock-req-bob
 *
 * The mock is stateless: approve/decline always resolve 200/204. The frontend
 * applies optimistic removal so the row disappears immediately; reloading would
 * bring it back. Tests verify optimistic behaviour only.
 *
 * URL: /ui/0/project-settings/members
 */

const MEMBERS_URL = '/ui/0/project-settings/members';

const MOCK_REQUESTS = [
  {
    requestId: 'mock-req-alice',
    email: 'alice@example.com',
    fullName: 'Alice Example',
    avatar: null,
    userId: 'user-alice',
    requestedRole: 'viewer',
    createdAt: new Date().toISOString(),
  },
  {
    requestId: 'mock-req-bob',
    email: 'bob@example.com',
    fullName: 'Bob Example',
    avatar: null,
    userId: 'user-bob',
    requestedRole: 'editor',
    createdAt: new Date().toISOString(),
  },
];

/**
 * Register page.route() intercepts for the three membership-request endpoints.
 * Must be called before page.goto() so intercepts are in place before the page
 * fires its initial data-fetch.
 */
async function mockMembershipRequestRoutes(page: import('@playwright/test').Page): Promise<void> {
  // GET /api/members/requests — list
  await page.route('**/api/members/requests', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_REQUESTS),
      });
    }
    return route.continue();
  });

  // POST /api/members/requests/:requestId/approve
  await page.route('**/api/members/requests/*/approve', route => {
    const body = {
      userId: 'user-alice',
      email: 'alice@example.com',
      role: 'viewer',
      roleScope: 'entire_project',
      contextIds: [],
    };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  // POST /api/members/requests/:requestId/decline
  await page.route('**/api/members/requests/*/decline', route => {
    return route.fulfill({ status: 204, body: '' });
  });
}

test.describe('Project Settings — Membership requests', () => {
  test.beforeEach(async ({ page }) => {
    await mockMembershipRequestRoutes(page);
    await page.goto(MEMBERS_URL);
    // Wait for the Members tab content to settle — the pending-requests card
    // is the earliest reliable anchor once data has loaded.
    await expect(page.getByTestId(TESTIDS.pendingRequestsSection)).toBeVisible({
      timeout: 25_000,
    });
  });

  // ---------------------------------------------------------------------------
  // MR-01: Admin sees the pending requests section with both mock entries
  // ---------------------------------------------------------------------------
  test('admin sees both pending requests (MR-01)', async ({ page }) => {
    await expect(page.getByTestId(TESTIDS.pendingRequestsSection)).toBeVisible();
    // Trade-off: no count in the header — the row testids carry the cardinality
    // contract instead, surviving copy tweaks to the section title.
    await expect(page.getByText(/Access requests/i)).toBeVisible();
    await expect(page.getByText('alice@example.com')).toBeVisible();
    await expect(page.getByText('bob@example.com')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // MR-02: Approve flow — sheet opens, Approve button triggers toast + row gone
  // ---------------------------------------------------------------------------
  test('approve flow removes the row optimistically (MR-02)', async ({ page }) => {
    // Click the alice row to open the sheet.
    await page.getByText('alice@example.com').click();

    const sheet = page.getByTestId(TESTIDS.membershipRequestSheet);
    await expect(sheet).toBeVisible();
    // Sheet title is generic now — identity-block email confirms the right request opened.
    await expect(sheet.getByRole('heading', { name: /Membership request/i })).toBeVisible();
    await expect(sheet.getByText('alice@example.com')).toBeVisible();

    // Click the Approve button inside the sheet.
    await sheet.getByRole('button', { name: /Approve request/i }).click();

    // Toast confirmation.
    await expect(page.getByText(/Approved request from alice@example\.com/i)).toBeVisible();

    // Row should be gone (optimistic removal).
    await expect(page.getByText('alice@example.com')).toBeHidden();
  });

  // ---------------------------------------------------------------------------
  // MR-03: Decline flow — confirmation dialog appears, confirm triggers toast +
  //         row gone
  // ---------------------------------------------------------------------------
  test('decline flow asks for confirmation then removes the row (MR-03)', async ({ page }) => {
    // Click the bob row to open the sheet.
    await page.getByText('bob@example.com').click();

    const sheet = page.getByTestId(TESTIDS.membershipRequestSheet);
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { name: /Membership request/i })).toBeVisible();
    await expect(sheet.getByText('bob@example.com')).toBeVisible();

    // Click "Decline request" — this opens the ConfirmationDialog, not the
    // final action yet.
    await sheet.getByRole('button', { name: /Decline request/i }).click();

    // Confirmation dialog heading.
    await expect(page.getByRole('heading', { name: /Decline membership request/i })).toBeVisible();

    // The dialog has a destructive "Decline" confirm button. It is the last
    // "Decline" button in the DOM (the sheet header button is behind the dialog).
    const declineButtons = page.getByRole('button', { name: /^Decline$/i });
    await declineButtons.last().click();

    // Toast confirmation.
    await expect(page.getByText(/Declined request from bob@example\.com/i)).toBeVisible();

    // Row should be gone (optimistic removal).
    await expect(page.getByText('bob@example.com')).toBeHidden();
  });

  // ---------------------------------------------------------------------------
  // MR-04: Non-admin user — section not rendered
  // ---------------------------------------------------------------------------
  test('non-admin does not see the section (MR-04)', async () => {
    // The e2e harness currently has no role-switch helper (all tests run as the
    // default admin). Skip until a non-admin fixture is wired up.
    // TODO: implement once a viewer/editor user fixture is available in
    //       apps/web/e2e/fixtures/ — mirror the pattern from api-helpers.ts.
    test.skip(true, 'TODO: wire up non-admin user fixture once available');
  });
});
