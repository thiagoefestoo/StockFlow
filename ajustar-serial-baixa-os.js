const fs = require('fs');

function save(path, content) {
  fs.writeFileSync(path, content, 'utf8');
  console.log('Atualizado:', path);
}

function patchTechnicianInbox() {
  const file = 'frontend/src/pages/TechnicianInbox.jsx';
  let c = fs.readFileSync(file, 'utf8');

  const oldSave = "const payload = { ...osForm, technicianId: selectedTech, materials: osForm.materials.map((m) => ({ ...m, serialNumbers: String(m.serialNumbersText || '').split(/\\n|,|;/).map((s) => s.trim()).filter(Boolean) })) };";
  const newSave = "const payload = { ...osForm, technicianId: selectedTech, materials: osForm.materials.map((m) => { const selectedSerials = Array.isArray(m.serialNumbers) && m.serialNumbers.length ? m.serialNumbers : String(m.serialNumbersText || '').split(/\\n|,|;/).map((s) => s.trim()).filter(Boolean); return { ...m, serialNumbers: selectedSerials, serialNumbersText: selectedSerials.join('\\n'), quantity: selectedSerials.length || m.quantity }; }) };";

  if (c.includes(oldSave)) {
    c = c.replace(oldSave, newSave);
  } else {
    console.log('Aviso: payload da OS em TechnicianInbox já estava diferente ou já foi ajustado.');
  }

  const updateFn = "function updateOsMaterial(i, patch) { const materials = [...osForm.materials]; materials[i] = { ...materials[i], ...patch }; setOsForm({ ...osForm, materials }); }";
  const toggleFn = updateFn + "\n  function toggleOsSerial(i, serialNumber) { const materials = [...osForm.materials]; const current = Array.isArray(materials[i].serialNumbers) ? materials[i].serialNumbers : []; const next = current.includes(serialNumber) ? current.filter((serial) => serial !== serialNumber) : [...current, serialNumber]; materials[i] = { ...materials[i], serialNumbers: next, serialNumbersText: next.join('\\n'), quantity: next.length || 1 }; setOsForm({ ...osForm, materials }); }";

  if (!c.includes('function toggleOsSerial')) {
    if (c.includes(updateFn)) {
      c = c.replace(updateFn, toggleFn);
    } else {
      throw new Error('Não encontrei updateOsMaterial em TechnicianInbox.jsx.');
    }
  }

  const oldSerial = "{material?.requiresSerial ? <label>Serial usado<textarea rows=\"3\" value={m.serialNumbersText} onChange={(e) => updateOsMaterial(i, { serialNumbersText: e.target.value })} placeholder={serialByMaterial(m.materialId).map((a) => a.serialNumber).join('\\n')} /></label> :";
  const newSerial = "{material?.requiresSerial ? <div className=\"serial-picker\"><div className=\"serial-picker-head\"><strong>Seriais sob sua custódia</strong><small>Selecione o serial instalado nesta OS.</small></div>{serialByMaterial(m.materialId).length ? <div className=\"serial-list\">{serialByMaterial(m.materialId).map((a) => <label className=\"serial-option\" key={a.id || a.serialNumber}><input type=\"checkbox\" checked={(m.serialNumbers || []).includes(a.serialNumber)} onChange={() => toggleOsSerial(i, a.serialNumber)} /><span><b>{a.serialNumber}</b><small>{a.Material?.name || material?.name} • {a.status || 'com_tecnico'}</small></span></label>)}</div> : <div className=\"empty-state small\">Nenhum serial disponível para este material na sua custódia.</div>}</div> :";

  if (c.includes(oldSerial)) {
    c = c.replace(oldSerial, newSerial);
  } else if (!c.includes('Seriais sob sua custódia')) {
    throw new Error('Não encontrei o campo de serial da OS em TechnicianInbox.jsx.');
  }

  save(file, c);
}

function patchTechnicianPortal() {
  const file = 'frontend/src/pages/TechnicianPortal.jsx';
  if (!fs.existsSync(file)) return;

  let c = fs.readFileSync(file, 'utf8');

  const oldSave = "const payload = { ...form, technicianId: selectedTech, materials: form.materials.map((m) => ({ ...m, serialNumbers: String(m.serialNumbersText || '').split(/\\n|,|;/).map((s) => s.trim()).filter(Boolean) })) };";
  const newSave = "const payload = { ...form, technicianId: selectedTech, materials: form.materials.map((m) => { const selectedSerials = Array.isArray(m.serialNumbers) && m.serialNumbers.length ? m.serialNumbers : String(m.serialNumbersText || '').split(/\\n|,|;/).map((s) => s.trim()).filter(Boolean); return { ...m, serialNumbers: selectedSerials, serialNumbersText: selectedSerials.join('\\n'), quantity: selectedSerials.length || m.quantity }; }) };";

  if (c.includes(oldSave)) {
    c = c.replace(oldSave, newSave);
  }

  const updateFn = "function updateMat(i, patch) { const materials = [...form.materials]; materials[i] = { ...materials[i], ...patch }; setForm({ ...form, materials }); }";
  const toggleFn = updateFn + "\n  function toggleMatSerial(i, serialNumber) { const materials = [...form.materials]; const current = Array.isArray(materials[i].serialNumbers) ? materials[i].serialNumbers : []; const next = current.includes(serialNumber) ? current.filter((serial) => serial !== serialNumber) : [...current, serialNumber]; materials[i] = { ...materials[i], serialNumbers: next, serialNumbersText: next.join('\\n'), quantity: next.length || 1 }; setForm({ ...form, materials }); }";

  if (!c.includes('function toggleMatSerial')) {
    if (c.includes(updateFn)) {
      c = c.replace(updateFn, toggleFn);
    }
  }

  const oldSerial = "{material?.requiresSerial ? <label>Serial usado<textarea rows=\"3\" value={m.serialNumbersText} onChange={(e) => updateMat(i, { serialNumbersText: e.target.value })} placeholder={serialByMaterial(m.materialId).map((a) => a.serialNumber).join('\\n')} /></label> :";
  const newSerial = "{material?.requiresSerial ? <div className=\"serial-picker\"><div className=\"serial-picker-head\"><strong>Seriais sob sua custódia</strong><small>Selecione o serial instalado nesta OS.</small></div>{serialByMaterial(m.materialId).length ? <div className=\"serial-list\">{serialByMaterial(m.materialId).map((a) => <label className=\"serial-option\" key={a.id || a.serialNumber}><input type=\"checkbox\" checked={(m.serialNumbers || []).includes(a.serialNumber)} onChange={() => toggleMatSerial(i, a.serialNumber)} /><span><b>{a.serialNumber}</b><small>{a.Material?.name || material?.name} • {a.status || 'com_tecnico'}</small></span></label>)}</div> : <div className=\"empty-state small\">Nenhum serial disponível para este material na sua custódia.</div>}</div> :";

  if (c.includes(oldSerial)) {
    c = c.replace(oldSerial, newSerial);
  }

  save(file, c);
}

function patchStyles() {
  const file = 'frontend/src/styles.css';
  let c = fs.readFileSync(file, 'utf8');

  if (!c.includes('.serial-picker')) {
    c += `

.serial-picker {
  border: 1px solid var(--line, #d9e4f2);
  border-radius: 16px;
  padding: 12px;
  background: rgba(248, 251, 255, 0.9);
}

.serial-picker-head {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 10px;
}

.serial-picker-head small {
  color: var(--muted, #64748b);
}

.serial-list {
  display: grid;
  gap: 8px;
}

.serial-option {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--line, #d9e4f2);
  border-radius: 12px;
  padding: 10px;
  background: #fff;
  cursor: pointer;
}

.serial-option input {
  width: 18px;
  height: 18px;
}

.serial-option span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.serial-option small {
  color: var(--muted, #64748b);
}
`;
    save(file, c);
  }
}

patchTechnicianInbox();
patchTechnicianPortal();
patchStyles();

console.log('Ajuste concluído.');
