import { chromium, type Page } from 'playwright';

/**
 * Run `fn` with a fresh headless page and always tear the browser down.
 * Shared by the browser-rendered extractors (Play-in, Parkage, Troll2Jeux)
 * whose events are only in the DOM after client-side JS runs.
 *
 * Uses the standard `playwright` (these shops aren't bot-protected, so no
 * anti-detection needed — that's only for Vinted/Cardmarket). Needs Chromium:
 * `npx playwright install chromium` once on the machine. These extractors run
 * on the WSL box (which already drives a browser for the Vinted agent), NOT in
 * the GitHub Action (which uses --no-browser).
 */
export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      locale: 'fr-FR',
      viewport: { width: 1280, height: 1600 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    return await fn(page);
  } finally {
    await browser.close();
  }
}
