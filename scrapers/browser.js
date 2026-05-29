const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox','--disable-setuid-sandbox',
        '--disable-dev-shm-usage','--disable-gpu',
        '--no-zygote','--single-process',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,800'
      ]
    });
  }
  return browser;
}

async function closeBrowser() {
  if (browser) { await browser.close(); browser = null; }
}

module.exports = { getBrowser, closeBrowser };
