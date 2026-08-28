import fs from 'fs';
const code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /useEffect\(\s*(?:\([^)]*\))?\s*=>\s*\{/g;
let match;
while ((match = regex.exec(code)) !== null) {
    const startIndex = match.index;
    let braceCount = 0;
    let endIndex = -1;
    for (let i = code.indexOf('{', startIndex); i < code.length; i++) {
        if (code[i] === '{') braceCount++;
        else if (code[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                endIndex = i;
                break;
            }
        }
    }
    
    if (endIndex !== -1) {
        const body = code.substring(startIndex, endIndex + 1);
        console.log("useEffect at index " + startIndex);
        console.log(body.substring(0, 500)); // Print start of useEffect
        console.log("---------------");
    }
}
