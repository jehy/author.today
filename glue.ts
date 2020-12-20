import * as fs from 'fs';
import {join} from 'path';

let data = '';
const final = join(__dirname, `/tmp/final.txt`);
for (let i = 0; i < 1000; i++) {
    const filename = join(__dirname, `/tmp/${i + 1}.txt`);
    if (!fs.existsSync(filename)) {
        fs.writeFileSync(final, data, {encoding: "utf8"});
        break;
    }
    const newText = fs.readFileSync(filename, 'utf-8');
    data += newText;
}
