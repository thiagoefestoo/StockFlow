const fs = require('fs');
const path = require('path');

const root = process.cwd();
const srcDir = path.join(root, 'frontend', 'src');
const utilsDir = path.join(srcDir, 'utils');
if (!fs.existsSync(srcDir)) {
  console.error('Execute este script na raiz do projeto estoque-superinfra. Pasta frontend/src não encontrada.');
  process.exit(1);
}
fs.mkdirSync(utilsDir, { recursive: true });

const utilPath = path.join(utilsDir, 'formatQuantity.js');
const utilContent = "export function quantityNumber(value) {\n  if (value === null || value === undefined || value === '') return 0;\n  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;\n\n  const raw = String(value).trim();\n  if (!raw) return 0;\n\n  // Trata valores vindos como \"1.000\", \"3.000\" ou \"6.000\" como unidade decimal do sistema,\n  // não como milhar. Isso evita exibir 1.000 quando a quantidade real é 1 unidade.\n  const normalized = raw\n    .replace(/\\s+/g, '')\n    .replace(',', '.');\n\n  const parsed = Number(normalized);\n  return Number.isFinite(parsed) ? parsed : 0;\n}\n\nexport function formatQuantity(value) {\n  const number = quantityNumber(value);\n  const rounded = Math.round(number);\n\n  if (Math.abs(number - rounded) < 0.000001) {\n    // Sem separador de milhar para não confundir unidade com milhar.\n    return String(rounded);\n  }\n\n  return number.toLocaleString('pt-BR', {\n    minimumFractionDigits: 0,\n    maximumFractionDigits: 3,\n  });\n}\n\nexport function formatQuantityWithUnit(value, unit = '') {\n  const label = formatQuantity(value);\n  return `${label}${unit ? ` ${unit}` : ''}`.trim();\n}\n\nexport function formatQuantityInput(value) {\n  if (value === null || value === undefined || value === '') return '';\n  const number = quantityNumber(value);\n  const rounded = Math.round(number);\n  if (Math.abs(number - rounded) < 0.000001) return String(rounded);\n  return String(Number(number.toFixed(3)));\n}\n";
fs.writeFileSync(utilPath, utilContent, 'utf8');

function page(file) { return path.join(srcDir, 'pages', file); }
function read(file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null; }
function write(file, content) { fs.writeFileSync(file, content, 'utf8'); }
function ensureImport(content, names = 'formatQuantity, formatQuantityWithUnit') {
  if (content.includes("../utils/formatQuantity")) return content;
  const importLine = `import { ${names} } from '../utils/formatQuantity';`;
  const lines = content.split('\n');
  let insertAt = 0;
  while (insertAt < lines.length && lines[insertAt].startsWith('import ')) insertAt += 1;
  lines.splice(insertAt, 0, importLine);
  return lines.join('\n');
}
function patchFile(filename, callback, importNames = 'formatQuantity, formatQuantityWithUnit') {
  const file = page(filename);
  let content = read(file);
  if (content === null) { console.log('Ignorado:', filename); return; }
  const before = content;
  content = callback(content);
  if (content !== before) {
    content = ensureImport(content, importNames);
    write(file, content);
    console.log('Atualizado:', filename);
  } else console.log('Sem alteração:', filename);
}
function replaceAll(content, search, replacement) { return content.split(search).join(replacement); }

for (const filename of ['Transfers.jsx', 'TechnicianLosses.jsx', 'TechnicianReturns.jsx', 'Warehouses.jsx']) {
  patchFile(filename, (c) => {
    c = c.replace(/function qtyLabel\(value, unit = ''\) \{ return `\$\{Number\(value \|\| 0\)\.toLocaleString\('pt-BR'\)\} \$\{unit \|\| ''\}`\.trim\(\); \}/g, "function qtyLabel(value, unit = '') { return formatQuantityWithUnit(value, unit); }");
    c = c.replace(/function qtyLabel\(value, unit = ''\) \{ return [^\n]*toLocaleString\('pt-BR'\)[^\n]*; \}/g, "function qtyLabel(value, unit = '') { return formatQuantityWithUnit(value, unit); }");
    return c;
  });
}

patchFile('Transfers.jsx', (c) => {
  c = replaceAll(c, '<td>{tr.totalQuantity}</td>', '<td>{formatQuantity(tr.totalQuantity)}</td>');
  c = replaceAll(c, '<span>{form.items.reduce((s, i) => s + Number(i.quantity || (i.serialNumbers || []).length || 0), 0)} unidade(s)</span>', '<span>{formatQuantity(form.items.reduce((s, i) => s + Number(i.quantity || (i.serialNumbers || []).length || 0), 0))} unidade(s)</span>');
  c = replaceAll(c, '["Qtd. total", details.totalQuantity]', '["Qtd. total", formatQuantity(details.totalQuantity)]');
  c = replaceAll(c, '<span>Qtd. {item.quantity} • {item.serialNumber || \'sem serial\'} • {brl(item.totalCost)}</span>', '<span>Qtd. {formatQuantity(item.quantity)} • {item.serialNumber || \'sem serial\'} • {brl(item.totalCost)}</span>');
  return c;
});

patchFile('TechnicianLosses.jsx', (c) => {
  c = replaceAll(c, '<td>{loss.totalQuantity}</td>', '<td>{formatQuantity(loss.totalQuantity)}</td>');
  c = replaceAll(c, '["Qtd. total", details.totalQuantity]', '["Qtd. total", formatQuantity(details.totalQuantity)]');
  c = replaceAll(c, '<span>Qtd. {item.quantity} • {item.serialNumber || \'sem serial\'} • {brl(item.totalCost)}</span>', '<span>Qtd. {formatQuantity(item.quantity)} • {item.serialNumber || \'sem serial\'} • {brl(item.totalCost)}</span>');
  return c;
});

patchFile('Receiving.jsx', (c) => {
  c = replaceAll(c, '<KpiCard label="Itens recebidos" value={totals.totalItems} />', '<KpiCard label="Itens recebidos" value={formatQuantity(totals.totalItems)} />');
  c = replaceAll(c, '<td>{b.totalItems}</td>', '<td>{formatQuantity(b.totalItems)}</td>');
  c = replaceAll(c, '["Itens", details.totalItems]', '["Itens", formatQuantity(details.totalItems)]');
  c = replaceAll(c, '<span>{item.quantity} • {brl(item.totalCost)} • {item.condition}</span>', '<span>{formatQuantity(item.quantity)} • {brl(item.totalCost)} • {item.condition}</span>');
  c = replaceAll(c, '`${serials.length}/${quantity} serial(is) informado(s). Quantidade correta.`', '`${serials.length}/${formatQuantity(quantity)} serial(is) informado(s). Quantidade correta.`');
  c = replaceAll(c, '`${serials.length}/${quantity} serial(is) informado(s). Faltam ${quantity - serials.length}.`', '`${serials.length}/${formatQuantity(quantity)} serial(is) informado(s). Faltam ${formatQuantity(quantity - serials.length)}.`');
  c = replaceAll(c, '`${serials.length}/${quantity} serial(is) informado(s). Remova ${serials.length - quantity} excedente(s).`', '`${serials.length}/${formatQuantity(quantity)} serial(is) informado(s). Remova ${formatQuantity(serials.length - quantity)} excedente(s).`');
  c = replaceAll(c, '`${itemLabel}: informe exatamente ${quantity} serial(is). Você informou ${serials.length}.`', '`${itemLabel}: informe exatamente ${formatQuantity(quantity)} serial(is). Você informou ${serials.length}.`');
  return c;
});

patchFile('MaterialRequests.jsx', (c) => {
  c = replaceAll(c, '<td>{Number(r.totalQuantity || 0)}</td>', '<td>{formatQuantity(r.totalQuantity)}</td>');
  c = replaceAll(c, '["Qtd. total", details.totalQuantity]', '["Qtd. total", formatQuantity(details.totalQuantity)]');
  c = replaceAll(c, '<span>Qtd. {item.quantity} • {brl(item.totalCost)} • {item.notes || \'sem observação\'}</span>', '<span>Qtd. {formatQuantity(item.quantity)} • {brl(item.totalCost)} • {item.notes || \'sem observação\'}</span>');
  return c;
});

patchFile('MovementHistory.jsx', (c) => {
  c = replaceAll(c, 'm.quantity, m.serialNumber ||', 'formatQuantity(m.quantity), m.serialNumber ||');
  c = replaceAll(c, 'value={stats.quantidade.toLocaleString(\'pt-BR\')}', 'value={formatQuantity(stats.quantidade)}');
  c = replaceAll(c, '<td>{m.quantity}</td>', '<td>{formatQuantity(m.quantity)}</td>');
  c = replaceAll(c, '["Quantidade", details.quantity]', '["Quantidade", formatQuantity(details.quantity)]');
  return c;
});

patchFile('OperationsCockpit.jsx', (c) => {
  c = replaceAll(c, '{Number(r.totalQuantity || 0)} item(ns)', '{formatQuantity(r.totalQuantity)} item(ns)');
  c = replaceAll(c, '["Quantidade", details.quantity]', '["Quantidade", formatQuantity(details.quantity)]');
  return c;
});

patchFile('BIFinancial.jsx', (c) => replaceAll(c, '{row.totalQuantity} itens', '{formatQuantity(row.totalQuantity)} itens'));

patchFile('LossEvaluation.jsx', (c) => {
  c = replaceAll(c, '<KpiCard label="Qtd. perdida" value={summary.quantity} tone="danger" />', '<KpiCard label="Qtd. perdida" value={formatQuantity(summary.quantity)} tone="danger" />');
  c = replaceAll(c, '{row.count} guia(s) • {row.quantity} item(ns)', '{row.count} guia(s) • {formatQuantity(row.quantity)} item(ns)');
  c = replaceAll(c, '`• Qtd. ${item.quantity}`', '<>• Qtd. {formatQuantity(item.quantity)}</>');
  c = replaceAll(c, '["Qtd. total", details.totalQuantity]', '["Qtd. total", formatQuantity(details.totalQuantity)]');
  c = replaceAll(c, '`Qtd. ${item.quantity}`', '<>Qtd. {formatQuantity(item.quantity)}</>');
  return c;
});

patchFile('LossPrint.jsx', (c) => replaceAll(c, '<td>{item.quantity}</td>', '<td>{formatQuantity(item.quantity)}</td>'));
patchFile('TransferPrint.jsx', (c) => replaceAll(c, '<td>{item.quantity}</td>', '<td>{formatQuantity(item.quantity)}</td>'));
patchFile('Approvals.jsx', (c) => replaceAll(c, '<td>{item.quantity}</td>', '<td>{formatQuantity(item.quantity)}</td>'));

patchFile('ServiceOrders.jsx', (c) => {
  c = replaceAll(c, '`${m.Material?.name} (${m.quantity})`', '`${m.Material?.name} (${formatQuantity(m.quantity)})`');
  c = replaceAll(c, '<span>Qtd. {item.quantity} • {item.serialNumber || \'sem serial\'} • {brl(item.totalCost)}</span>', '<span>Qtd. {formatQuantity(item.quantity)} • {item.serialNumber || \'sem serial\'} • {brl(item.totalCost)}</span>');
  return c;
});

patchFile('Stock.jsx', (c) => {
  c = replaceAll(c, '<KpiCard label="Itens no estoque" value={totalEstoque} />', '<KpiCard label="Itens no estoque" value={formatQuantity(totalEstoque)} />');
  c = replaceAll(c, '<td>{m.mainStock}</td>', '<td>{formatQuantity(m.mainStock)}</td>');
  c = replaceAll(c, '<td>{m.minStock}</td>', '<td>{formatQuantity(m.minStock)}</td>');
  c = replaceAll(c, '[\'Estoque atual\', details.mainStock]', '[\'Estoque atual\', formatQuantity(details.mainStock)]');
  c = replaceAll(c, '[\'Estoque mínimo\', details.minStock]', '[\'Estoque mínimo\', formatQuantity(details.minStock)]');
  c = replaceAll(c, '[\'Estoque máximo\', details.maxStock]', '[\'Estoque máximo\', formatQuantity(details.maxStock)]');
  c = replaceAll(c, '[\'Ponto de pedido\', details.reorderPoint]', '[\'Ponto de pedido\', formatQuantity(details.reorderPoint)]');
  return c;
});

patchFile('TechnicianInbox.jsx', (c) => {
  c = replaceAll(c, '{Number(r.totalQuantity || 0)} item(ns)', '{formatQuantity(r.totalQuantity)} item(ns)');
  c = replaceAll(c, '<strong>{row.quantity} {row.unit || \'\'}</strong>', '<strong>{formatQuantityWithUnit(row.quantity, row.unit)}</strong>');
  c = replaceAll(c, '<td>{row.quantity} {row.unit || \'\'}</td>', '<td>{formatQuantityWithUnit(row.quantity, row.unit)}</td>');
  c = replaceAll(c, '<strong>{r.totalQuantity || 0} item(ns)</strong>', '<strong>{formatQuantity(r.totalQuantity)} item(ns)</strong>');
  c = replaceAll(c, '<td>{r.totalQuantity}</td>', '<td>{formatQuantity(r.totalQuantity)}</td>');
  c = replaceAll(c, '["Quantidade", `${details.item.quantity} ${details.item.unit || \'\'}`]', '["Quantidade", formatQuantityWithUnit(details.item.quantity, details.item.unit)]');
  c = replaceAll(c, '["Quantidade", `${details.item.quantity} ${details.item.Material?.unit || \'\'}`]', '["Quantidade", formatQuantityWithUnit(details.item.quantity, details.item.Material?.unit)]');
  c = replaceAll(c, '["Itens", details.item.totalQuantity]', '["Itens", formatQuantity(details.item.totalQuantity)]');
  return c;
});

patchFile('TechnicianPortal.jsx', (c) => replaceAll(c, '{Number(r.totalQuantity || 0)} item(ns)', '{formatQuantity(r.totalQuantity)} item(ns)'));

patchFile('TechnicianReturns.jsx', (c) => {
  c = replaceAll(c, '<KpiCard label="Itens na caixa" value={box?.summary?.totalQuantity || 0} />', '<KpiCard label="Itens na caixa" value={formatQuantity(box?.summary?.totalQuantity)} />');
  c = replaceAll(c, '<KpiCard label="Qtd. selecionada" value={totalQty} tone="success" />', '<KpiCard label="Qtd. selecionada" value={formatQuantity(totalQty)} tone="success" />');
  return c;
});

patchFile('Technicians.jsx', (c) => {
  c = replaceAll(c, '<td>{row.quantity}</td>', '<td>{formatQuantity(row.quantity)}</td>');
  c = replaceAll(c, 'Quantidade: {balance.quantity} {balance.Material?.unit}', 'Quantidade: {formatQuantityWithUnit(balance.quantity, balance.Material?.unit)}');
  c = replaceAll(c, 'qtd. {m.quantity}', 'qtd. {formatQuantity(m.quantity)}');
  return c;
});

patchFile('Warehouses.jsx', (c) => {
  c = replaceAll(c, 'saldo {m.mainStock}', 'saldo {formatQuantity(m.mainStock)}');
  c = replaceAll(c, '<span>{b.quantity} {b.Material?.unit} •', '<span>{formatQuantityWithUnit(b.quantity, b.Material?.unit)} •');
  c = replaceAll(c, 'Qtd. {m.quantity}', 'Qtd. {formatQuantity(m.quantity)}');
  return c;
});

const genericFiles = ['Approvals.jsx','BIFinancial.jsx','LossEvaluation.jsx','LossPrint.jsx','MaterialRequests.jsx','MovementHistory.jsx','OperationsCockpit.jsx','Receiving.jsx','ServiceOrders.jsx','Stock.jsx','TechnicianInbox.jsx','TechnicianLosses.jsx','TechnicianPortal.jsx','TechnicianReturns.jsx','Technicians.jsx','TransferPrint.jsx','Transfers.jsx','Warehouses.jsx'];
for (const filename of genericFiles) {
  const file = page(filename); let c = read(file); if (c === null) continue; const before = c;
  c = c.replace(/\["Qtd\. total", ([a-zA-Z0-9_?.]+\.totalQuantity)\]/g, '["Qtd. total", formatQuantity($1)]');
  c = c.replace(/\["Quantidade", ([a-zA-Z0-9_?.]+\.quantity)\]/g, '["Quantidade", formatQuantity($1)]');
  if (c !== before) { c = ensureImport(c); write(file, c); console.log('Ajuste genérico:', filename); }
}

const docDir = path.join(root, 'docs'); fs.mkdirSync(docDir, { recursive: true });
fs.writeFileSync(path.join(docDir, 'UPGRADE-QUANTIDADE-UNIDADE-FINAL.md'), '# Ajuste final de exibição de quantidade como unidade\n\nCorrige telas onde quantidades apareciam como 1.000, 3.000 ou 6.000 quando deveriam aparecer como 1, 3 ou 6 unidades.\n\nLocais cobertos: Transferências, Perdas/descontos, Entrada de material/quinzenal, Histórico, Solicitações, Caixa do técnico, Retorno ao estoque, Técnicos, Estoques, Catálogo, Guias e BI financeiro.\n', 'utf8');
console.log('\nConcluído. Agora rode: npm run build --prefix frontend');
