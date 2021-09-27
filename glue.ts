import * as fs from 'fs';
import { join } from 'path';
import { exec } from 'child_process';

const bookDir = join(__dirname, '/tmp');
const books = fs.readdirSync(bookDir);
books.forEach((bookName) => {
  console.log(`Gluing book ${bookName}`);
  let data = '';
  const final = join(__dirname, `/tmp/${bookName}/${bookName}.txt`);
  for (let i = 0; i < 1000; i++) {
    const filename = join(__dirname, `tmp/${bookName}/${i + 1}.txt`);
    if (!fs.existsSync(filename)) {
      fs.writeFileSync(final, data, { encoding: 'utf8' });
      break;
    }
    console.log(`Found page ${i + 1}`);
    const newText = fs.readFileSync(filename, 'utf-8');
    data += newText;
  }
  exec(`dolphin ${bookDir}`);
});
