import { test, expect } from '../fixtures/base';

test('saves a Credential from the setup link and returns its exact ID', async ({
  page,
}, testInfo) => {
  const started = await page.request.post('/api/credential-setup', {
    headers: { 'x-owox-authorization': 'accessToken' },
    data: { definitionId: 'databricks-token', title: 'Browser setup account' },
  });
  expect(started.status()).toBe(201);
  const setup = await started.json();
  await page.goto(`/ui/0/connect/credentials/${setup.id}`);
  await expect(page.getByRole('heading', { name: 'Add Credential', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('credential-setup-form.png'), fullPage: true });
  await expect(page.getByPlaceholder('Enter Credential name')).toHaveValue('Browser setup account');
  await page.getByLabel('Personal access token', { exact: true }).fill('browser-test-token');

  const saved = page.waitForResponse(
    response =>
      response.url().endsWith('/api/credentials') && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const savedResponse = await saved;
  expect(savedResponse.status()).toBe(201);
  const credential = await savedResponse.json();
  await expect(page.getByRole('heading', { name: 'Credential saved' })).toBeVisible();

  const status = await page.request.get(`/api/credential-setup/${setup.id}`);
  expect(status.ok()).toBeTruthy();
  expect(await status.json()).toMatchObject({ status: 'completed', credentialId: credential.id });
  expect(credential).toMatchObject({ availableForUse: false, availableForMaintenance: false });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Credential saved' })).toBeVisible();
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
]) {
  test(`keeps long service account JSON and form actions within the viewport (${viewport.width}px)`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const projectTitle = 'Marketing project with a long name for several regional teams';
    await page.route('**/auth/api/user', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...(await response.json()), projectTitle } });
    });
    const started = await page.request.post('/api/credential-setup', {
      headers: { 'x-owox-authorization': 'accessToken' },
      data: { definitionId: 'google-service-account' },
    });
    expect(started.status()).toBe(201);
    const setup = await started.json();
    await page.goto(`/ui/0/connect/credentials/${setup.id}`);
    await expect(page.getByText('Project:', { exact: true })).toBeVisible();
    await expect(page.getByTitle(projectTitle, { exact: true })).toBeInViewport({ ratio: 1 });
    const input = page.getByPlaceholder('Paste the service account JSON key or drop the file');
    const json = JSON.stringify(
      {
        type: 'service_account',
        project_id: 'preview-project',
        private_key: 'not-a-real-key',
        client_email: 'preview@preview-project.iam.gserviceaccount.com',
        notes: Array.from({ length: 80 }, (_, index) => `Preview line ${index}`),
      },
      null,
      2
    );
    await input.fill(json);
    await page.screenshot({
      path: testInfo.outputPath('long-service-account-form.png'),
      fullPage: true,
    });
    const bounds = await input.boundingBox();
    expect(bounds!.height).toBeLessThanOrEqual(256);
    expect(await input.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport({
      ratio: 1,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width
    );
    await expect(input).toHaveValue(json);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Setup cancelled' })).toBeVisible();
  });
}

test('cancels setup without creating a Credential', async ({ page }) => {
  const started = await page.request.post('/api/credential-setup', {
    headers: { 'x-owox-authorization': 'accessToken' },
    data: { definitionId: 'databricks-token' },
  });
  expect(started.status()).toBe(201);
  const setup = await started.json();
  await page.goto(`/ui/0/connect/credentials/${setup.id}`);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Setup cancelled' })).toBeVisible();
  const status = await page.request.get(`/api/credential-setup/${setup.id}`);
  expect(await status.json()).toMatchObject({ status: 'cancelled', credentialId: null });
});

for (const connectPath of ['/ui/0/connect', '/UI/0/connect', '/%75i/0/%63onnect']) {
  test(`does not retry a save in another project from ${connectPath}`, async ({ page }) => {
    const started = await page.request.post('/api/credential-setup', {
      headers: { 'x-owox-authorization': 'accessToken' },
      data: { definitionId: 'databricks-token' },
    });
    expect(started.status()).toBe(201);
    const setup = await started.json();
    const setupPath = `/ui/0/connect/credentials/${setup.id}`;
    let createAttempts = 0;
    let refreshedProjectChanged = false;

    await page.route('**/api/credentials', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      createAttempts++;
      refreshedProjectChanged = true;
      await route.fulfill({ status: 401, json: { message: 'Access token expired' } });
    });
    await page.route('**/auth/api/user', async route => {
      if (!refreshedProjectChanged) return route.continue();
      const response = await route.fetch();
      await route.fulfill({
        response,
        json: { ...(await response.json()), projectId: 'another-project' },
      });
    });
    await page.route('**/auth/sign-in?*', route =>
      refreshedProjectChanged
        ? route.fulfill({ contentType: 'text/html', body: '<h1>Project switch requested</h1>' })
        : route.continue()
    );

    await page.goto(`${connectPath}/credentials/${setup.id}`);
    await page.getByPlaceholder('Enter Credential name').fill('Stay in the original project');
    await page.getByLabel('Personal access token', { exact: true }).fill('browser-test-token');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Project switch requested' })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('projectId')).toBe('0');
    expect(createAttempts).toBe(1);
    expect(await page.evaluate(() => sessionStorage.getItem('owox_auth_redirect_url'))).toBe(
      setupPath
    );
  });
}

test('does not retry a save with another account in the same project', async ({ page }) => {
  const started = await page.request.post('/api/credential-setup', {
    headers: { 'x-owox-authorization': 'accessToken' },
    data: { definitionId: 'databricks-token' },
  });
  expect(started.status()).toBe(201);
  const setup = await started.json();
  const setupPath = `/ui/0/connect/credentials/${setup.id}`;
  let createAttempts = 0;
  let refreshedAccountChanged = false;

  await page.route('**/api/credentials', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    createAttempts++;
    refreshedAccountChanged = true;
    await route.fulfill({ status: 401, json: { message: 'Access token expired' } });
  });
  await page.route('**/auth/api/user', async route => {
    if (!refreshedAccountChanged) return route.continue();
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), userId: 'another-user' },
    });
  });
  await page.goto(setupPath);
  await page.getByPlaceholder('Enter Credential name').fill('Stay with the original account');
  await page.getByLabel('Personal access token', { exact: true }).fill('browser-test-token');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Setup account changed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out and switch account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  expect(createAttempts).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem('owox_auth_redirect_url'))).toBe(
    setupPath
  );
});

test('allows retrying or leaving setup when sign-in keeps returning another project', async ({
  page,
}) => {
  await page.request.get('/auth/sign-in?projectId=0');
  const started = await page.request.post('/api/credential-setup', {
    headers: { 'x-owox-authorization': 'accessToken' },
    data: { definitionId: 'databricks-token' },
  });
  expect(started.status()).toBe(201);
  const setup = await started.json();
  const setupPath = `/ui/0/connect/credentials/${setup.id}?source=chat#form`;
  let signInAttempts = 0;
  let createAttempts = 0;

  await page.route('**/auth/api/user', async route => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), projectId: 'another-project' },
    });
  });
  await page.route('**/auth/sign-in?*', async route => {
    signInAttempts++;
    await route.continue();
  });
  await page.route('**/api/credentials', async route => {
    if (route.request().method() === 'POST') createAttempts++;
    await route.continue();
  });

  const projectSwitch = page.waitForResponse(
    response => new URL(response.url()).pathname === '/auth/sign-in' && response.status() === 302
  );
  await page.goto(setupPath);
  await projectSwitch;
  await expect(page.getByRole('heading', { name: 'Setup project unavailable' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to setup project' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  expect(createAttempts).toBe(0);
  expect(signInAttempts).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem('owox_auth_redirect_url'))).toBeNull();

  const retryRequest = page.waitForRequest(
    request => new URL(request.url()).pathname === '/auth/sign-in'
  );
  const setupUrl = new URL(setupPath, page.url()).toString();
  const retryReturn = page.waitForEvent(
    'framenavigated',
    frame => frame === page.mainFrame() && frame.url() === setupUrl
  );
  await page.getByRole('button', { name: 'Switch to setup project' }).click();
  expect(new URL((await retryRequest).url()).searchParams.get('projectId')).toBe('0');
  await retryReturn;
  await expect(page.getByRole('heading', { name: 'Setup project unavailable' })).toBeVisible();
  await expect(page).toHaveURL(setupUrl);
  expect(signInAttempts).toBe(2);
  expect(createAttempts).toBe(0);

  await page.goto('/');
  await expect(page).toHaveURL(/\/ui\/another-project\/data-marts$/);
  await expect(page.getByRole('heading', { name: 'Setup project unavailable' })).toHaveCount(0);
  expect(signInAttempts).toBe(2);
});
