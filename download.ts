import puppeteer from 'puppeteer-extra';

// add stealth plugin and use defaults (all evasion techniques)

import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker'


puppeteer.use(AdblockerPlugin()).use(StealthPlugin());

import * as fs from 'fs';
import {join} from 'path';


async function readPage(page, id) {

    console.log(`Downloading part ${id}`);
    await page.waitForTimeout(5000);
    const text = await page.evaluate(() => {
        async function copyText(selector) {
            const copyText = document.querySelector(selector);
            //copyText.select();
            //document.execCommand("Copy");
            return copyText.innerText;
        }

        return copyText("#reader");
    });
    fs.writeFileSync(join(__dirname, `/tmp/${id}.txt`), text, {encoding: "utf-8"});
    console.log(text);
    const linkHandlers = await page.$x("//a[contains(text(), '→')]");

    if (linkHandlers.length > 0) {
        await linkHandlers[0].click();
        await readPage(page, id + 1);
    } else {
        // TODO somehow add check that book is finished. Simply check if that's the last chapter?
        throw new Error("Link not found")
    }
}

async function getBook(id) {
    const dir = join(__dirname, '/tmp/');
    if(!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }
    const browser = await puppeteer.launch({headless: false});
    const page = await browser.newPage();
    await page.goto(`https://author.today/reader/${id}`);
    await readPage(page, 1);
    await browser.close();
}

getBook(process.argv[2])
    .then(() => process.exit(0))
    .catch((err) => {
        console.log(err);
        process.exit(1);
    });
