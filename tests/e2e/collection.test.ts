import { test, expect, type Page } from '@playwright/test';
import { seedTestAuth, cleanupTestAuth } from './auth-helper';

// ---------------------------------------------------------------------------
// NOTE: ALLOWED_EMAILS in .env.local is currently 'nick.lahner7@gmail.com'.
// We bypass the sign-in flow entirely by writing a session row + cookie
// directly, so the allow-list is not evaluated during these tests.
// ---------------------------------------------------------------------------

// IDs of items we create during the test, used for cleanup/assertions.
const createdItemIds: string[] = [];

/**
 * Helper: set the authjs session-token cookie so the app considers us
 * authenticated (NextAuth v5 with Prisma adapter uses database sessions).
 */
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
 * Helper: walk through the add-card wizard.
 *   1. Search for a player name
 *   2. Pick the first result
 *   3. Pick a parallel (by visible text)
 *   4. Fill condition/storage/cost on the details form
 *   5. Confirm
 *
 * Returns the item ID extracted from the redirect URL.
 */
async function addCard(
  page: Page,
  opts: {
    searchQuery: string;
    /** Text that appears on the result button to click. Defaults to first result. */
    resultText?: string;
    /** Exact label on the parallel button. Pass null/"Base" for base. */
    parallel?: string | null;
    rawTier?: string;
    storage?: string;
    costPrice: string;
  },
): Promise<string> {
  await page.goto('/collection/add');
  await expect(page.getByRole('heading', { name: 'Add Card' })).toBeVisible();

  // Step 1: Search
  const searchInput = page.getByTestId('search-input');
  await searchInput.fill(opts.searchQuery);
  await page.getByRole('button', { name: 'Search' }).click();

  // Wait for results to appear
  if (opts.resultText) {
    await page
      .locator('button', { hasText: opts.resultText })
      .first()
      .click();
  } else {
    // Click first search result button (inside the <ul>)
    await page.locator('ul > li > button').first().click();
  }

  // Step 2: Pick parallel
  await expect(page.getByText('Pick a parallel')).toBeVisible();
  const parallelLabel = opts.parallel ?? 'Base';
  await page
    .locator('button', { hasText: new RegExp(`^${parallelLabel}`) })
    .first()
    .click();

  // Step 3: Details form
  // Condition: raw/market is the default; change if requested
  if (opts.rawTier) {
    await page.locator('select').first().selectOption(opts.rawTier);
  }

  // Storage: default is toploader
  if (opts.storage) {
    const storageSelect = page.locator('label', { hasText: 'Storage' }).locator('select');
    await storageSelect.selectOption(opts.storage);
  }

  // Cost price
  const priceInput = page.locator('input[placeholder="Price ($)"]');
  await priceInput.fill(opts.costPrice);

  // Submit the details form (Review & Add)
  await page.getByRole('button', { name: /Review.*Add/i }).click();

  // Step 4: Confirm screen
  await expect(page.getByText('Confirm')).toBeVisible();
  await page.getByRole('button', { name: 'Add to Collection' }).click();

  // Wait for redirect to detail page /collection/<uuid>
  await page.waitForURL(/\/collection\/[0-9a-f-]{36}$/i, { timeout: 15000 });

  const url = page.url();
  const itemId = url.split('/collection/')[1];
  createdItemIds.push(itemId);
  return itemId;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('M1 acceptance: add, edit, mark sold', () => {
  let token: string;

  test.beforeAll(async () => {
    const auth = await seedTestAuth();
    token = auth.token;
  });

  test.afterAll(async () => {
    await cleanupTestAuth();
  });

  test('add 3 cards, edit one, mark one sold', async ({ page }) => {
    // Increase timeout for this multi-step test
    test.setTimeout(120_000);

    await setAuthCookie(page, token);

    // ------------------------------------------------------------------
    // Add card 1: CJ Stroud, Base, Raw/market, Toploader, $5.00
    // The fake catalog search for "Stroud" returns CJ Stroud results.
    // ------------------------------------------------------------------
    const card1Id = await addCard(page, {
      searchQuery: 'Stroud',
      resultText: 'CJ Stroud',
      parallel: 'Base',
      costPrice: '5.00',
    });

    // Verify we landed on the detail page
    await expect(page.getByRole('heading', { level: 1 }).last()).toContainText('CJ Stroud');
    await expect(page.getByText('$5.00').first()).toBeVisible();

    // ------------------------------------------------------------------
    // Add card 2: Patrick Mahomes, Base, $3.00
    // Fake catalog search for "Mahomes" returns Patrick Mahomes.
    // ------------------------------------------------------------------
    const card2Id = await addCard(page, {
      searchQuery: 'Mahomes',
      resultText: 'Patrick Mahomes',
      parallel: 'Base',
      costPrice: '3.00',
    });

    await expect(page.getByRole('heading', { level: 1 }).last()).toContainText('Patrick Mahomes');

    // ------------------------------------------------------------------
    // Add card 3: Anthony Richardson, Silver parallel, $150.00
    // Fake catalog has no "Herbert", so we use "Richardson" instead.
    // Silver parallel is available for all fake cards.
    // ------------------------------------------------------------------
    const card3Id = await addCard(page, {
      searchQuery: 'Richardson',
      resultText: 'Anthony Richardson',
      parallel: 'Silver',
      costPrice: '150.00',
    });

    await expect(page.getByRole('heading', { level: 1 }).last()).toContainText('Anthony Richardson');
    await expect(page.getByText('Silver')).toBeVisible();

    // ------------------------------------------------------------------
    // Verify collection page: 3 new cards + 15 seeded = 18 owned
    // ------------------------------------------------------------------
    await page.goto('/collection');
    await page.waitForURL(/\/collection(\?|$)/);

    // All three names should appear in the list
    await expect(page.getByText('CJ Stroud').first()).toBeVisible();
    await expect(page.getByText('Patrick Mahomes').first()).toBeVisible();
    await expect(page.getByText('Anthony Richardson').first()).toBeVisible();

    // The "Owned" tab should show the count (15 seeded + 3 new = 18)
    // Use a flexible matcher since seeded count may vary
    const ownedTab = page.locator('a', { hasText: /^Owned \(\d+\)/ });
    await expect(ownedTab).toBeVisible();
    const ownedText = await ownedTab.textContent();
    const ownedMatch = ownedText?.match(/Owned \((\d+)\)/);
    const ownedCount = ownedMatch ? parseInt(ownedMatch[1], 10) : 0;
    expect(ownedCount).toBeGreaterThanOrEqual(3);

    // ------------------------------------------------------------------
    // Edit card 1: change condition to ex_mt ("Clear wear"), cost to $4.50
    // ------------------------------------------------------------------
    await page.goto(`/collection/${card1Id}`);
    await expect(page.getByRole('heading', { level: 1 }).last()).toContainText('CJ Stroud');

    // Click the "Edit" button
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.waitForURL(/\/edit$/);
    await expect(page.getByText('Edit Card')).toBeVisible();

    // Change condition tier to ex_mt (Clear wear)
    // The condition select is under the "Condition" fieldset
    const conditionSelect = page
      .locator('fieldset', { hasText: 'Condition' })
      .locator('select');
    await conditionSelect.selectOption('ex_mt');

    // Change cost price to $4.50
    const editPriceInput = page.locator('input[placeholder="Price ($)"]');
    await editPriceInput.clear();
    await editPriceInput.fill('4.50');

    // Save
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(`/collection/${card1Id}`, { timeout: 15000 });

    // Verify changes on detail page
    await expect(page.getByText('Excellent-Mint')).toBeVisible();
    await expect(page.getByText('$4.50').first()).toBeVisible();

    // ------------------------------------------------------------------
    // Mark card 2 sold: sold price $8.00
    // ------------------------------------------------------------------
    await page.goto(`/collection/${card2Id}`);
    await expect(page.getByRole('heading', { level: 1 }).last()).toContainText('Patrick Mahomes');

    // Expand "Mark as sold"
    await page.getByRole('button', { name: 'Mark as sold' }).click();

    // Fill sold date (use today)
    const today = new Date().toISOString().split('T')[0];
    const soldDateInput = page.locator('input[type="date"]');
    await soldDateInput.fill(today);

    // Fill sold price
    const soldPriceInput = page
      .locator('label', { hasText: 'Sold price' })
      .locator('input');
    await soldPriceInput.fill('8.00');

    // Confirm the sale
    await page.getByRole('button', { name: 'Confirm sale' }).click();

    // Wait for the page to refresh and show "Sale" section
    await expect(page.getByText('Sale')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('$8.00').first()).toBeVisible();

    // ------------------------------------------------------------------
    // Verify collection counts after marking one sold
    // ------------------------------------------------------------------
    await page.goto('/collection');
    await page.waitForURL(/\/collection(\?|$)/);

    // Owned count should have decreased by 1
    const ownedTabAfter = page.locator('a', { hasText: /^Owned \(\d+\)/ });
    const ownedTextAfter = await ownedTabAfter.textContent();
    const ownedMatchAfter = ownedTextAfter?.match(/Owned \((\d+)\)/);
    const ownedCountAfter = ownedMatchAfter
      ? parseInt(ownedMatchAfter[1], 10)
      : 0;
    expect(ownedCountAfter).toBe(ownedCount - 1);

    // Sold tab should show at least 1
    const soldTab = page.locator('a', { hasText: /^Sold \(\d+\)/ });
    await expect(soldTab).toBeVisible();
    const soldText = await soldTab.textContent();
    const soldMatch = soldText?.match(/Sold \((\d+)\)/);
    const soldCount = soldMatch ? parseInt(soldMatch[1], 10) : 0;
    expect(soldCount).toBeGreaterThanOrEqual(1);

    // Click "Sold" tab and verify the Mahomes card appears
    await soldTab.click();
    await page.waitForURL(/filter=sold/);
    await expect(page.getByText('Patrick Mahomes').first()).toBeVisible();
  });
});
