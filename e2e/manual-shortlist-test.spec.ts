import { test, expect } from '@playwright/test';

// Manual test for shortlist flow
test('Add candidate to shortlist flow', async ({ page }) => {
  // Collect console errors
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(`PageError: ${err.message}`));

  // Listen for API responses
  const apiResponses: { url: string; status: number; body: string }[] = [];
  page.on('response', async res => {
    if (res.url().includes('/api/')) {
      try {
        const body = await res.text();
        apiResponses.push({ url: res.url(), status: res.status(), body: body.substring(0, 500) });
      } catch {}
    }
  });

  // Step 1: Navigate to login page
  await page.goto('http://localhost:3002');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/step1-login-page.png', fullPage: true });
  console.log('Step 1: Login page loaded. URL:', page.url());

  // Step 2: Fill in login credentials using type for React controlled inputs
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');

  await emailInput.click();
  await emailInput.fill('');
  await emailInput.type('admin@em-box.com', { delay: 30 });

  await passwordInput.click();
  await passwordInput.fill('');
  await passwordInput.type('admin123', { delay: 30 });

  await page.screenshot({ path: '/tmp/step2-filled-login.png', fullPage: true });

  // Click the login button
  const loginButton = page.locator('button[type="submit"]');
  await loginButton.click();

  // Wait for navigation after login
  await page.waitForTimeout(5000);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/step3-after-login.png', fullPage: true });
  console.log('Step 2: After login. URL:', page.url());
  console.log('Page title:', await page.title());

  // Check if we are still on login page
  const pageText = await page.locator('body').innerText();
  if (pageText.includes('欢迎回来') || pageText.includes('登录')) {
    console.log('WARNING: Still on login page after login attempt!');
    // Check for error messages
    const errorEl = page.locator('.text-red-600');
    if (await errorEl.isVisible()) {
      console.log('Login error message:', await errorEl.textContent());
    }
    // Check API responses
    console.log('API responses during login:', JSON.stringify(apiResponses, null, 2));
    // Check console errors
    console.log('Console errors during login:', consoleErrors);
    return;
  }

  // Step 3: Navigate to candidate search page (/search)
  await page.goto('http://localhost:3002/search');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/step4-candidate-search.png', fullPage: true });
  console.log('Step 3: On candidate search page. URL:', page.url());

  const searchPageText = await page.locator('body').innerText();
  console.log('Page contains "候选人搜索":', searchPageText.includes('候选人搜索'));

  // Step 4: Select a project from dropdown
  const projectSelect = page.locator('select').first();
  await page.waitForTimeout(1000);

  const allSelects = page.locator('select');
  const selectCount = await allSelects.count();
  console.log('Number of select elements:', selectCount);

  if (selectCount > 0) {
    // Get project options
    const projectOptions = await projectSelect.locator('option').allTextContents();
    console.log('Project options:', projectOptions);

    if (projectOptions.length > 1) {
      await projectSelect.selectOption({ index: 1 });
      await page.waitForTimeout(2000);
      console.log('Selected project:', projectOptions[1]);
    } else {
      console.log('No projects available in dropdown');
    }
  } else {
    console.log('No select elements found on page');
  }

  await page.screenshot({ path: '/tmp/step5-project-selected.png', fullPage: true });

  // Step 5: Select a position from the second dropdown
  if (selectCount >= 2) {
    const positionSelect = allSelects.nth(1);
    const positionOptions = await positionSelect.locator('option').allTextContents();
    console.log('Position options:', positionOptions);

    if (positionOptions.length > 1) {
      await positionSelect.selectOption({ index: 1 });
      await page.waitForTimeout(2000);
      console.log('Selected position:', positionOptions[1]);
    } else {
      console.log('No positions available in dropdown');
    }
  } else {
    console.log('Only one or zero select elements - no position dropdown');
  }

  await page.screenshot({ path: '/tmp/step6-position-selected.png', fullPage: true });

  // Step 6: Trigger smart match to show candidates
  const smartMatchButton = page.locator('button').filter({ hasText: '智能匹配' }).first();
  if (await smartMatchButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('Clicking smart match button...');
    await smartMatchButton.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/tmp/step7-after-smart-match.png', fullPage: true });
    console.log('Smart match results displayed');
  } else {
    console.log('Smart match button not found or not visible');
  }

  // Step 7: Check for "加入名单" button and click it
  const addToShortlistButtons = page.locator('button').filter({ hasText: '加入名单' });
  const buttonCount = await addToShortlistButtons.count();
  console.log('Number of "加入名单" buttons found:', buttonCount);

  if (buttonCount > 0) {
    console.log('Clicking first "加入名单" button...');
    // Clear API responses before clicking
    apiResponses.length = 0;
    await addToShortlistButtons.first().click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/step8-after-add-shortlist.png', fullPage: true });

    // Check for toast notification
    const toastEl = page.locator('.fixed.top-4');
    if (await toastEl.isVisible({ timeout: 1000 }).catch(() => false)) {
      const toastText = await toastEl.textContent();
      console.log('Toast notification:', toastText);
    } else {
      console.log('No toast notification found');
    }

    // Check API responses for shortlist POST
    console.log('API responses after clicking "加入名单":', JSON.stringify(apiResponses, null, 2));
    console.log('Console errors:', consoleErrors);
  } else {
    console.log('No "加入名单" button found. Page text sample:',
      (await page.locator('body').innerText()).substring(0, 1000));
  }

  // Final screenshot
  await page.screenshot({ path: '/tmp/step-final.png', fullPage: true });
  console.log('Test complete. All screenshots saved to /tmp/');
});
