import puppeteer from 'puppeteer-extra';

// add stealth plugin and use defaults (all evasion techniques)

import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';

import { promises as fsp } from 'fs';
import * as fs from 'fs';
import { join } from 'path';
import type { Browser, Page, SetCookie } from 'puppeteer';
import Debug from 'debug';
import { SingleBar, Presets } from 'cli-progress';
import yargs from 'yargs/yargs';
import type { BookMeta } from './types';

const log = Debug('author.today:download');

puppeteer.use(AdblockerPlugin()).use(StealthPlugin());

function randomIntFromInterval(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

async function getPageText(page: Page): Promise<string> {
  return page.evaluate(() => {
    async function copyText(selector: string) {
      const element = document.querySelector(selector);
      // copyText.select();
      // document.execCommand("Copy");
      return element && element.innerHTML || '';
    }

    return copyText('#text-container');
  });
}

async function waitRandomTimeout(page: Page, minTimeout:number):Promise<void> {
  await page.waitForTimeout(minTimeout + randomIntFromInterval(0, minTimeout / 2));
}

async function readPage(page: Page, id: number,
  bookDir: string, progress: SingleBar):Promise<boolean> {
  await waitRandomTimeout(page, 4000);
  const text = await getPageText(page);
  await fsp.writeFile(join(bookDir, `/${id}.html`), text, { encoding: 'utf-8' });
  const startText = `${text.substr(0, 100).split('\n').join(' ')}...`;
  progress.increment(1, { startText });
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
async function goToBookStartAndGetChapters(page: Page):Promise<number> {
  const chaptersLink = await page.$x("//a[contains(@href, '#tab-chapters')]");
  if (chaptersLink.length === 0) {
    log('Oh shit, cant see chapters!');
    process.exit(1);
  }
  await chaptersLink[0].click();
  await waitRandomTimeout(page, 3000);
  const chapterLinks = await page.$x('//div[@id="tab-chapters"]//a');
  if (chapterLinks.length === 0) {
    log('Oh shit, cant see first chapter!');
    process.exit(1);
  }
  await chapterLinks[0].click();
  await waitRandomTimeout(page, 3000);
  return chapterLinks.length;
}

async function getBookTitle(page: Page):Promise<string> {
  const bookTitle = await page.title();
  return bookTitle
    .replace(' - читать книгу в онлайн-библиотеке', '')
    .replace(/"/g, '')
    .replace(/'/g, '');
}

async function getCoverImage(browser: Browser, page: Page):Promise<Buffer | null> {
  const image = await page.$x('//img[@class="cover-image"]');
  if (image.length === 0) {
    log('Oh shit, cant see cover image!');
    process.exit(1);
  }
  const page2 = await browser.newPage();
  const imageSrc = await image[0].getProperty('src');
  const imageSrcString = await imageSrc.jsonValue() as string;
  log(`cover image: ${imageSrcString}`);
  const imagePage = await page2.goto(imageSrcString);
  const data = imagePage && await imagePage.buffer();
  await page2.close();
  return data;
}

function getBookMeta(bookTitle: string):BookMeta {
  const [title, authors] = bookTitle
    .split(' - ')
    .map((el) => el
      .trim()
      .replace(/"/g, '')
      .replace(/'/g, ''));
  return { title, authors };
}

async function getBook(id: number, cookieFile: string | null, headless: boolean):Promise<void> {
  const dir = join(__dirname, '/tmp/');
  if (!fs.existsSync(dir)) {
    await fsp.mkdir(dir);
  }
  const browser = await puppeteer.launch({ headless });
  const page = await browser.newPage();
  const cookies:Array<SetCookie> = cookieFile ? JSON.parse(fs.readFileSync(cookieFile, 'utf-8')) : [];
  // log('Cookies:');
  // log(cookies);
  await page.setCookie(...cookies);
  const url = `https://author.today/work/${id}`;
  log(`Downloading book ${url}`);
  await page.goto(url);
  const bookTitle = await getBookTitle(page);
  const meta = getBookMeta(bookTitle);
  const bookDir = join(dir, `/${meta.authors} ${meta.title}`);
  if (!fs.existsSync(bookDir)) {
    await fsp.mkdir(bookDir);
  }
  await fsp.writeFile(join(bookDir, '/meta.json'), JSON.stringify(meta), 'utf8');
  const image = await getCoverImage(browser, page);
  if (image) {
    await fsp.writeFile(join(bookDir, '/cover.jpg'), image);
  }
  const chapters = await goToBookStartAndGetChapters(page);
  let pageFound = true;
  let pageId = 1;
  const progress = new SingleBar({
    etaBuffer: 10,
    format: 'Downloading [{bar}] {percentage}% | ETA: {eta_formatted} | {value}/{total} {startText}',
  }, Presets.shades_classic);
  progress.start(chapters, 0, { startText: '' });
  while (pageFound) {
    pageFound = await readPage(page, pageId, bookDir, progress);
    pageId++;
  }
  progress.stop();
  await browser.close();
}

const argv = yargs(process.argv.slice(2))
  .options({
    bookId: {
      alias: 'b',
      type: 'number',
      required: true,
    },
    cookiePath: {
      alias: 'c',
      default: null,
      type: 'string',
    },
    headless: {
      alias: 'h',
      default: true,
      type: 'boolean',
    },
  })
  .help('help').parseSync();

getBook(argv.bookId, argv.cookiePath, argv.headless).then(() => process.exit(0));
