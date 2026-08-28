import fs from 'fs';

const code = fs.readFileSync('src/App.tsx', 'utf8');

const lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('async ') && (line.includes('=> {') || line.includes('function '))) {
        let hasTryCatch = false;
        for (let j = 0; j <= 5 && i + j < lines.length; j++) {
            if (lines[i+j].includes('try {')) {
                hasTryCatch = true;
                break;
            }
        }
        if (!hasTryCatch) {
            console.log(`Async function at line ${i+1}: ${line.trim()}`);
            console.log(`    ${lines[i+1]?.trim()}`);
            console.log(`    ${lines[i+2]?.trim()}`);
        }
    }
}
