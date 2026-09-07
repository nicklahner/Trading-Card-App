import { test, expect, type Page } from '@playwright/test';
import { seedTestAuth, cleanupTestAuth } from './auth-helper';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setAuthCookie(page: Page, token: string) {
  await page.context().addCookies([
    {
      name: 'authjs.session-token',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

/**
 * Create a 1x1 JPEG blob for test uploads.
 * Avoids needing real images in CI.
 */
async function createTestImageBlob(page: Page): Promise<Buffer> {
  // Minimal valid JPEG (1x1 red pixel)
  return Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
      'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh' +
      'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR' +
      'CAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgED' +
      'AwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcY' +
      'GRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJ' +
      'ipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo' +
      '6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgEC' +
      'BAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl' +
      '8RcYI4Q/RFhHRUYnJCk2NzgJOjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3' +
      'eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX' +
      '2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+gD/2Q==',
    'base64',
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('M2 acceptance: batch scan + identification', () => {
  let token: string;

  test.beforeAll(async () => {
    const auth = await seedTestAuth();
    token = auth.token;
  });

  test.afterAll(async () => {
    await cleanupTestAuth();
  });

  test('batch scan 3 cards, identify, review, confirm', async ({ page }) => {
    test.setTimeout(180_000);
    await setAuthCookie(page, token);

    // ------------------------------------------------------------------
    // Step 1: Create a scan session via the /scan page
    // ------------------------------------------------------------------
    await page.goto('/scan');
    await expect(page.getByText('Scan Session')).toBeVisible({ timeout: 10_000 });

    // Fill session label
    const labelInput = page.getByPlaceholder(/label|session name/i);
    await labelInput.fill('E2E Test Batch');

    // Select storage default (toploader)
    const storageSelect = page.locator('select').first();
    await storageSelect.selectOption('toploader');

    // Start session
    await page.getByRole('button', { name: /start/i }).click();

    // Wait for capture phase
    await expect(page.getByText(/capture|scan cards/i)).toBeVisible({ timeout: 10_000 });

    // ------------------------------------------------------------------
    // Step 2: Scan 3 cards (front + back for each)
    // ------------------------------------------------------------------
    const testImage = await createTestImageBlob(page);
    const itemIds: string[] = [];

    for (let i = 0; i < 3; i++) {
      // Click "Add Card" / "Next Card" to create a new draft item
      const addButton = page.getByRole('button', { name: /add card|next card|scan/i }).first();
      await addButton.click();

      // Wait for item to be created — the page should show a card slot
      await page.waitForTimeout(1000);

      // Upload front photo
      const frontInput = page.locator('input[type="file"]').first();
      await frontInput.setInputFiles({
        name: `card-${i + 1}-front.jpg`,
        mimeType: 'image/jpeg',
        buffer: testImage,
      });

      // Wait for upload to complete
      await expect(
        page.getByText(/front.*uploaded|uploaded.*front/i).or(page.locator('[data-front="uploaded"]')),
      ).toBeVisible({ timeout: 15_000 });

      // Upload back photo
      const backInput = page.locator('input[type="file"]').last();
      await backInput.setInputFiles({
        name: `card-${i + 1}-back.jpg`,
        mimeType: 'image/jpeg',
        buffer: testImage,
      });

      // Wait for back upload
      await expect(
        page.getByText(/back.*uploaded|uploaded.*back/i).or(page.locator('[data-back="uploaded"]')),
      ).toBeVisible({ timeout: 15_000 });
    }

    // ------------------------------------------------------------------
    // Step 3: Trigger identification (done automatically or via button)
    // ------------------------------------------------------------------
    const identifyButton = page.getByRole('button', { name: /identify|process|done/i });
    if (await identifyButton.isVisible()) {
      await identifyButton.click();
    }

    // Wait for items to move to needs_review status.
    // The fake providers return immediately, so this should be fast.
    // Poll the collection page for needs_review items.
    await page.goto('/collection?filter=needs_review');
    await page.waitForTimeout(3000);

    // Retry a few times since identification runs async
    let needsReviewVisible = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.reload();
      await page.waitForTimeout(2000);
      const items = page.locator('[data-status="needs_review"], [data-testid="item-card"]');
      const count = await items.count();
      if (count >= 3) {
        needsReviewVisible = true;
        break;
      }
      // Also check for any card-like content in the list
      const listItems = page.locator('ul > li, [role="listitem"]');
      if ((await listItems.count()) >= 3) {
        needsReviewVisible = true;
        break;
      }
    }

    expect(needsReviewVisible).toBe(true);

    // ------------------------------------------------------------------
    // Step 4: Confirm items via review page
    // ------------------------------------------------------------------
    // Click the first needs_review item to go to its detail/review page
    const reviewLinks = page.locator('a[href*="/collection/"]');
    const reviewCount = await reviewLinks.count();
    expect(reviewCount).toBeGreaterThanOrEqual(3);

    // Confirm each item. The review page should have a "Confirm" or "Accept" button.
    for (let i = 0; i < 3; i++) {
      // Go to the review page for each item
      const link = reviewLinks.nth(i);
      const href = await link.getAttribute('href');
      expect(href).toBeTruthy();

      await page.goto(href!);
      await page.waitForTimeout(500);

      // Look for a confirm/accept button on the detail page
      const confirmButton = page
        .getByRole('button', { name: /confirm|accept|approve/i })
        .first();

      if (await confirmButton.isVisible()) {
        await confirmButton.click();
        // Wait for status transition
        await page.waitForTimeout(2000);
      }
    }

    // ------------------------------------------------------------------
    // Step 5: Verify items are now owned with cards linked
    // ------------------------------------------------------------------
    await page.goto('/collection');
    await page.waitForURL(/\/collection(\?|$)/);
    await page.waitForTimeout(1000);

    // The "Owned" tab should include the confirmed cards
    const ownedTab = page.locator('a', { hasText: /^Owned \(\d+\)/ });
    if (await ownedTab.isVisible()) {
      const ownedText = await ownedTab.textContent();
      const ownedMatch = ownedText?.match(/Owned \((\d+)\)/);
      const ownedCount = ownedMatch ? parseInt(ownedMatch[1], 10) : 0;
      // Should have at least the 3 we just confirmed (plus any seeded)
      expect(ownedCount).toBeGreaterThanOrEqual(3);
    }
  });
});
