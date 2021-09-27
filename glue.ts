import { promises as fsp } from 'fs';
import * as fs from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import Debug from 'debug';
import toFlags from 'to-flags';

async function convert(input, output, bookName, options) {
  const log = Debug(`author.today:${bookName}:convertor`);
  return new Promise((resolve, reject) => {
    const run = spawn('ebook-convert', [input, output, ...toFlags(options)]);
    run.stdout.on('data', (data) => {
      log(`stdout: ${data}`);
    });

    run.stderr.on('data', (data) => {
      log(`stderr: ${data}`);
    });

    run.on('close', (code) => {
      if (code === 0) {
        resolve(undefined);
      } else {
        reject();
      }
    });
  });
}

async function getMeta(bookDir:string){
  const metaFileName = join(bookDir, `/meta.json`);
  const data = await fsp.readFile(metaFileName, 'utf8');
  return JSON.parse(data);
}

async function glueBook(bookName: string, tmpDir:string) {
  const bookDir = join(tmpDir, `/${bookName}`);
  const meta = await getMeta(bookDir);
  const log = Debug(`author.today:${meta.title}`);
  log('Starting book');
  let data = '';
  const htmlFileName = join(bookDir, `/${bookName}.html`);
  for (let i = 1; i < 1000; i++) {
    const chapterFileName = join(tmpDir, `${bookName}/${i}.html`);
    if (!fs.existsSync(chapterFileName)) {
      await fsp.writeFile(htmlFileName, data, { encoding: 'utf8' });
      break;
    }
    log(`Found chapter ${i}`);
    const newText = await fsp.readFile(chapterFileName, 'utf-8');
    data += newText;
  }
  const output = join(bookDir, `/${meta.title}.mobi`);
  const options = {
    ...meta,
    pageBreaksBefore: '//h:h1',
    chapter: '//h:h1',
    insertBlankLine: true,
    insertBlankLineSize: '1',
    lineHeight: '12',
    cover: undefined,
  };
  const cover = join(bookDir, '/cover.jpg');
  if (fs.existsSync(cover)) {
    log('adding cover');
    options.cover = cover;
  }
  try {
    await convert(htmlFileName, output, bookName, options);
    log('converted');
  } catch (err) {
    log(`Failed to convert ${bookName}`);
    log(err);
  }
}

async function glueBooks() {
  const tmpDir = join(__dirname, '/tmp');
  const books = await fsp.readdir(tmpDir);
  await Promise.all(books.map((book) => glueBook(book, tmpDir)));
  spawn('dolphin', [tmpDir]);
}

glueBooks().then(() => process.exit(0));
