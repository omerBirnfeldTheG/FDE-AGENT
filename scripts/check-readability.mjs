import fs from 'node:fs';
import ts from 'typescript';

const roots = ['backend', 'frontend/src', 'validation'];
const failures = [];

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

function bodyLineCount(source, body) {
  const start = source.getLineAndCharacterOfPosition(body.getStart()).line;
  const end = source.getLineAndCharacterOfPosition(body.end).line;
  return { count: Math.max(0, end - start - 1), line: start + 1 };
}

function checkFunction(source, node) {
  if (!ts.isFunctionLike(node) || !node.body || !ts.isBlock(node.body)) return;
  const { count, line } = bodyLineCount(source, node.body);
  if (count > 6) failures.push(`${source.fileName}:${line}: ${node.name?.getText(source) ?? 'callback'} has ${count} body lines (maximum 6).`);
}

function visit(source, node) {
  checkFunction(source, node);
  ts.forEachChild(node, child => visit(source, child));
}

function checkFile(path) {
  const source = ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  visit(source, source);
}

roots.flatMap(sourceFiles).forEach(checkFile);
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log('All application and validation function bodies are at most 6 lines. Test scenarios are excluded.');
