import fs from 'fs';
const code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /(?:const\s+\w+\s*=\s*)?async\s*(?:\([^)]*\))?\s*=>\s*\{/g;
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
        if (!body.match(/catch\s*\(/)) {
            let info = code.substring(Math.max(0, startIndex - 50), startIndex + 50);
            console.log("Found async function without catch at index " + startIndex);
            console.log(info.replace(/\n/g, ' '));
        }
    }
}

// Check traditional functions
const regex2 = /async\s+function\s+\w+\s*\([^)]*\)\s*\{/g;
while ((match = regex2.exec(code)) !== null) {
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
        if (!body.match(/catch\s*\(/)) {
            let info = code.substring(Math.max(0, startIndex - 50), startIndex + 50);
            console.log("Found async functional without catch at index " + startIndex);
            console.log(info.replace(/\n/g, ' '));
        }
    }
}
