import { load as loadHTML } from 'cheerio';
import path from 'node:path';
import fs from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

/**
 * @typedef {import('playwright-core').BrowserType} BrowserType
 * @type {[string, BrowserType][]}
 */
const BROWSERS = Object.entries({ chromium, firefox, webkit });

/**
 * @typedef {import('playwright-core').Page} Page
 * @param {Page} page
 * @returns {Promise<void>}
 */
function injectAnimationDisabler (page) {
  return new Promise((resolve) => page.on('load', () => {
    const content = `
    *,
    *::after,
    *::before {
        transition: none !important;
        animation: none !important;
    }`;

    page.addStyleTag({ content }).then(resolve);
  }));
}

/**
 * client part -- will be provided as a playwright plugin
 * @param {string} url
 */
const saveRawHtml = async (url) => {
  const browser = await chromium.launch({
    headless: true,
  });
  const page = await browser.newPage();
  page.setViewportSize({
    width: 1920,
    height: 1080,
  });
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  const html = await page.content();
  await browser.close();
  await fs.writeFile(path.join(__dirname, 'example.html'), html);
};

async function main () {
  // get command line arguments
  const url = process.argv[2];
  const outputName = process.argv[3] || 'example';
  if (!url) {
    throw new Error('Please provide a URL as the first argument');
  }

  await saveRawHtml(url);
  const rawHtml = await fs.readFile(path.join(__dirname, 'example.html'), 'utf-8');
  const $ = loadHTML(rawHtml);
  $('script').remove();
  const cleanHtml = $.html();
  const outputFilePath = path.join(__dirname, 'example-clean.html');
  await fs.writeFile(outputFilePath, cleanHtml);
  await fs.rm(path.join(__dirname, 'example.html'));

  await Promise.all(BROWSERS.map(async ([browserName, browserType]) => {
    const browser = await browserType.launch({
      headless: true,
    });
    const page = await browser.newPage();
    // await page.setViewportSize();
    await Promise.all([
      injectAnimationDisabler(page),
      page.goto(`file://${outputFilePath}`),
    ]);
    // wait for assets (fonts, images etc.) to load
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: `${outputName}.${browserName}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    console.info(`Screenshot saved to ${outputName}.${browserName}.png`);
    // shut down the browser
    await page.close();
    await browser.close();
  }));

  await fs.rm(outputFilePath);
}

main().catch((error) => {
  console.error('Error occurred');
  console.error(error);
  process.exit(1);
});
