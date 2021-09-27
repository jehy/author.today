import * as fs from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import Debug from 'debug';
import toFlags from 'to-flags';

function fixText(text: string) {
  const textSplit:string[] = text.replace(/\n\n/g, '\n').split('\n');
  let startFrom = 0;
  for (let i = 0; i < 10; i++) {
    if (textSplit[i].trim() === 'Настройки') {
      // Выделяем номер главы
      textSplit[i + 1] = `<h1>${textSplit[i + 1]}</h1>`;
      startFrom = i + 1;
    }
  }
  let count = textSplit.length;
  for (let i = textSplit.length - 1; i > textSplit.length - 10; i--) {
    if (textSplit[i].startsWith('←')) {
      count = i;
    }
  }
  return textSplit.splice(startFrom, count - startFrom).join('<br>\n');
}

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

async function glueBook(bookName: string, tmpDir:string) {
  const [name, author] = bookName.split(' - ').map((el) => el.trim());
  const log = Debug(`author.today:${name}`);
  log('Starting book');
  let data = '';
  const bookDir = join(tmpDir, `/${bookName}`);
  const htmlFileName = join(bookDir, `/${bookName}.html`);
  for (let i = 1; i < 1000; i++) {
    const chapterFileName = join(tmpDir, `${bookName}/${i}.txt`);
    if (!fs.existsSync(chapterFileName)) {
      fs.writeFileSync(htmlFileName, data, { encoding: 'utf8' });
      break;
    }
    log(`Found chapter ${i}`);
    const newText = fs.readFileSync(chapterFileName, 'utf-8');
    data += fixText(newText);
  }
  const output = join(bookDir, `/${name}.mobi`);
  const options = {
    authors: author,
    pageBreaksBefore: '//h:h1',
    chapter: '//h:h1',
    insertBlankLine: true,
    insertBlankLineSize: '1',
    lineHeight: '12',
  };
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
  const books = fs.readdirSync(tmpDir);
  await Promise.all(books.map((book) => glueBook(book, tmpDir)));
  spawn('dolphin', [tmpDir]);
}

glueBooks().then(() => process.exit(0));
