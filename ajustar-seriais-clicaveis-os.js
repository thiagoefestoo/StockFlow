const fs = require('fs');

function save(path, content) {
  fs.writeFileSync(path, content, 'utf8');
  console.log('Atualizado:', path);
}

function patchInbox() {
  const file = 'frontend/src/pages/TechnicianInbox.jsx';
  let c = fs.readFileSync(file, 'utf8');

  const oldSave = String.raw`const payload = { ...osForm, technicianId: selectedTech, materials: osForm.materials.map((m) => ({ ...m, serialNumbers: String(m.serialNumbersText || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean) })) };`;

  const newSave = String.raw`const payload = { ...osForm, technicianId: selectedTech, materials: osForm.materials.map((m) => { const selectedSerials = Array.isArray(m.serialNumbers) ? m.serialNumbers.filter(Boolean) : []; const typedSerials = String(m.serialNumbersText || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean); const serialNumbers = selectedSerials.length ? selectedSerials : typedSerials; return { ...m, serialNumbers, serialNumbersText: serialNumbers.join('\n'), quantity: serialNumbers.length || m.quantity }; }) };`;

  c = c.replace(oldSave, newSave);

  const oldUpdate = String.raw`function updateOsMaterial(i, patch) { const materials = [...osForm.materials]; materials[i] = { ...materials[i], ...patch }; setOsForm({ ...osForm, materials }); }`;

  const newUpdate = String.raw`function updateOsMaterial(i, patch) { const materials = [...osForm.materials]; materials[i] = { ...materials[i], ...patch }; setOsForm({ ...osForm, materials }); }
  function toggleOsSerial(i, serialNumber) { const materials = [...osForm.materials]; const current = Array.isArray(materials[i].serialNumbers) ? materials[i].serialNumbers : []; const next = current.includes(serialNumber) ? current.filter((serial) => serial !== serialNumber) : [...current, serialNumber]; materials[i] = { ...materials[i], serialNumbers: next, serialNumbersText: next.join('\n'), quantity: next.length || 1 }; setOsForm({ ...osForm, materials }); }`;

  if (!c.includes('function toggleOsSerial')) {
    c = c.replace(oldUpdate, newUpdate);
  }

  c = c.replace(
    String.raw`onChange={(e) => updateOsMaterial(i, { materialId: e.target.value, serialNumbersText: '' })}`,
    String.raw`onChange={(e) => updateOsMaterial(i, { materialId: e.target.value, serialNumbersText: '', serialNumbers: [] })}`
  );

  const oldTextarea = String.raw`{material?.requiresSerial ? <label>Serial usado<textarea rows="3" value={m.serialNumbersText} onChange={(e) => updateOsMaterial(i, { serialNumbersText: e.target.value })} placeholder={serialByMaterial(m.materialId).map((a) => a.serialNumber).join('\n')} /></label> :`;

  const newPicker = String.raw`{material?.requiresSerial ? <div className="serial-picker"><div className="serial-picker-head"><strong>Seriais sob sua custódia</strong><small>Clique no serial que será instalado/transferido para o cliente.</small></div>{serialByMaterial(m.materialId).length ? <div className="serial-list">{serialByMaterial(m.materialId).map((a) => { const checked = (m.serialNumbers || []).includes(a.serialNumber); return <button type="button" className={`serial-chip ${checked ? 'selected' : ''}`} key={a.id || a.serialNumber} onClick={() => toggleOsSerial(i, a.serialNumber)}><span><b>{a.serialNumber}</b><small>{a.Material?.name || material?.name} • {a.status || 'com_tecnico'}</small></span><em>{checked ? 'Selecionado' : 'Selecionar'}</em></button>; })}</div> : <div className="empty-state small">Nenhum serial disponível para este material na sua custódia.</div>}</div> :`;

  if (c.includes(oldTextarea)) {
    c = c.replace(oldTextarea, newPicker);
  } else {
    console.log('Aviso: textarea da OS não encontrado em TechnicianInbox.jsx ou já foi alterado.');
  }

  save(file, c);
}

function patchPortal() {
  const file = 'frontend/src/pages/TechnicianPortal.jsx';
  if (!fs.existsSync(file)) return;

  let c = fs.readFileSync(file, 'utf8');

  const oldSave = String.raw`const payload = { ...form, technicianId: selectedTech, materials: form.materials.map((m) => ({ ...m, serialNumbers: String(m.serialNumbersText || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean) })) };`;

  const newSave = String.raw`const payload = { ...form, technicianId: selectedTech, materials: form.materials.map((m) => { const selectedSerials = Array.isArray(m.serialNumbers) ? m.serialNumbers.filter(Boolean) : []; const typedSerials = String(m.serialNumbersText || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean); const serialNumbers = selectedSerials.length ? selectedSerials : typedSerials; return { ...m, serialNumbers, serialNumbersText: serialNumbers.join('\n'), quantity: serialNumbers.length || m.quantity }; }) };`;

  c = c.replace(oldSave, newSave);

  const oldUpdate = String.raw`function updateMat(i, patch) { const materials = [...form.materials]; materials[i] = { ...materials[i], ...patch }; setForm({ ...form, materials }); }`;

  const newUpdate = String.raw`function updateMat(i, patch) { const materials = [...form.materials]; materials[i] = { ...materials[i], ...patch }; setForm({ ...form, materials }); }
  function toggleMatSerial(i, serialNumber) { const materials = [...form.materials]; const current = Array.isArray(materials[i].serialNumbers) ? materials[i].serialNumbers : []; const next = current.includes(serialNumber) ? current.filter((serial) => serial !== serialNumber) : [...current, serialNumber]; materials[i] = { ...materials[i], serialNumbers: next, serialNumbersText: next.join('\n'), quantity: next.length || 1 }; setForm({ ...form, materials }); }`;

  if (!c.includes('function toggleMatSerial')) {
    c = c.replace(oldUpdate, newUpdate);
  }

  c = c.replace(
    String.raw`onChange={(e) => updateMat(i, { materialId: e.target.value, serialNumbersText: '' })}`,
    String.raw`onChange={(e) => updateMat(i, { materialId: e.target.value, serialNumbersText: '', serialNumbers: [] })}`
  );

  const oldTextarea = String.raw`{material?.requiresSerial ? <label>Serial usado<textarea rows="3" value={m.serialNumbersText} onChange={(e) => updateMat(i, { serialNumbersText: e.target.value })} placeholder={serialByMaterial(m.materialId).map((a) => a.serialNumber).join('\n')} /></label> :`;

  const newPicker = String.raw`{material?.requiresSerial ? <div className="serial-picker"><div className="serial-picker-head"><strong>Seriais sob sua custódia</strong><small>Clique no serial que será instalado/transferido para o cliente.</small></div>{serialByMaterial(m.materialId).length ? <div className="serial-list">{serialByMaterial(m.materialId).map((a) => { const checked = (m.serialNumbers || []).includes(a.serialNumber); return <button type="button" className={`serial-chip ${checked ? 'selected' : ''}`} key={a.id || a.serialNumber} onClick={() => toggleMatSerial(i, a.serialNumber)}><span><b>{a.serialNumber}</b><small>{a.Material?.name || material?.name} • {a.status || 'com_tecnico'}</small></span><em>{checked ? 'Selecionado' : 'Selecionar'}</em></button>; })}</div> : <div className="empty-state small">Nenhum serial disponível para este material na sua custódia.</div>}</div> :`;

  if (c.includes(oldTextarea)) {
    c = c.replace(oldTextarea, newPicker);
  } else {
    console.log('Aviso: textarea da OS não encontrado em TechnicianPortal.jsx ou já foi alterado.');
  }

  save(file, c);
}

function patchCss() {
  const file = 'frontend/src/styles.css';
  let c = fs.readFileSync(file, 'utf8');

  if (!c.includes('.serial-chip')) {
    c += `

.serial-picker {
  border: 1px solid var(--line, #d9e4f2);
  border-radius: 16px;
  padding: 12px;
  background: rgba(248, 251, 255, 0.96);
}

.serial-picker-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

.serial-picker-head small {
  color: var(--muted, #64748b);
}

.serial-list {
  display: grid;
  gap: 8px;
}

.serial-chip {
  border: 1px solid var(--line, #d9e4f2);
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  text-align: left;
  cursor: pointer;
  color: var(--text, #0f172a);
}

.serial-chip span {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.serial-chip small {
  color: var(--muted, #64748b);
  font-weight: 600;
}

.serial-chip em {
  font-style: normal;
  font-weight: 800;
  color: #2563eb;
  white-space: nowrap;
}

.serial-chip.selected {
  border-color: #2563eb;
  background: #eff6ff;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.serial-chip.selected em {
  color: #15803d;
}

@media (max-width: 640px) {
  .serial-chip {
    align-items: flex-start;
    flex-direction: column;
  }
}
`;
  }

  save(file, c);
}

patchInbox();
patchPortal();
patchCss();

console.log('Lista clicável de seriais aplicada com sucesso.');
