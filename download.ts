import puppeteer from 'puppeteer-extra';

// add stealth plugin and use defaults (all evasion techniques)

import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';

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
      return element.innerText;
    }

    return copyText('#reader');
  });
}

async function readPage(page: Page, id: number, bookDir: string) {
  log(`Downloading page ${id}`);
  await page.waitForTimeout(4000 + randomIntFromInterval(100, 2000));
  const text = await getPageText(page);
  fs.writeFileSync(join(bookDir, `/${id}.txt`), text, { encoding: 'utf-8' });
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
  // todo ебанутая проверка, можно просто со страницы книги найти ссыль на первую главу
  await page.goto(`https://author.today/reader/${id}`);
  let notFirstPage = true;
  while (notFirstPage) {
    const nextPageLink = await page.$x("//a[contains(text(), '←')]");

    if (nextPageLink.length > 0) {
      log('Not book start, going to previous page');
      await page.waitForTimeout(4000 + randomIntFromInterval(100, 2000));
      await nextPageLink[0].click();
    } else {
      notFirstPage = false;
      return;
    }
  }
}

async function getBookTitle(page: Page, id: string) {
  const url = `https://author.today/work/${id}`;
  await page.goto(url);
  const bookTitle = await page.title();
  return bookTitle
    .replace(' - читать книгу в онлайн-библиотеке', '')
    .split('"')
    .join('')
    .split("'")
    .join('');
}

async function getBook(id: string, cookieFile: string) {
  const dir = join(__dirname, '/tmp/');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  const cookies:Array<SetCookie> = cookieFile ? JSON.parse(fs.readFileSync(cookieFile, 'utf-8')) : [];
  log('Cookies:');
  log(cookies);
  await page.setCookie(...cookies);
  const bookTitle = await getBookTitle(page, id);
  await goToBookStart(page, id);
  await page.goto(`https://author.today/reader/${id}`);
  let pageFound = true;
  let pageId = 1;
  const bookDir = join(dir, `/${bookTitle}`);
  if (!fs.existsSync(bookDir)) {
    fs.mkdirSync(bookDir);
  }
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
