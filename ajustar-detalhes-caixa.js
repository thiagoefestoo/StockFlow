const fs = require('fs');

function save(path, content) {
  fs.writeFileSync(path, content, 'utf8');
  console.log('Atualizado:', path);
}

const controllerPath = 'backend/app/controllers/technicianController.js';
let controller = fs.readFileSync(controllerPath, 'utf8');

const oldGrouped = `  const grouped = {};
  for (const asset of assets) {
    const key = asset.Material?.name || 'Equipamento serializado';
    grouped[key] = grouped[key] || { material: key, quantity: 0, value: 0, serials: [] };
    grouped[key].quantity += 1;
    grouped[key].value += Number(asset.acquisitionCost || 0);
    grouped[key].serials.push(asset.serialNumber);
  }
  for (const balance of balances) {
    const key = balance.Material?.name || 'Material consumível';
    grouped[key] = grouped[key] || { material: key, quantity: 0, value: 0, serials: [] };
    grouped[key].quantity += Number(balance.quantity || 0);
    grouped[key].value += Number(balance.quantity || 0) * Number(balance.Material?.unitCost || 0);
  }
`;

const newGrouped = `  const grouped = {};
  for (const asset of assets) {
    const material = asset.Material || {};
    const key = material.name || 'Equipamento serializado';

    grouped[key] = grouped[key] || {
      materialId: material.id || asset.materialId,
      material: key,
      category: material.category || 'equipamento',
      unit: material.unit || 'un',
      requiresSerial: true,
      quantity: 0,
      value: 0,
      serials: [],
      serialDetails: [],
    };

    grouped[key].quantity += 1;
    grouped[key].value += Number(asset.acquisitionCost || material.unitCost || 0);

    if (asset.serialNumber) {
      grouped[key].serials.push(asset.serialNumber);
    }

    grouped[key].serialDetails.push({
      id: asset.id,
      serialNumber: asset.serialNumber,
      status: asset.status,
      acquisitionCost: asset.acquisitionCost || material.unitCost || 0,
      custodyStartedAt: asset.custodyStartedAt,
      lastMovementAt: asset.lastMovementAt,
    });
  }

  for (const balance of balances) {
    const material = balance.Material || {};
    const key = material.name || 'Material consumível';

    grouped[key] = grouped[key] || {
      materialId: material.id || balance.materialId,
      material: key,
      category: material.category || 'consumivel',
      unit: material.unit || '',
      requiresSerial: Boolean(material.requiresSerial),
      quantity: 0,
      value: 0,
      serials: [],
      serialDetails: [],
    };

    grouped[key].quantity += Number(balance.quantity || 0);
    grouped[key].value += Number(balance.quantity || 0) * Number(material.unitCost || 0);
  }
`;

if (controller.includes(oldGrouped)) {
  controller = controller.replace(oldGrouped, newGrouped);
  save(controllerPath, controller);
} else if (controller.includes('serialDetails')) {
  console.log('Backend já possui detalhes de seriais agrupados.');
} else {
  throw new Error('Não encontrei o bloco groupedMaterials no technicianController.js.');
}

const inboxPath = 'frontend/src/pages/TechnicianInbox.jsx';
let inbox = fs.readFileSync(inboxPath, 'utf8');

const groupDetailsRegex = /        \{details\?\.type === 'group' && <><DetailGrid[\s\S]*?<\/>}\n        \{details\?\.type === 'balance'/;

const newGroupDetails = [
"        {details?.type === 'group' && (() => {",
"          const serialRows = details.item.serialDetails || (details.item.serials || []).map((serialNumber) => ({ serialNumber }));",
"          const hasSerials = serialRows.length > 0;",
"          return <>",
"            <DetailGrid fields={[",
"              ['Material', details.item.material],",
"              ['Categoria', details.item.category || '-'],",
"              ['Quantidade total', `${details.item.quantity} ${details.item.unit || ''}`],",
"              ['Valor total', brl(details.item.value)],",
"              ['Serializado', hasSerials || details.item.requiresSerial ? 'Sim' : 'Não'],",
"            ]} />",
"            {hasSerials && <div className=\"panel-soft\">",
"              <h4>Seriais vinculados a esta carga</h4>",
"              <p className=\"muted\">Quantidade de equipamentos: {serialRows.length}</p>",
"              <div className=\"table-wrap compact\"><table><thead><tr><th>#</th><th>Serial</th><th>Status</th><th>Valor</th></tr></thead><tbody>{serialRows.map((asset, index) => <tr key={asset.id || asset.serialNumber || index}><td>{index + 1}</td><td><strong>{asset.serialNumber}</strong></td><td>{asset.status || 'com_tecnico'}</td><td>{asset.acquisitionCost ? brl(asset.acquisitionCost) : '-'}</td></tr>)}</tbody></table></div>",
"            </div>}",
"          </>;",
"        })()}",
"        {details?.type === 'balance'"
].join('\\n');

if (groupDetailsRegex.test(inbox)) {
  inbox = inbox.replace(groupDetailsRegex, newGroupDetails);
  save(inboxPath, inbox);
} else if (inbox.includes('Seriais vinculados a esta carga')) {
  console.log('Frontend já possui lista detalhada de seriais.');
} else {
  throw new Error('Não encontrei o bloco de detalhes group no TechnicianInbox.jsx.');
}
