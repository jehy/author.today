import * as fs from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import convert from 'ebook-convert';
import { promisify } from 'util';

function fixText(text: string) {
  const textSplit:string[] = text.split('\n');
  let startFrom = 0;
  for (let i = 0; i < 10; i++) {
    if (textSplit[i].trim() === 'Настройки') {
      // Выделяем номер главы
      textSplit[i + 1] = `<h1>${textSplit[i + 1]}</h1>`;
      startFrom = i + 1;
    }
  }
  let count = textSplit.length;
  for (let i = textSplit.length - 1; i > textSplit.length - 5; i--) {
    if (textSplit[i].startsWith('←')) {
      count = i;
    }
  }
  return textSplit.splice(startFrom, count - startFrom).join('<br>\n');
}

async function glueBook(bookName: string, tmpDir:string) {
  console.log(`Gluing book ${bookName}`);
  let data = '';
  const bookDir = join(tmpDir, `/${bookName}`);
  const htmlFileName = join(bookDir, `/${bookName}.html`);
  for (let i = 1; i < 1000; i++) {
    const chapterFileName = join(tmpDir, `${bookName}/${i}.txt`);
    if (!fs.existsSync(chapterFileName)) {
      fs.writeFileSync(htmlFileName, data, { encoding: 'utf8' });
      break;
    }
    console.log(`Found chapter ${i}`);
    const newText = fs.readFileSync(chapterFileName, 'utf-8');
    data += fixText(newText);
  }
  const [name, author] = bookName.split(' - ').map((el) => el.trim());
  const options = {
    input: `"${htmlFileName}"`,
    output: `"${join(bookDir, `/${name}.mobi`)}"`,
    authors: `"${author}"`,
    pageBreaksBefore: '//h:h1',
    chapter: '//h:h1',
    insertBlankLine: true,
    insertBlankLineSize: '1',
    lineHeight: '12',
  };
  try {
    await promisify(convert)(options);
  } catch (err) {
    console.log(`Failed to convert ${bookName}`);
    console.log(err);
  }
}

async function glueBooks() {
  const tmpDir = join(__dirname, '/tmp');
  const books = fs.readdirSync(tmpDir);
  await Promise.all(books.map((book) => glueBook(book, tmpDir)));
  exec(`dolphin "${tmpDir}"`);
}

glueBooks().then(() => process.exit(0));
