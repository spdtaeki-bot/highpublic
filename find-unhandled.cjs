const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const code = fs.readFileSync('src/App.tsx', 'utf-8');
const ast = parser.parse(code, {
  sourceType: 'module',
  plugins: ['jsx', 'typescript']
});

traverse(ast, {
  AwaitExpression(path) {
    let parent = path.parentPath;
    let foundTry = false;
    while (parent) {
      if (parent.type === 'TryStatement') {
        foundTry = true;
        break;
      }
      if (parent.type === 'FunctionDeclaration' || parent.type === 'ArrowFunctionExpression' || parent.type === 'FunctionExpression') {
        break; // Stop climbing if we hit function boundary
      }
      parent = parent.parentPath;
    }
    if (!foundTry) {
      console.log(`Await without try at line ${path.node.loc.start.line}: ${code.substring(path.node.start, path.node.end)}`);
    }
  },
  CallExpression(path) {
    const callee = path.node.callee;
    if (callee.type === 'MemberExpression' && callee.property.name === 'then') {
      let isCaught = false;
      let p = path.parentPath;
      while (p) {
        if (p.type === 'CallExpression' && p.node.callee.property && p.node.callee.property.name === 'catch') {
          isCaught = true; break;
        }
        if (p.type === 'CallExpression' && p.node.callee.property && p.node.callee.property.name === 'then') {
            // Keep walking
        } else if (p.type === 'MemberExpression') {
            // Keep walking
        } else {
          break; // Stop checking
        }
        p = p.parentPath;
      }
      if (!isCaught) {
        console.log(`Promise.then without catch at line ${path.node.loc.start.line}`);
      }
    }
  }
});
