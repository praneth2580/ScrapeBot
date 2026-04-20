import { chromium, type Browser, type BrowserContext } from "playwright";
import TurndownService from "turndown";

const NAVIGATION_TIMEOUT_MS = 30_000;
const MAX_CONTENT_LENGTH = 12_000;

let browserInstance: Browser | null = null;

/**
 * Returns a shared Chromium browser instance.
 * Reuses the same browser across calls to avoid the startup cost on every scrape.
 */
async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  browserInstance = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  return browserInstance;
}

/**
 * Strips away non-content elements from the page before extracting text.
 * This removes scripts, styles, nav bars, footers, ads, cookie banners, etc.
 */
async function stripNonContent(context: BrowserContext, url: string) {
  const page = await context.newPage();

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    // Wait briefly for any lazy-loaded content
    await page.waitForTimeout(1500);

    // Remove non-content elements from the DOM
    await page.evaluate(() => {
      const selectorsToRemove = [
        "script",
        "style",
        "noscript",
        "iframe",
        "svg",
        "canvas",
        "nav",
        "footer",
        "header",
        "[role='navigation']",
        "[role='banner']",
        "[role='contentinfo']",
        "[aria-hidden='true']",
        ".cookie-banner",
        ".ad",
        ".ads",
        ".advertisement",
        "#cookie-consent",
        "#gdpr",
      ];

      for (const selector of selectorsToRemove) {
        document.querySelectorAll(selector).forEach((el) => el.remove());
      }
    });

    const title = await page.title();
    const html = await page.content();

    return { title, html };
  } finally {
    await page.close();
  }
}

/**
 * Converts raw HTML to clean markdown using Turndown.
 */
function htmlToMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  // Skip images — they add noise without value for the LLM
  turndown.addRule("removeImages", {
    filter: "img",
    replacement: () => "",
  });

  let markdown = turndown.turndown(html);

  // Collapse excessive whitespace
  markdown = markdown
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim();

  return markdown;
}

/**
 * Scrapes a URL using a headless Chromium browser and returns clean markdown.
 *
 * Pipeline: navigate → strip non-content DOM → extract HTML → convert to markdown → truncate.
 */
export async function scrapeUrl(url: string): Promise<{
  title: string;
  url: string;
  markdown: string;
  truncated: boolean;
}> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
  });

  try {
    const { title, html } = await stripNonContent(context, url);
    let markdown = htmlToMarkdown(html);

    const truncated = markdown.length > MAX_CONTENT_LENGTH;
    if (truncated) {
      markdown = markdown.slice(0, MAX_CONTENT_LENGTH) + "\n\n[...truncated]";
    }

    return { title, url, markdown, truncated };
  } finally {
    await context.close();
  }
}

/**
 * Gracefully shuts down the shared browser instance.
 * Call this on process exit if you want to be clean.
 */
export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
