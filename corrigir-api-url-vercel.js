const fs = require('fs');
const path = require('path');

const backendUrl = 'https://stockflow-backend-6gxl.onrender.com/api';

function walk(dir, files = []) {
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (/\.(js|jsx)$/.test(full)) files.push(full);
  }
  return files;
}

const files = walk('frontend/src');
let changed = 0;

for (const file of files) {
  let c = fs.readFileSync(file, 'utf8');
  const original = c;

  c = c.replace(
    /process\.env\.REACT_APP_API_URL\s*\|\|\s*['"`]\/api['"`]/g,
    `process.env.REACT_APP_API_URL || '${backendUrl}'`
  );

  c = c.replace(
    /process\.env\.REACT_APP_API_URL\s*\?\?\s*['"`]\/api['"`]/g,
    `process.env.REACT_APP_API_URL || '${backendUrl}'`
  );

  c = c.replace(
    /const\s+API_URL\s*=\s*['"`]\/api['"`]/g,
    `const API_URL = '${backendUrl}'`
  );

  c = c.replace(
    /baseURL:\s*['"`]\/api['"`]/g,
    `baseURL: '${backendUrl}'`
  );

  if (c !== original) {
    fs.writeFileSync(file, c, 'utf8');
    console.log('Atualizado:', file);
    changed++;
  }
}

console.log('Arquivos alterados:', changed);
if (!changed) {
  console.log('Nenhum padrão automático encontrado. Rode: Select-String -Path frontend\\src\\**\\*.js,frontend\\src\\**\\*.jsx -Pattern "REACT_APP_API_URL|baseURL|/api"');
}
