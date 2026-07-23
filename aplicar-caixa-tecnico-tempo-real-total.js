const fs = require('fs');

const boxFile = 'frontend/src/pages/TechnicianBoxControl.jsx';
const transfersFile = 'frontend/src/pages/Transfers.jsx';
const docsFile = 'docs/UPGRADE-CAIXA-TECNICO-CUSTODIA-TEMPO-REAL.md';

function patchFile(file, updater) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo não encontrado: ${file}`);
  const before = fs.readFileSync(file, 'utf8');
  const after = updater(before);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    console.log(`Atualizado: ${file}`);
  } else {
    console.log(`Sem alteração necessária: ${file}`);
  }
}

patchFile(boxFile, (src) => {
  let c = src;

  if (!c.includes('lastBoxRefresh')) {
    c = c.replace(
      "  const [box, setBox] = useState(null);",
      "  const [box, setBox] = useState(null);\n  const [boxLoading, setBoxLoading] = useState(false);\n  const [lastBoxRefresh, setLastBoxRefresh] = useState(null);"
    );
  }

  if (!c.includes('stock/technician-box/${id}?_=')) {
    const before = c;
    c = c.replace(
      /async function loadBox\(id = selectedTech\) \{\s*if \(!id\) return;\s*const res = await api\.get\(`\/stock\/technician-box\/\$\{id\}`\);\s*setBox\(res\.data\.data\);\s*\}/,
      `async function loadBox(id = selectedTech) {
    if (!id) return;
    setBoxLoading(true);
    try {
      const res = await api.get(\`/stock/technician-box/\${id}?_=\${Date.now()}\`);
      setBox(res.data.data);
      setLastBoxRefresh(new Date());
    } finally {
      setBoxLoading(false);
    }
  }`
    );

    if (c === before && c.includes('async function loadBox')) {
      c = c.replace(
        /const res = await api\.get\(`\/stock\/technician-box\/\$\{id\}`\);/g,
        "const res = await api.get(`/stock/technician-box/${id}?_=${Date.now()}`);"
      );
      c = c.replace(/setBox\(res\.data\.data\);/g, "setBox(res.data.data);\n      setLastBoxRefresh(new Date());");
    }
  }

  if (!c.includes('superinfra:technician-box-refresh')) {
    c = c.replace(
      "  useEffect(() => { if (selectedTech) loadBox(selectedTech); }, [selectedTech]);",
      `  useEffect(() => { if (selectedTech) loadBox(selectedTech); }, [selectedTech]);

  useEffect(() => {
    if (!selectedTech) return undefined;

    const refresh = () => loadBox(selectedTech);
    const interval = setInterval(refresh, 10000);
    const onFocus = () => refresh();
    const onVisibility = () => { if (!document.hidden) refresh(); };
    const onStorage = (event) => {
      if (event.key === 'superinfra:technician-box-refresh') refresh();
    };
    const onLocalRefresh = () => refresh();

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);
    window.addEventListener('superinfra:technician-box-refresh', onLocalRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('superinfra:technician-box-refresh', onLocalRefresh);
    };
  }, [selectedTech]);`
    );
  }

  if (!c.includes('const custodyRows = useMemo')) {
    c = c.replace(
      /  function assetsByMaterial\(materialId\) \{/,
      `  const custodyRows = useMemo(() => {
    const rows = [];

    for (const asset of box?.assets || []) {
      rows.push({
        key: \`asset-\${asset.id}\`,
        type: 'Equipamento serializado',
        material: asset.Material?.name || 'Equipamento',
        category: asset.Material?.category || '-',
        unit: asset.Material?.unit || 'un',
        quantity: 1,
        serial: asset.serialNumber || '-',
        mac: asset.mac || '-',
        warehouse: asset.Warehouse?.name || '-',
        value: Number(asset.acquisitionCost || asset.Material?.unitCost || 0),
        custodyStartedAt: asset.custodyStartedAt,
        custodyDays: asset.custodyDays || 0,
      });
    }

    for (const balance of box?.balances || []) {
      const quantity = Number(balance.quantity || 0);
      if (quantity <= 0) continue;

      rows.push({
        key: \`balance-\${balance.id || balance.materialId}\`,
        type: 'Consumível / material sem serial',
        material: balance.Material?.name || 'Material',
        category: balance.Material?.category || '-',
        unit: balance.Material?.unit || 'un',
        quantity,
        serial: '-',
        mac: '-',
        warehouse: balance.Warehouse?.name || '-',
        value: quantity * Number(balance.Material?.unitCost || 0),
        custodyStartedAt: balance.updatedAt || balance.createdAt,
        custodyDays: '-',
      });
    }

    return rows.sort((a, b) => String(a.material).localeCompare(String(b.material), 'pt-BR'));
  }, [box]);

  function assetsByMaterial(materialId) {`
    );
  }

  if (!c.includes('📦 Custódia atual do técnico')) {
    const insert = `
      <section className="panel technician-custody-live-panel">
        <div className="panel-title">
          <div>
            <h3>📦 Custódia atual do técnico</h3>
            <p>Lista em tempo real de tudo que está na caixa do técnico selecionado: equipamentos com serial e consumíveis.</p>
          </div>
          <div className="live-refresh-pill">
            <span className={boxLoading ? 'loading-dot' : 'online-dot'}></span>
            {boxLoading ? 'Atualizando...' : lastBoxRefresh ? \`Atualizado \${lastBoxRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}\` : 'Aguardando técnico'}
          </div>
        </div>

        <div className="custody-summary-strip">
          <div><strong>{formatQuantity(box?.summary?.totalQuantity || 0)}</strong><span>itens em custódia</span></div>
          <div><strong>{box?.summary?.assetsCount || 0}</strong><span>equipamentos com serial</span></div>
          <div><strong>{box?.summary?.consumableLines || 0}</strong><span>linhas de consumíveis</span></div>
          <div><strong>{brl(box?.summary?.totalValue)}</strong><span>valor estimado</span></div>
        </div>

        <div className="table-wrap custody-live-table">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Material</th>
                <th>Qtd.</th>
                <th>Serial</th>
                <th>MAC</th>
                <th>Valor</th>
                <th>Custódia</th>
              </tr>
            </thead>
            <tbody>
              {custodyRows.map((row) => (
                <tr key={row.key}>
                  <td><span className={row.serial !== '-' ? 'badge transferencia_tecnico' : 'badge retorno_tecnico'}>{row.type}</span></td>
                  <td><strong>{row.material}</strong><br /><small>{row.category}</small></td>
                  <td>{formatQuantity(row.quantity)} {row.unit || 'un'}</td>
                  <td>{row.serial}</td>
                  <td>{row.mac}</td>
                  <td>{brl(row.value)}</td>
                  <td>{row.custodyDays === '-' ? '-' : \`há \${row.custodyDays} dia(s)\`}</td>
                </tr>
              ))}
              {custodyRows.length === 0 && (
                <tr>
                  <td colSpan="7"><div className="empty-state">Nenhum material em custódia para o técnico selecionado.</div></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
`;
    c = c.replace(
      '      <section className="two-col">',
      insert + '\n      <section className="two-col">'
    );
  }

  c = c.replace(/formatQuantity\(balance\?\.quantity,\s*material\?\.unit\)/g, "formatQuantity(balance?.quantity) + ' ' + (material?.unit || 'un')");
  c = c.replace(/formatQuantity\(details\.item\.quantity,\s*details\.item\.unit\)/g, "formatQuantity(details.item.quantity) + ' ' + (details.item.unit || 'un')");

  return c;
});

patchFile(transfersFile, (src) => {
  let c = src;
  if (!c.includes('superinfra:technician-box-refresh')) {
    c = c.replace(
      /await api\.post\('\/transfers', payload\);\s*setModal\(false\);/,
      `await api.post('/transfers', payload);
    try {
      localStorage.setItem('superinfra:technician-box-refresh', String(Date.now()));
      window.dispatchEvent(new CustomEvent('superinfra:technician-box-refresh'));
    } catch (eventError) {
      // Apenas atualização visual da caixa do técnico; não bloqueia a transferência.
    }
    setModal(false);`
    );
  }
  return c;
});

patchFile('frontend/src/styles.css', (src) => {
  if (src.includes('.technician-custody-live-panel')) return src;

  return src + `

.technician-custody-live-panel {
  border-top: 4px solid #20c997;
}

.live-refresh-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid rgba(59, 130, 246, .22);
  border-radius: 999px;
  background: #f8fbff;
  color: #1f3b63;
  font-weight: 800;
  font-size: 12px;
}

.online-dot, .loading-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  display: inline-block;
}

.online-dot {
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, .12);
}

.loading-dot {
  background: #f59e0b;
  box-shadow: 0 0 0 4px rgba(245, 158, 11, .14);
  animation: pulse 1s infinite ease-in-out;
}

.custody-summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 14px 0 18px;
}

.custody-summary-strip > div {
  padding: 14px;
  border: 1px solid rgba(59, 130, 246, .16);
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff, #f4f8ff);
}

.custody-summary-strip strong {
  display: block;
  font-size: 22px;
  color: #081636;
}

.custody-summary-strip span {
  display: block;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.custody-live-table table td {
  vertical-align: top;
}

@media (max-width: 760px) {
  .custody-summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
`;
});

fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync(docsFile, `# Caixa do técnico em tempo real

Este ajuste melhora a aba administrativa de caixa do técnico.

## Incluído

- Ao selecionar um técnico, a caixa carrega imediatamente.
- Atualização automática a cada 10 segundos.
- Atualização quando a janela volta ao foco.
- Atualização quando uma nova transferência é registrada em outra aba.
- Exibição consolidada de todos os itens em custódia do técnico, incluindo equipamentos serializados e consumíveis.
- Cards de resumo com total em custódia, equipamentos com serial, consumíveis e valor estimado.

## Observação

A transferência continua dando baixa no estoque de origem e adicionando o material à custódia do técnico pelo backend já existente.
`, 'utf8');

console.log('OK: ajuste da caixa do técnico em tempo real aplicado.');
