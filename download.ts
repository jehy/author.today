import puppeteer from 'puppeteer-extra';

// add stealth plugin and use defaults (all evasion techniques)

import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';

import { promises as fsp } from 'fs';
import * as fs from 'fs';
import { join } from 'path';
import { Page, SetCookie } from 'puppeteer';
import Debug from 'debug';

const log = Debug('author.today:download');

puppeteer.use(AdblockerPlugin()).use(StealthPlugin());

function randomIntFromInterval(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

async function getPageText(page: Page): Promise<string> {
  return page.evaluate(() => {
    async function copyText(selector) {
      const element = document.querySelector(selector);
      // copyText.select();
      // document.execCommand("Copy");
      return element.innerHTML;
    }

    return copyText('#text-container');
  });
}

async function readPage(page: Page, id: number, bookDir: string) {
  log(`Downloading page ${id}`);
  await page.waitForTimeout(4000 + randomIntFromInterval(100, 2000));
  const text = await getPageText(page);
  await fsp.writeFile(join(bookDir, `/${id}.html`), text, { encoding: 'utf-8' });
  log(`${text.substr(0, 100).split('\n').join('')}...`);
  const nextPageLink = await page.$x("//a[contains(text(), '→')]");

  if (nextPageLink.length > 0) {
    await nextPageLink[0].click();
    return true;
  }
  // TODO somehow add check that book is finished. Simply check if that's the last chapter?
  log('No next link found, possibly book end');
  return false;
}

// Otherwise when using cookies book will be downloaded from last opened page
async function goToBookStart(page: Page, id: string) {
  const chaptersLink = await page.$x("//a[contains(@href, '#tab-chapters')]");
  if (chaptersLink.length === 0) {
    log('Oh shit, cant see chapters!');
    process.exit(1);
  }
  await chaptersLink[0].click();
  await page.waitForTimeout(3000);
  const firstChapterLink = await page.$x(`//a[contains(@href, '/${id}/')]`);
  if (firstChapterLink.length === 0) {
    log('Oh shit, cant see first chapter!');
    process.exit(1);
  }
  await firstChapterLink[0].click();
  await page.waitForTimeout(3000);
}

async function getBookTitle(page: Page) {
  const bookTitle = await page.title();
  return bookTitle
    .replace(' - читать книгу в онлайн-библиотеке', '')
    .replace(/"/g, '')
    .replace(/'/g, '');
}

async function getCoverImage(browser, page: Page) {
  const image = await page.$x('//img[@class="cover-image"]');
  if (image.length === 0) {
    log('Oh shit, cant see cover image!');
    process.exit(1);
  }
  const page2 = await browser.newPage();
  const imageSrc = await image[0].getProperty('src');
  const imageSrcString = await imageSrc.jsonValue();
  log(`cover image: ${imageSrcString}`);
  const imagePage = await page2.goto(imageSrcString);
  const data = await imagePage.buffer();
  await page2.close();
  return data;
}

function getBookMeta(bookTitle: string) {
  const [title, authors] = bookTitle
    .split(' - ')
    .map((el) => el
      .trim()
      .replace(/"/g, '')
      .replace(/'/g, ''));
  return { title, authors };
}

async function getBook(id: string, cookieFile: string) {
  const dir = join(__dirname, '/tmp/');
  if (!fs.existsSync(dir)) {
    await fsp.mkdir(dir);
  }
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  const cookies:Array<SetCookie> = cookieFile ? JSON.parse(fs.readFileSync(cookieFile, 'utf-8')) : [];
  // log('Cookies:');
  // log(cookies);
  await page.setCookie(...cookies);
  const url = `https://author.today/work/${id}`;
  await page.goto(url);
  const bookTitle = await getBookTitle(page);
  const meta = getBookMeta(bookTitle);
  const bookDir = join(dir, `/${meta.authors} ${meta.title}`);
  if (!fs.existsSync(bookDir)) {
    await fsp.mkdir(bookDir);
  }
  await fsp.writeFile(join(bookDir, '/meta.json'), JSON.stringify(meta), 'utf8');
  const image = await getCoverImage(browser, page);
  await fsp.writeFile(join(bookDir, '/cover.jpg'), image);
  await goToBookStart(page, id);
  let pageFound = true;
  let pageId = 1;
  while (pageFound) {
    pageFound = await readPage(page, pageId, bookDir);
    pageId++;
  }
  await browser.close();
}

getBook(process.argv[2], process.argv[3])
  .then(() => process.exit(0))
  .catch((err) => {
    log(err);
    process.exit(1);
  });
