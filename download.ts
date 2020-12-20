import puppeteer from 'puppeteer-extra';

// add stealth plugin and use defaults (all evasion techniques)

import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';

puppeteer.use(AdblockerPlugin()).use(StealthPlugin());

import * as fs from 'fs';
import {join} from 'path';
import {Page, SetCookie} from "puppeteer";

function randomIntFromInterval(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

async function getPageText(page: Page): Promise<string> {
    return page.evaluate(() => {
        async function copyText(selector) {
            const copyText = document.querySelector(selector);
            //copyText.select();
            //document.execCommand("Copy");
            return copyText.innerText;
        }

        return copyText("#reader");
    });
}

async function readPage(page: Page, id: number) {
    console.log(`Downloading page ${id}`);
    await page.waitForTimeout(4000 + randomIntFromInterval(100, 2000));
    const text = await getPageText(page);
    fs.writeFileSync(join(__dirname, `/tmp/${id}.txt`), text, {encoding: "utf-8"});
    console.log(text);
    const linkHandlers = await page.$x("//a[contains(text(), '→')]");

    if (linkHandlers.length > 0) {
        await linkHandlers[0].click();
        return true;
    } else {
        // TODO somehow add check that book is finished. Simply check if that's the last chapter?
        return false;
    }
}

async function getBook(id: string, cookieFile: string) {
    const dir = join(__dirname, '/tmp/');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
    const browser = await puppeteer.launch({headless: false});
    const page = await browser.newPage();
    const cookies:Array<SetCookie> = cookieFile ? JSON.parse(fs.readFileSync(cookieFile, 'utf-8')): [];
    console.log('Cookies:')
    console.log(cookies);
    await page.setCookie(...cookies);
    await page.goto(`https://author.today/reader/${id}`);
    let pageFound = true;
    let pageId = 1;
    while (pageFound) {
        pageFound = await readPage(page, pageId);
        pageId++;
    }
    await browser.close();
}

getBook(process.argv[2], process.argv[3])
    .then(() => process.exit(0))
    .catch((err) => {
        console.log(err);
        process.exit(1);
    });
