const fs = require('fs');

const files = [
  'frontend/src/pages/Users.jsx',
  'frontend/src/pages/Technicians.jsx',
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;

  let c = fs.readFileSync(file, 'utf8');
  const original = c;

  // Remove qualquer bloco <label> que contenha "Técnico vinculado"
  c = c.replace(
    /\s*<label[^>]*>\s*(?:<span[^>]*>\s*)?T[eé]cnico vinculado[\s\S]*?<\/label>/gi,
    ''
  );

  // Remove qualquer bloco de div/form-group que contenha "Técnico vinculado"
  c = c.replace(
    /\s*<div[^>]*>\s*<label[^>]*>\s*T[eé]cnico vinculado[\s\S]*?<\/div>/gi,
    ''
  );

  // Remove textos soltos caso tenham ficado
  c = c.replace(/T[eé]cnico vinculado/gi, '');

  // Remove technicianId do reset de formulário quando possível
  c = c.replace(/,\s*technicianId:\s*[^,\n}]+/g, '');
  c = c.replace(/technicianId:\s*[^,\n}]+,\s*/g, '');

  if (c !== original) {
    fs.writeFileSync(file, c, 'utf8');
    console.log('Atualizado:', file);
  } else {
    console.log('Nenhuma alteração em:', file);
  }
}

console.log('Campo Técnico vinculado removido.');
