import { promises as fsp } from 'fs';
import * as fs from 'fs';
import { join, basename } from 'path';
import { spawn } from 'child_process';
import Debug from 'debug';
import promiseMap from 'promise.map';
// @ts-ignore
import toFlags from 'to-flags';
import yargs from 'yargs/yargs';
import Axios from 'axios';
import type { BookMeta, ConvertOptions } from './types';

async function downloadImage(url: string, filepath: string) {
  const response = await Axios({
    url,
    method: 'GET',
    responseType: 'stream',
  });
  return new Promise((resolve, reject) => {
    response.data.pipe(fs.createWriteStream(filepath))
      .on('error', reject)
      .once('close', () => resolve(filepath));
  });
}

async function convertBook(input:string, output:string, bookName:string, options: ConvertOptions)
  :Promise<void> {
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

async function getMeta(bookDir:string):Promise<BookMeta> {
  const metaFileName = join(bookDir, '/meta.json');
  const data = await fsp.readFile(metaFileName, 'utf8');
  return JSON.parse(data);
}

async function glueBook(bookName: string, tmpDir:string, convert:boolean):Promise<void> {
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
    let newText = await fsp.readFile(chapterFileName, 'utf-8');
    const images = newText.match(/<img [^>]*src="[^"]*"[^>]*>/gm);
    if (images && images.length) {
      const sources = images.map((x) => x.replace(/.*src="([^"]*)".*/, '$1'));
      for (let n = 0; n < sources.length; n++) {
        const source = sources[n];
        const name = basename(source);
        const fileName = `${bookName}/${name}`;
        if (!fs.existsSync(fileName)) {
          log(`Downloading image ${source}`);
          await downloadImage(source, join(tmpDir, fileName));
        }
        newText = newText.replace(source, name);
      }
    }

    data += newText;
  }
  if (!convert) {
    return;
  }
  const output = join(bookDir, `/${meta.title}.epub`);
  const options:ConvertOptions = {
    ...meta,
    pageBreaksBefore: '//h:h1',
    chapter: '//h:h1',
    insertBlankLine: true,
    insertBlankLineSize: '1',
    lineHeight: '12',
  };
  const cover = join(bookDir, '/cover.jpg');
  if (fs.existsSync(cover)) {
    log('adding cover');
    options.cover = cover;
  }
  try {
    await convertBook(htmlFileName, output, bookName, options);
    log('converted');
  } catch (err) {
    log(`Failed to convert ${bookName}`);
    log(err);
  }
}

async function glueBooks(convert: boolean, openDir: boolean):Promise<void> {
  const tmpDir = join(__dirname, '/tmp');
  const books = await fsp.readdir(tmpDir);
  await promiseMap(books, (book) => glueBook(book, tmpDir, convert), 3);
  if (openDir) {
    spawn('dolphin', [tmpDir]);
  }
}

const argv = yargs(process.argv.slice(2))
  .options({
    convert: {
      alias: 'c',
      default: true,
      type: 'boolean',
    },
    openDir: {
      alias: 'o',
      default: true,
      type: 'boolean',
    },
  })
  .help('help').parseSync();

glueBooks(argv.convert, argv.openDir).then(() => process.exit(0));
