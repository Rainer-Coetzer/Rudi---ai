/**
 * Stateful Browser Tool (Singleton)
 * Maintains a persistent browser session across multiple tool calls.
 *
 * Playwright is an optional dependency: it is imported on first use, so the
 * plugin still loads (and reports a clear error) when it isn't installed.
 */
class BrowserManager {
  static instance = null;
  browser = null;
  context = null;
  page = null;

  static getInstance() {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  async getPage() {
    if (!this.browser) {
      let chromium;
      try {
        ({ chromium } = await import('playwright'));
      } catch {
        throw new Error('Playwright is not installed. Run "npm install playwright" and "npx playwright install chromium" to enable browser_action.');
      }
      this.browser = await chromium.launch({ headless: false }); // Show browser for better JARVIS feel
      this.context = await this.browser.newContext();
    }
    if (!this.page || this.page.isClosed()) {
      this.page = await this.context.newPage();
    }
    return this.page;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }
}

export default {
  name: 'browser_action',
  description: 'Navigate to websites, click elements, and scrape data using a stateful browser.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['navigate', 'click', 'type', 'scrape', 'close'] },
      url: { type: 'string' },
      selector: { type: 'string' },
      text: { type: 'string' }
    },
    required: ['action']
  },
  permission: 'caution',
  autonomy: 'assist',

  execute: async (params) => {
    const browser = BrowserManager.getInstance();

    try {
      if (params.action === 'close') {
        await browser.close();
        return { success: true, result: 'Browser closed.' };
      }

      const page = await browser.getPage();
      switch (params.action) {
        case 'navigate':
          await page.goto(params.url, { waitUntil: 'domcontentloaded' });
          return { success: true, result: `Navigated to ${params.url}` };

        case 'click':
          await page.click(params.selector);
          return { success: true, result: `Clicked ${params.selector}` };

        case 'type':
          await page.fill(params.selector, params.text);
          return { success: true, result: `Typed into ${params.selector}` };

        case 'scrape': {
          const content = await page.content();
          return { success: true, result: content.substring(0, 10000) }; // Limit result size
        }

        default:
          return { success: false, result: 'Unknown browser action.' };
      }
    } catch (err) {
      return { success: false, result: `Browser error: ${err.message}` };
    }
  }
};
