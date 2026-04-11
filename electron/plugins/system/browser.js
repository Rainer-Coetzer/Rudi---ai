import { chromium, Browser, BrowserContext, Page } from 'playwright';

/**
 * Stateful Browser Tool (Singleton)
 * Maintains a persistent browser session across multiple tool calls.
 */
class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  private constructor() {}

  public static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  public async getPage(): Promise<Page> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: false }); // Show browser for better JARVIS feel
      this.context = await this.browser.newContext();
    }
    if (!this.page || this.page.isClosed()) {
      this.page = await this.context!.newPage();
    }
    return this.page;
  }

  public async close(): Promise<void> {
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
  
  execute: async (params: any) => {
    const browser = BrowserManager.getInstance();
    const page = await browser.getPage();

    try {
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
        
        case 'scrape':
          const content = await page.content();
          return { success: true, result: content.substring(0, 10000) }; // Limit result size
        
        case 'close':
          await browser.close();
          return { success: true, result: 'Browser closed.' };
        
        default:
          return { success: false, result: 'Unknown browser action.' };
      }
    } catch (err: any) {
      return { success: false, result: `Browser error: ${err.message}` };
    }
  }
};
