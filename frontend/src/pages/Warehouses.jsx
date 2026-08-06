import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { sortRecentFirst, sortNestedRecentFirst } from '../utils/recentFirst';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';
import OperationReviewModal from '../components/OperationReviewModal';
import { duplicateItemIds, duplicateSerials, optionsWithoutSelected, selectedSerialsExcept } from '../utils/operationSelections';
import { useAuth } from '../contexts/AuthContext';
import { formatQuantity } from '../utils/formatQuantity';

const empty = {
  name: '',
  code: '',
  region: '',
  city: '',
  state: '',
  address: '',
  responsibleName: '',
  approvalLimit: 0,
  isReverseLogistics: false,
  status: 'ativo',
  notes: '',
};

function brl(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function splitSerials(value) { return String(value || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean); }


function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function excelCell(value, { type = 'String', style = '' } = {}) {
  const normalized = value === null || value === undefined || value === '' ? '-' : value;
  const styleAttribute = style ? ` ss:StyleID="${style}"` : '';
  if (type === 'Number') {
    const number = Number(normalized);
    return `<Cell${styleAttribute}><Data ss:Type="Number">${Number.isFinite(number) ? number : 0}</Data></Cell>`;
  }
  return `<Cell${styleAttribute}><Data ss:Type="String">${xmlEscape(normalized)}</Data></Cell>`;
}

function excelWorksheet(name, columns, rows) {
  const columnDefinitions = columns.map((column) => `<Column ss:AutoFitWidth="0" ss:Width="${column.width || 120}"/>`).join('');
  const header = columns.map((column) => excelCell(column.label, { style: 'Header' })).join('');
  const body = rows.map((row) => `<Row>${columns.map((column) => {
    const value = typeof column.value === 'function' ? column.value(row) : row?.[column.value];
    return excelCell(value, { type: column.type || 'String', style: column.style || '' });
  }).join('')}</Row>`).join('');

  return `<Worksheet ss:Name="${xmlEscape(name.slice(0, 31))}"><Table>${columnDefinitions}<Row>${header}</Row>${body}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions></Worksheet>`;
}

function downloadWarehouseExcel(details) {
  if (!details?.warehouse) return;

  const warehouse = details.warehouse;
  const bi = details.bi || {};
  const summaryRows = [
    ['Número/código', warehouse.code],
    ['Nome', warehouse.name],
    ['Cidade', warehouse.city || '-'],
    ['UF', warehouse.state || '-'],
    ['Região', warehouse.region || '-'],
    ['Endereço', warehouse.address || '-'],
    ['Responsável', warehouse.responsibleName || '-'],
    ['Status', warehouse.status === 'ativo' ? 'Ativo' : warehouse.status || '-'],
    ['Limite local de aprovação', Number(warehouse.approvalLimit || 0)],
    ['Valor total', Number(bi.totalValue || 0)],
    ['Valor em materiais consumíveis', Number(bi.consumableValue || 0)],
    ['Valor em equipamentos', Number(bi.assetValue || 0)],
    ['Equipamentos serializados', Number(bi.assetCount || 0)],
    ['Linhas consumíveis', Number(bi.consumableLines || 0)],
    ['Usuários vinculados', Number(bi.linkedUsers || 0)],
    ['Técnicos vinculados', Number(bi.linkedTechnicians || 0)],
    ['Movimentações de entrada', Number(bi.incomingMovements || 0)],
    ['Movimentações de saída', Number(bi.outgoingMovements || 0)],
    ['Transferências para técnicos', Number(bi.technicianTransfers || 0)],
    ['Retornos de técnicos', Number(bi.returns || 0)],
    ['Última movimentação', dt(bi.lastMovementAt)],
    ['Observações', warehouse.notes || '-'],
  ].map(([indicator, value]) => ({ indicator, value }));

  let sheets = [
    excelWorksheet('Resumo', [
      { label: 'INDICADOR', value: 'indicator', width: 220 },
      { label: 'VALOR', value: (row) => row.value, width: 220 },
    ], summaryRows),
    excelWorksheet('Usuários vinculados', [
      { label: 'NOME', value: (row) => row.name || '-', width: 190 },
      { label: 'E-MAIL', value: (row) => row.email || '-', width: 220 },
      { label: 'PERFIL', value: (row) => row.role || '-', width: 110 },
      { label: 'STATUS', value: (row) => row.status || '-', width: 100 },
      { label: 'LIMITE DE APROVAÇÃO', value: (row) => Number(row.approvalLimit || 0), type: 'Number', style: 'Money', width: 145 },
    ], details.users || []),
    excelWorksheet('Técnicos vinculados', [
      { label: 'NOME', value: (row) => row.name || '-', width: 190 },
      { label: 'E-MAIL', value: (row) => row.email || '-', width: 220 },
      { label: 'TELEFONE', value: (row) => row.phone || '-', width: 120 },
      { label: 'STATUS', value: (row) => row.status || '-', width: 100 },
      { label: 'CIDADES DE ATENDIMENTO', value: (row) => (row.serviceCities || []).join(', ') || '-', width: 260 },
    ], details.technicians || []),
    excelWorksheet('Equipamentos', [
      { label: 'MATERIAL', value: (row) => row.Material?.name || '-', width: 230 },
      { label: 'SKU', value: (row) => row.Material?.sku || '-', width: 110 },
      { label: 'CATEGORIA', value: (row) => row.Material?.category || '-', width: 100 },
      { label: 'SERIAL', value: (row) => row.serialNumber || '-', width: 170 },
      { label: 'MAC', value: (row) => row.mac || '-', width: 150 },
      { label: 'MARCA', value: (row) => row.brand || '-', width: 120 },
      { label: 'MODELO', value: (row) => row.model || '-', width: 150 },
      { label: 'STATUS', value: (row) => row.status || '-', width: 110 },
      { label: 'VALOR', value: (row) => Number(row.acquisitionCost || row.Material?.unitCost || 0), type: 'Number', style: 'Money', width: 100 },
    ], details.assets || []),
    excelWorksheet('Materiais consumíveis', [
      { label: 'MATERIAL', value: (row) => row.Material?.name || '-', width: 240 },
      { label: 'SKU', value: (row) => row.Material?.sku || '-', width: 110 },
      { label: 'CATEGORIA', value: (row) => row.Material?.category || '-', width: 100 },
      { label: 'UNIDADE', value: (row) => row.Material?.unit || '-', width: 90 },
      { label: 'QUANTIDADE', value: (row) => Number(row.quantity || 0), type: 'Number', style: 'Integer', width: 100 },
      { label: 'CUSTO UNITÁRIO', value: (row) => Number(row.Material?.unitCost || 0), type: 'Number', style: 'Money', width: 110 },
      { label: 'VALOR TOTAL', value: (row) => Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), type: 'Number', style: 'Money', width: 120 },
    ], details.balances || []),
    excelWorksheet('Movimentações', [
      { label: 'DATA/HORA', value: (row) => dt(row.movementAt), width: 145 },
      { label: 'REFERÊNCIA', value: (row) => row.reference || '-', width: 150 },
      { label: 'TIPO', value: (row) => row.type || '-', width: 135 },
      { label: 'MATERIAL', value: (row) => row.Material?.name || '-', width: 230 },
      { label: 'QUANTIDADE', value: (row) => Number(row.quantity || 0), type: 'Number', style: 'Integer', width: 100 },
      { label: 'SERIAL', value: (row) => row.serialNumber || '-', width: 160 },
      { label: 'ORIGEM', value: (row) => row.fromWarehouse?.name || row.fromTechnician?.name || row.fromOwnerType || '-', width: 190 },
      { label: 'DESTINO', value: (row) => row.toWarehouse?.name || row.toTechnician?.name || row.toOwnerType || '-', width: 190 },
      { label: 'OPERADOR', value: (row) => row.createdBy?.name || 'Sistema', width: 150 },
      { label: 'OBSERVAÇÕES', value: (row) => row.notes || '-', width: 260 },
    ], details.movements || []),
  ];


  if (warehouse.isReverseLogistics) {
    const inventoryRows = (details.reverseInventory || []).flatMap((group) => {
      if (group.requiresSerial) {
        return (group.serials || []).map((serial) => ({
          code: group.code,
          description: group.description,
          serialNumber: serial.serialNumber,
          quantity: 1,
          unit: group.unit || 'un',
          unitCost: Number(group.unitCost || 0),
          totalValue: Number(group.unitCost || 0),
          condition: serial.condition || group.condition || 'usado',
          receivedAt: serial.receivedAt || group.lastReceivedAt,
        }));
      }
      return [{
        code: group.code,
        description: group.description,
        serialNumber: '',
        quantity: Number(group.quantity || 0),
        unit: group.unit || 'un',
        unitCost: Number(group.unitCost || 0),
        totalValue: Number(group.totalValue || 0),
        condition: group.condition || 'usado',
        receivedAt: group.lastReceivedAt,
      }];
    });

    const reverseSummaryRows = [
      ['Número/código', warehouse.code],
      ['Nome', warehouse.name],
      ['Tipo', 'Estoque isolado de logística reversa'],
      ['Cidade', warehouse.city || '-'],
      ['UF', warehouse.state || '-'],
      ['Status', warehouse.status === 'ativo' ? 'Ativo' : warehouse.status || '-'],
      ['Quantidade atual em saldo', Number(bi.totalQuantity || 0)],
      ['Valor atual isolado', Number(bi.totalValue || 0)],
      ['Equipamentos serializados em saldo', Number(bi.assetCount || 0)],
      ['Linhas por quantidade em saldo', Number(bi.consumableLines || 0)],
      ['Entradas isoladas', Number(bi.incomingEntries || 0)],
      ['Saídas isoladas para fornecedor', Number(bi.reverseOutgoingMovements || 0)],
      ['Quantidade total recebida', Number(bi.receivedQuantity || 0)],
      ['Valor total recebido', Number(bi.receivedValue || 0)],
      ['Quantidade total entregue ao fornecedor', Number(bi.exitedQuantity || 0)],
      ['Valor total entregue ao fornecedor', Number(bi.exitedValue || 0)],
      ['Última operação reversa', dt(bi.lastMovementAt)],
      ['Observações', warehouse.notes || '-'],
    ].map(([indicator, value]) => ({ indicator, value }));

    const entryRows = (details.reverseEntries || []).flatMap((entry) => {
      const items = entry.items || [];
      if (!items.length) return [{ entry }];
      return items.map((item) => ({ ...item, entry }));
    });
    const exitRows = (details.reverseExits || []).flatMap((exit) => (exit.items || []).map((item) => ({ ...item, exit })));

    sheets = [
      excelWorksheet('Resumo', [
        { label: 'INDICADOR', value: 'indicator', width: 220 },
        { label: 'VALOR', value: (row) => row.value, width: 220 },
      ], reverseSummaryRows),
      excelWorksheet('Saldo atual', [
        { label: 'CÓDIGO', value: 'code', width: 120 },
        { label: 'DESCRIÇÃO', value: 'description', width: 260 },
        { label: 'SERIAL/PATRIMÔNIO', value: 'serialNumber', width: 180 },
        { label: 'QUANTIDADE', value: 'quantity', type: 'Number', style: 'Integer', width: 100 },
        { label: 'UNIDADE', value: 'unit', width: 80 },
        { label: 'VALOR UNITÁRIO', value: 'unitCost', type: 'Number', style: 'Money', width: 110 },
        { label: 'VALOR TOTAL', value: 'totalValue', type: 'Number', style: 'Money', width: 110 },
        { label: 'CONDIÇÃO', value: 'condition', width: 110 },
        { label: 'RECEBIDO EM', value: (row) => dt(row.receivedAt), width: 150 },
      ], inventoryRows),
      excelWorksheet('Entradas reversas', [
        { label: 'REFERÊNCIA', value: (row) => row.entry?.reference || '-', width: 170 },
        { label: 'DATA', value: (row) => row.entry?.receivedAt || '-', width: 110 },
        { label: 'ORIGEM', value: (row) => row.entry?.sourceCompany || '-', width: 180 },
        { label: 'DOCUMENTO', value: (row) => row.entry?.documentNumber || '-', width: 150 },
        { label: 'CÓDIGO', value: (row) => row.code || '-', width: 120 },
        { label: 'DESCRIÇÃO', value: (row) => row.description || '-', width: 240 },
        { label: 'SERIAL', value: (row) => row.serialNumber || '-', width: 170 },
        { label: 'QUANTIDADE', value: (row) => Number(row.quantity || row.entry?.totalQuantity || 0), type: 'Number', style: 'Integer', width: 100 },
        { label: 'UNIDADE', value: (row) => row.unit || '-', width: 80 },
        { label: 'VALOR UNITÁRIO', value: (row) => Number(row.unitCost || 0), type: 'Number', style: 'Money', width: 110 },
        { label: 'VALOR TOTAL', value: (row) => Number(row.quantity || 0) * Number(row.unitCost || 0), type: 'Number', style: 'Money', width: 110 },
        { label: 'CONDIÇÃO', value: (row) => row.condition || '-', width: 100 },
        { label: 'OPERADOR', value: (row) => row.entry?.createdBy?.name || 'Sistema', width: 150 },
        { label: 'OBSERVAÇÕES', value: (row) => row.notes || row.entry?.notes || '-', width: 260 },
      ], entryRows),
      excelWorksheet('Saídas reversas', [
        { label: 'REFERÊNCIA', value: (row) => row.exit?.reference || '-', width: 170 },
        { label: 'DATA', value: (row) => dt(row.exit?.createdAt), width: 150 },
        { label: 'FORNECEDOR', value: (row) => row.exit?.supplierName || '-', width: 190 },
        { label: 'DOCUMENTO', value: (row) => row.exit?.documentNumber || '-', width: 150 },
        { label: 'CÓDIGO', value: 'code', width: 120 },
        { label: 'DESCRIÇÃO', value: 'description', width: 240 },
        { label: 'SERIAL', value: (row) => row.serialNumber || '-', width: 170 },
        { label: 'QUANTIDADE', value: (row) => Number(row.quantity || 0), type: 'Number', style: 'Integer', width: 100 },
        { label: 'VALOR', value: (row) => Number(row.totalCost || 0), type: 'Number', style: 'Money', width: 100 },
      ], exitRows),
    ];
  }

  const workbook = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40"><DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Author>Super Infra Business Suite</Author><Title>Estoque ${xmlEscape(warehouse.name)}</Title><Created>${new Date().toISOString()}</Created></DocumentProperties><ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel"><WindowHeight>12000</WindowHeight><WindowWidth>22000</WindowWidth><ProtectStructure>False</ProtectStructure><ProtectWindows>False</ProtectWindows></ExcelWorkbook><Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Borders/><Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11"/><Interior/><NumberFormat/><Protection/></Style><Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#165DFF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0B3B9E"/></Borders></Style><Style ss:ID="Money"><NumberFormat ss:Format="R$ #,##0.00"/></Style><Style ss:ID="Integer"><NumberFormat ss:Format="0"/></Style></Styles>${sheets.join('')}</Workbook>`;

  const blob = new Blob(['\ufeff', workbook], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = String(warehouse.code || warehouse.name || 'estoque').replace(/[^a-zA-Z0-9-_]+/g, '_');
  link.href = url;
  link.download = `estoque_${safeName}_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function emptyTransfer(toWarehouseId = '') {
  return { fromWarehouseId: '', toWarehouseId, reference: '', notes: '', items: [] };
}

function emptyReverseExit() {
  return { reference: '', supplierName: '', documentNumber: '', notes: '', items: [] };
}

export default function Warehouses() {
  const { isAdmin, user } = useAuth();
  const [rows, setRows] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [availableAssets, setAvailableAssets] = useState([]);
  const [transferInventoryLoading, setTransferInventoryLoading] = useState(false);
  const [form, setForm] = useState(empty);
  const [modal, setModal] = useState(false);
  const [details, setDetails] = useState(null);
  const [transferModal, setTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState(emptyTransfer());
  const [assetSearch, setAssetSearch] = useState('');
  const [message, setMessage] = useState('');
  const [transferReviewOpen, setTransferReviewOpen] = useState(false);
  const [transferSaving, setTransferSaving] = useState(false);
  const [reverseExitModal, setReverseExitModal] = useState(false);
  const [reverseExitWarehouse, setReverseExitWarehouse] = useState(null);
  const [reverseExitDetails, setReverseExitDetails] = useState(null);
  const [reverseExitForm, setReverseExitForm] = useState(emptyReverseExit());
  const [reverseExitReviewOpen, setReverseExitReviewOpen] = useState(false);
  const [reverseExitSaving, setReverseExitSaving] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);

  const canManageStructure = isAdmin || user?.role === 'supervisor';

  async function load() {
    const response = await api.get('/warehouses');
    setRows(sortRecentFirst(response.data.data || [], ['createdAt']));
  }

  async function loadTransferInventory(fromWarehouseId) {
    if (!fromWarehouseId) {
      setMaterials([]);
      setAvailableAssets([]);
      return;
    }

    try {
      setTransferInventoryLoading(true);
      const [materialResponse, assetResponse] = await Promise.all([
        api.get('/materials', {
          params: {
            warehouseId: fromWarehouseId,
            availableOnly: true,
          },
        }),
        api.get('/stock/assets', {
          params: {
            ownerType: 'estoque',
            status: 'em_estoque',
            warehouseId: fromWarehouseId,
            limit: 2500,
          },
        }),
      ]);

      setMaterials(
        [...(materialResponse.data.data || [])].sort((left, right) => (
          String(left.name || left.sku || '').localeCompare(
            String(right.name || right.sku || ''),
            'pt-BR',
            { sensitivity: 'base', numeric: true },
          )
        )),
      );
      setAvailableAssets(
        sortRecentFirst(
          assetResponse.data.data || [],
          ['updatedAt', 'createdAt'],
        ),
      );
    } catch (error) {
      setMaterials([]);
      setAvailableAssets([]);
      setMessage(
        error.response?.data?.message
        || 'Não foi possível carregar o saldo do estoque de origem.',
      );
    } finally {
      setTransferInventoryLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (transferModal) {
      loadTransferInventory(transferForm.fromWarehouseId);
    }
  }, [transferModal, transferForm.fromWarehouseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const operationalRows = useMemo(() => rows.filter((row) => !row.isReverseLogistics), [rows]);
  const reverseRows = useMemo(() => rows.filter((row) => row.isReverseLogistics), [rows]);
  const totalValue = operationalRows.reduce((sum, row) => sum + Number(row.totalValue || 0), 0);

  const assetsByMaterial = useMemo(() => {
    const map = {};
    for (const asset of availableAssets) {
      map[asset.materialId] = map[asset.materialId] || [];
      map[asset.materialId].push(asset);
    }
    return map;
  }, [availableAssets]);

  async function save() {
    try {
      setMessage('');
      if (form.id) await api.put(`/warehouses/${form.id}`, form);
      else await api.post('/warehouses', form);
      setModal(false);
      setForm(empty);
      await load();
      setMessage('Estoque salvo com sucesso.');
    } catch (e) {
      setMessage(e.response?.data?.message || 'Erro ao salvar estoque.');
    }
  }

  async function openDetails(row) {
    const res = await api.get(`/warehouses/${row.id}`);
    setDetails(sortNestedRecentFirst(res.data.data, {
      reverseEntries: ['receivedAt', 'createdAt'],
      reverseExits: ['createdAt'],
      users: ['createdAt'],
      technicians: ['createdAt'],
      assets: ['updatedAt', 'createdAt'],
      balances: ['updatedAt', 'createdAt'],
      movements: ['movementAt', 'createdAt'],
    }));
  }

  async function downloadDetailsExcel() {
    if (!details || excelLoading) return;
    try {
      setExcelLoading(true);
      setMessage('');
      let exportDetails = details;
      if (details.warehouse?.isReverseLogistics) {
        const response = await api.get(`/warehouses/${details.warehouse.id}/reverse-export`);
        exportDetails = { ...details, ...(response.data.data || {}) };
      }
      downloadWarehouseExcel(exportDetails);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Não foi possível gerar o Excel do estoque.');
    } finally {
      setExcelLoading(false);
    }
  }

  function openTransfer(row = null) {
    if (row?.isReverseLogistics) {
      setMessage('Estoque de logística reversa não participa de transferências. Use Registrar saída para fornecedor.');
      return;
    }
    setTransferForm(emptyTransfer(row?.id || ''));
    setMaterials([]);
    setAvailableAssets([]);
    setAssetSearch('');
    setTransferReviewOpen(false);
    setTransferModal(true);
  }

  function changeTransferSourceWarehouse(fromWarehouseId) {
    setTransferReviewOpen(false);
    setAssetSearch('');
    setMaterials([]);
    setAvailableAssets([]);
    setTransferForm((current) => ({
      ...current,
      fromWarehouseId,
      toWarehouseId: String(current.toWarehouseId) === String(fromWarehouseId)
        ? ''
        : current.toWarehouseId,
      items: [],
    }));
  }

  function addTransferItem() {
    if (!transferForm.fromWarehouseId) {
      setMessage('Selecione primeiro o estoque de origem.');
      return;
    }

    const selected = new Set(
      transferForm.items.map((item) => String(item.materialId || '')),
    );
    const firstAvailable = materials.find(
      (material) => !selected.has(String(material.id)),
    );

    setTransferForm((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          materialId: firstAvailable?.id || '',
          quantity: 1,
          serialNumbers: [],
        },
      ],
    }));
  }

  function removeTransferItem(index) {
    setTransferForm((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) }));
  }

  function updateTransferItem(index, patch) {
    setTransferForm((current) => {
      const items = [...current.items];
      items[index] = { ...items[index], ...patch };
      return { ...current, items };
    });
  }

  function toggleSerial(index, serialNumber) {
    const item = transferForm.items[index];
    const selected = new Set(item.serialNumbers || []);
    if (selected.has(serialNumber)) selected.delete(serialNumber);
    else selected.add(serialNumber);
    updateTransferItem(index, { serialNumbers: Array.from(selected), quantity: selected.size });
  }

  function validateWarehouseTransfer() {
    if (!transferForm.fromWarehouseId) return 'Selecione o estoque de origem.';
    if (!transferForm.toWarehouseId) return 'Selecione o estoque de destino.';
    if (String(transferForm.fromWarehouseId) === String(transferForm.toWarehouseId)) {
      return 'O estoque de origem e o destino precisam ser diferentes.';
    }
    if (transferInventoryLoading) return 'Aguarde o carregamento do saldo do estoque de origem.';
    if (!transferForm.items.length) return 'Adicione pelo menos um item à transferência.';
    if (duplicateItemIds(transferForm.items).length) {
      return 'O mesmo material não pode ser selecionado mais de uma vez.';
    }

    const repeatedSerials = duplicateSerials(transferForm.items);
    if (repeatedSerials.length) {
      return `O mesmo serial não pode ser selecionado mais de uma vez: ${repeatedSerials.join(', ')}.`;
    }

    for (const item of transferForm.items) {
      const material = materials.find(
        (row) => Number(row.id) === Number(item.materialId),
      );

      if (!material) {
        return 'Existe item que não pertence mais ao saldo do estoque de origem.';
      }

      if (material.requiresSerial) {
        const serialNumbers = item.serialNumbers || [];
        if (!serialNumbers.length) {
          return `Selecione ao menos um serial de ${material.name}.`;
        }

        const invalidSerial = serialNumbers.find((serialNumber) => {
          const asset = availableAssets.find(
            (row) => String(row.serialNumber) === String(serialNumber),
          );
          return !asset || Number(asset.materialId) !== Number(material.id);
        });

        if (invalidSerial) {
          return `O serial ${invalidSerial} não está mais disponível para ${material.name} no estoque de origem.`;
        }

        continue;
      }

      const quantity = Number(item.quantity || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return `Informe uma quantidade válida para ${material.name}.`;
      }
      if (!Number.isInteger(quantity)) {
        return `A quantidade de ${material.name} precisa ser um número inteiro.`;
      }
      if (quantity > Number(material.mainStock || 0)) {
        return `Quantidade maior que o saldo de ${material.name}. Disponível: ${formatQuantity(material.mainStock, material.unit)}.`;
      }
    }

    return '';
  }

  function openWarehouseTransferReview() {
    const error = validateWarehouseTransfer();
    if (error) { setMessage(error); return; }
    setTransferReviewOpen(true);
  }

  async function submitWarehouseTransfer() {
    if (transferSaving) return;
    try {
      setMessage('');
      const error = validateWarehouseTransfer();
      if (error) throw new Error(error);
      setTransferSaving(true);
      const payload = {
        ...transferForm,
        items: transferForm.items.map((item) => {
          const serialNumbers = Array.isArray(item.serialNumbers) ? item.serialNumbers : splitSerials(item.serialNumbersText);
          return { ...item, quantity: Number(serialNumbers.length || item.quantity || 0), serialNumbers };
        }),
      };
      const response = await api.post('/warehouses/transfer-stock', payload);
      const operationNumber = response.data?.data?.plan?.operationNumber
        || response.data?.data?.plan?.reference
        || '';
      setTransferReviewOpen(false);
      setTransferModal(false);
      setTransferForm(emptyTransfer());
      setMaterials([]);
      setAvailableAssets([]);
      await load();
      setMessage(
        operationNumber
          ? `Solicitação ${operationNumber} enviada para aprovação. O saldo será movimentado somente após aprovação.`
          : 'Solicitação enviada para aprovação do administrador. O saldo será movimentado somente após aprovação.',
      );
    } catch (e) {
      setMessage(e.response?.data?.message || e.message || 'Erro ao transferir entre estoques.');
    } finally {
      setTransferSaving(false);
    }
  }


  async function openReverseExit(row) {
    try {
      setMessage('');
      const response = await api.get(`/warehouses/${row.id}`);
      setReverseExitWarehouse(row);
      setReverseExitDetails(sortNestedRecentFirst(response.data.data, {
        reverseEntries: ['receivedAt', 'createdAt'],
        reverseExits: ['createdAt'],
        assets: ['updatedAt', 'createdAt'],
        balances: ['updatedAt', 'createdAt'],
        movements: ['movementAt', 'createdAt'],
      }));
      setReverseExitForm(emptyReverseExit());
      setReverseExitModal(true);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Não foi possível carregar o estoque de logística reversa.');
    }
  }

  const reverseInventoryMaterials = useMemo(() => {
    if (!reverseExitDetails) return [];
    return (reverseExitDetails.reverseInventory || []).map((row) => ({
      inventoryKey: row.inventoryKey,
      code: row.code,
      name: row.description,
      description: row.description,
      unit: row.unit || 'un',
      unitCost: Number(row.unitCost || 0),
      requiresSerial: !!row.requiresSerial,
      availableQuantity: Number(row.quantity || 0),
      assets: (row.serials || []).map((serial) => ({
        id: serial.itemId,
        serialNumber: serial.serialNumber,
        acquisitionCost: Number(row.unitCost || 0),
        receivedAt: serial.receivedAt,
        condition: serial.condition,
      })),
    }));
  }, [reverseExitDetails]);

  function addReverseExitItem() {
    const selected = new Set(reverseExitForm.items.map((item) => String(item.inventoryKey || '')));
    const first = reverseInventoryMaterials.find((item) => !selected.has(String(item.inventoryKey)));
    setReverseExitForm((current) => ({
      ...current,
      items: [...current.items, {
        inventoryKey: first?.inventoryKey || '',
        code: first?.code || '',
        description: first?.description || '',
        quantity: 1,
        serialNumbers: [],
      }],
    }));
  }

  function updateReverseExitItem(index, patch) {
    setReverseExitForm((current) => {
      const items = [...current.items];
      items[index] = { ...items[index], ...patch };
      return { ...current, items };
    });
  }

  function removeReverseExitItem(index) {
    setReverseExitForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
  }

  function toggleReverseSerial(index, serialNumber) {
    const item = reverseExitForm.items[index];
    const selected = new Set(item.serialNumbers || []);
    if (selected.has(serialNumber)) selected.delete(serialNumber);
    else selected.add(serialNumber);
    updateReverseExitItem(index, { serialNumbers: Array.from(selected), quantity: selected.size });
  }

  function validateReverseExit() {
    if (!reverseExitWarehouse?.id) return 'Estoque de logística reversa não identificado.';
    if (!reverseExitForm.supplierName.trim()) return 'Informe a empresa fornecedora que receberá o material.';
    if (!reverseExitForm.documentNumber.trim()) return 'Informe o número do romaneio, protocolo ou documento de entrega.';
    if (!reverseExitForm.items.length) return 'Adicione ao menos um material à saída.';

    const selectedKeys = new Set();
    const selectedSerials = new Set();
    for (const item of reverseExitForm.items) {
      if (!item.inventoryKey) return 'Selecione um item válido em todas as linhas.';
      if (selectedKeys.has(String(item.inventoryKey))) return 'O mesmo item não pode ser selecionado mais de uma vez.';
      selectedKeys.add(String(item.inventoryKey));

      const inventory = reverseInventoryMaterials.find((row) => String(row.inventoryKey) === String(item.inventoryKey));
      if (!inventory) return 'Selecione um item válido em todos os itens.';
      const serials = item.serialNumbers || [];
      for (const serial of serials) {
        const key = String(serial).toUpperCase();
        if (selectedSerials.has(key)) return `O mesmo serial não pode ser selecionado mais de uma vez: ${serial}.`;
        selectedSerials.add(key);
      }
      const quantity = inventory.requiresSerial ? serials.length : Number(item.quantity || 0);
      if (quantity <= 0) return `Informe uma quantidade válida para ${inventory.name}.`;
      if (quantity > Number(inventory.availableQuantity || 0)) return `Quantidade maior que o saldo disponível de ${inventory.name}.`;
    }
    return '';
  }

  function openReverseExitReview() {
    const error = validateReverseExit();
    if (error) { setMessage(error); return; }
    setReverseExitReviewOpen(true);
  }

  async function submitReverseExit() {
    if (reverseExitSaving) return;
    try {
      const error = validateReverseExit();
      if (error) throw new Error(error);
      setReverseExitSaving(true);
      await api.post(`/warehouses/${reverseExitWarehouse.id}/reverse-exit`, {
        ...reverseExitForm,
        items: reverseExitForm.items.map((item) => {
          const inventory = reverseInventoryMaterials.find((row) => String(row.inventoryKey) === String(item.inventoryKey));
          return {
            code: inventory?.code || item.code,
            description: inventory?.description || item.description,
            quantity: Number(item.quantity || 0),
            serialNumbers: item.serialNumbers || [],
          };
        }),
      });
      setReverseExitReviewOpen(false);
      setReverseExitModal(false);
      setReverseExitWarehouse(null);
      setReverseExitDetails(null);
      setReverseExitForm(emptyReverseExit());
      await load();
      setMessage('Saída registrada exclusivamente no estoque de logística reversa.');
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao registrar saída de logística reversa.');
    } finally {
      setReverseExitSaving(false);
    }
  }


  async function requestWarehouseDelete(row) {
    const hasItems = Number(row.totalValue || 0) > 0 || Number(row.assetCount || 0) > 0 || Number(row.consumableLines || 0) > 0;
    if (hasItems) {
      setMessage('Este estoque possui materiais/equipamentos. Transfira todos os itens para outro estoque antes de solicitar exclusão.');
      return;
    }
    const confirmed = window.confirm(`Solicitar exclusão do estoque ${row.code} • ${row.name}? A exclusão só será executada após aprovação do admin e o sistema irá validar novamente se o estoque está vazio.`);
    if (!confirmed) return;
    try {
      setMessage('');
      await api.post(`/warehouses/${row.id}/request-delete`, { notes: 'Solicitação de exclusão enviada pela tela de estoques.' });
      setMessage('Sucesso: solicitação de exclusão enviada para aprovação do administrador.');
      await load();
    } catch (e) {
      setMessage(e.response?.data?.message || 'Não foi possível solicitar exclusão do estoque. Transfira os itens para outro estoque e tente novamente.');
    }
  }

  const transferSourceWarehouse = rows.find((row) => String(row.id) === String(transferForm.fromWarehouseId));
  const transferTargetWarehouse = rows.find((row) => String(row.id) === String(transferForm.toWarehouseId));
  const transferReviewItems = transferForm.items.map((item, index) => {
    const material = materials.find((row) => Number(row.id) === Number(item.materialId));
    const serials = Array.isArray(item.serialNumbers) ? item.serialNumbers : splitSerials(item.serialNumbersText);
    const quantity = material?.requiresSerial ? serials.length : Number(item.quantity || 0);
    const totalValue = material?.requiresSerial
      ? serials.reduce((sum, serial) => sum + Number(availableAssets.find((asset) => asset.serialNumber === serial)?.acquisitionCost || material?.unitCost || 0), 0)
      : quantity * Number(material?.unitCost || 0);
    return {
      key: `${item.materialId || 'empty'}-${index}`,
      name: material?.name || `Item ${index + 1}`,
      detail: material?.requiresSerial ? 'Equipamento serializado' : 'Material controlado por quantidade',
      quantity,
      unit: material?.unit || 'un',
      serialCount: serials.length,
      serialPreview: serials.slice(0, 5).join(', ') + (serials.length > 5 ? ` +${serials.length - 5}` : ''),
      totalValue,
    };
  });
  const transferReviewQuantity = transferReviewItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const transferReviewValue = transferReviewItems.reduce((sum, item) => sum + Number(item.totalValue || 0), 0);


  const reverseExitReviewItems = reverseExitForm.items.map((item, index) => {
    const inventory = reverseInventoryMaterials.find((row) => String(row.inventoryKey) === String(item.inventoryKey));
    const serials = item.serialNumbers || [];
    const quantity = inventory?.requiresSerial ? serials.length : Number(item.quantity || 0);
    return {
      key: `${item.inventoryKey || 'empty'}-${index}`,
      name: inventory?.name || `Item ${index + 1}`,
      detail: inventory?.requiresSerial ? 'Equipamento serializado recolhido' : 'Material usado recolhido',
      quantity,
      unit: inventory?.unit || 'un',
      serialCount: serials.length,
      serialPreview: serials.slice(0, 5).join(', ') + (serials.length > 5 ? ` +${serials.length - 5}` : ''),
      totalValue: quantity * Number(inventory?.unitCost || 0),
    };
  });
  const reverseExitReviewQuantity = reverseExitReviewItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const reverseExitReviewValue = reverseExitReviewItems.reduce((sum, item) => sum + Number(item.totalValue || 0), 0);

  return <div className="page-grid erp-page warehouse-page">
    <section className="toolbar">
      <div>
        <span className="eyebrow">Rede logística</span>
        <h2>Estoques por cidade/região</h2>
        <p>Crie estoques por cidade, transfira materiais entre unidades e limite cada estoquista aos estoques autorizados pelo admin.</p>
      </div>
      <div className="row-actions">
        <button className="ghost" onClick={load}>Atualizar</button>
        <button className="ghost" onClick={() => openTransfer()}>Transferir entre estoques</button>
        {canManageStructure && <button onClick={() => { setForm(empty); setModal(true); }}>Novo estoque</button>}
      </div>
    </section>

    {message && <div className={message.includes('sucesso') ? 'alert success' : 'alert danger'}>{message}</div>}

    <div className="kpi-grid small">
      <KpiCard label="Estoques operacionais" value={operationalRows.length} />
      <KpiCard label="Ativos operacionais" value={operationalRows.filter((r) => r.status === 'ativo').length} />
      <KpiCard label="Patrimônio autorizado" value={brl(totalValue)} />
      <KpiCard label="Logística reversa" value={reverseRows.length} hint="Estoques isolados do BI operacional." />
    </div>

    <section className="panel">
      <div className="panel-title">
        <div><h3>Unidades de estoque</h3><p>Estoquistas veem apenas os estoques vinculados em Usuários e permissões. Estoques só podem ser excluídos quando estiverem vazios e após aprovação do admin.</p></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nº estoque</th><th>Estoque</th><th>Cidade/região</th><th>Responsável</th><th>Valor</th><th>Status</th><th>Opções</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className={r.isReverseLogistics ? 'reverse-logistics-row' : ''}>
            <td><strong>{r.code}</strong></td>
            <td>{r.name} {r.isReverseLogistics && <span className="reverse-logistics-badge">Logística reversa</span>}<br /><small>{r.notes || '-'}</small></td>
            <td>{r.city || '-'} {r.state || ''}<br /><small>{r.region || '-'}</small></td>
            <td>{r.responsibleName || '-'}</td>
            <td>{r.isReverseLogistics ? <small>Somente em Detalhes/BI</small> : brl(r.totalValue)}</td>
            <td><span className={`badge ${r.status}`}>{r.status === 'ativo' ? 'Ativo' : r.status}</span></td>
            <td><div className="row-actions"><button className="info" onClick={() => openDetails(r)}>Detalhes/BI</button>{r.isReverseLogistics ? <button className="reverse-action" onClick={() => openReverseExit(r)}>Registrar saída</button> : <button className="ghost" onClick={() => openTransfer(r)}>Receber transferência</button>}{canManageStructure && <button className="ghost" onClick={() => { setForm({ ...empty, ...r }); setModal(true); }}>Editar</button>}{canManageStructure && <button className="ghost danger-outline" onClick={() => requestWarehouseDelete(r)}>Solicitar exclusão</button>}</div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <Modal open={modal} title={form.id ? 'Editar estoque' : 'Novo estoque'} onClose={() => setModal(false)} footer={<><button className="ghost" onClick={() => setModal(false)}>Cancelar</button><button onClick={save}>Salvar estoque</button></>}>
      <div className="form-stack">
        <div className="form-grid">
          <label>Nome do estoque<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Estoque São Pedro da Aldeia" /></label>
          <label>Número/código do estoque<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="SPA-001" /></label>
          <label>Cidade<input value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="São Pedro da Aldeia" /></label>
          <label>UF<input value={form.state || ''} maxLength="2" onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} placeholder="RJ" /></label>
          <label>Região<input value={form.region || ''} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="Região dos Lagos" /></label>
          <label>Responsável local<input value={form.responsibleName || ''} onChange={(e) => setForm({ ...form, responsibleName: e.target.value })} /></label>
          <label>Limite local de aprovação<input type="number" disabled={form.isReverseLogistics} value={form.isReverseLogistics ? 0 : (form.approvalLimit || 0)} onChange={(e) => setForm({ ...form, approvalLimit: e.target.value })} /></label>
          <label>Estoque ativo?<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="ativo">Sim, ativo</option><option value="inativo">Não, inativo</option><option value="bloqueado">Bloqueado</option></select></label>
        </div>
        <label className="reverse-logistics-check"><input type="checkbox" disabled={!!form.id} checked={!!form.isReverseLogistics} onChange={(e) => setForm({ ...form, isReverseLogistics: e.target.checked, approvalLimit: e.target.checked ? 0 : form.approvalLimit })} /><span><b>Estoque de logística reversa</b><small>{form.id ? 'O tipo do estoque é definido na criação e não pode ser alterado depois.' : 'Isolado das transferências, solicitações, caixas técnicas e BI geral. Aceita entradas e saídas para fornecedor.'}</small></span></label>
        <label>Endereço<input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
        <label>Observações<textarea rows="3" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
      </div>
    </Modal>


    <Modal open={reverseExitModal} title={`Saída de logística reversa: ${reverseExitWarehouse?.name || ''}`} onClose={() => !reverseExitSaving && setReverseExitModal(false)} footer={<><button className="ghost" disabled={reverseExitSaving} onClick={() => setReverseExitModal(false)}>Cancelar</button><button disabled={reverseExitSaving} onClick={openReverseExitReview}>Revisar saída</button></>}>
      <div className="form-stack reverse-exit-form">
        <div className="alert warning">Esta saída baixa somente o saldo deste estoque e registra a entrega do material usado ao fornecedor. Não gera transferência e não afeta o BI operacional.</div>
        <div className="form-grid">
          <label>Empresa fornecedora<input value={reverseExitForm.supplierName} onChange={(e) => setReverseExitForm({ ...reverseExitForm, supplierName: e.target.value })} placeholder="Empresa que receberá os itens" /></label>
          <label>Documento/romaneio<input value={reverseExitForm.documentNumber} onChange={(e) => setReverseExitForm({ ...reverseExitForm, documentNumber: e.target.value })} placeholder="Número do protocolo ou romaneio" /></label>
          <label>Referência interna<input value={reverseExitForm.reference} onChange={(e) => setReverseExitForm({ ...reverseExitForm, reference: e.target.value })} placeholder="Gerada automaticamente" /></label>
        </div>
        <label>Observações<textarea rows="2" value={reverseExitForm.notes} onChange={(e) => setReverseExitForm({ ...reverseExitForm, notes: e.target.value })} /></label>
        <div className="subtoolbar"><h4>Materiais entregues ao fornecedor</h4><button type="button" className="ghost" onClick={addReverseExitItem}>Adicionar item</button></div>
        {reverseExitForm.items.length === 0 && <div className="empty-state">Adicione os materiais usados que sairão do estoque de logística reversa.</div>}
        {reverseExitForm.items.map((item, index) => {
          const inventory = reverseInventoryMaterials.find((row) => String(row.inventoryKey) === String(item.inventoryKey));
          const selectedKeys = new Set(reverseExitForm.items.filter((_, itemIndex) => itemIndex !== index).map((row) => String(row.inventoryKey || '')));
          const availableOptions = reverseInventoryMaterials.filter((row) => !selectedKeys.has(String(row.inventoryKey)));
          const selectedElsewhere = new Set(reverseExitForm.items.filter((_, itemIndex) => itemIndex !== index).flatMap((row) => row.serialNumbers || []).map((serial) => String(serial).toUpperCase()));
          const availableAssets = (inventory?.assets || []).filter((asset) => !selectedElsewhere.has(String(asset.serialNumber || '').toUpperCase()));
          return <div className="item-card" key={index}>
            <div className="item-head"><strong>Item {index + 1}</strong><button type="button" className="ghost danger-outline" onClick={() => removeReverseExitItem(index)}>Remover</button></div>
            <div className="form-grid">
              <label>Material/equipamento<select value={item.inventoryKey} onChange={(e) => { const selected = reverseInventoryMaterials.find((row) => String(row.inventoryKey) === String(e.target.value)); updateReverseExitItem(index, { inventoryKey: e.target.value, code: selected?.code || '', description: selected?.description || '', quantity: 1, serialNumbers: [] }); }}><option value="">Selecione</option>{availableOptions.map((row) => <option key={row.inventoryKey} value={row.inventoryKey}>{row.code} • {row.name} • saldo {formatQuantity(row.availableQuantity, row.unit)}</option>)}</select></label>
              {!inventory?.requiresSerial && <label>Quantidade<input type="number" min="1" max={inventory?.availableQuantity || 0} step="1" value={item.quantity} onChange={(e) => updateReverseExitItem(index, { quantity: e.target.value })} /><small>Disponível: {formatQuantity(inventory?.availableQuantity || 0, inventory?.unit)}</small></label>}
            </div>
            {inventory?.requiresSerial && <div className="serial-picker"><div className="serial-picker-head"><strong>Seriais disponíveis</strong><small>{(item.serialNumbers || []).length} selecionado(s)</small></div><div className="serial-list">{availableAssets.map((asset) => { const checked = (item.serialNumbers || []).includes(asset.serialNumber); return <button type="button" key={asset.id} className={`serial-chip ${checked ? 'selected' : ''}`} onClick={() => toggleReverseSerial(index, asset.serialNumber)}><span><b>{asset.serialNumber}</b><small>{inventory.name} • {brl(asset.acquisitionCost || inventory.unitCost)}</small></span><em>{checked ? 'Selecionado' : 'Selecionar'}</em></button>; })}</div></div>}
          </div>;
        })}
      </div>
    </Modal>

    <OperationReviewModal
      open={reverseExitReviewOpen}
      title="Confirmar saída de logística reversa"
      description="Confira os materiais recolhidos que serão baixados e entregues à empresa fornecedora."
      metadata={[
        { label: 'Estoque', value: reverseExitWarehouse?.name, hint: reverseExitWarehouse?.code },
        { label: 'Fornecedor', value: reverseExitForm.supplierName },
        { label: 'Documento', value: reverseExitForm.documentNumber },
        { label: 'Referência', value: reverseExitForm.reference || 'Gerada automaticamente' },
      ]}
      items={reverseExitReviewItems}
      totalQuantity={reverseExitReviewQuantity}
      totalValue={reverseExitReviewValue}
      warning="Ao confirmar, a saída ficará registrada somente no Detalhes/BI deste estoque de logística reversa."
      loading={reverseExitSaving}
      confirmLabel="Confirmar saída para fornecedor"
      onCancel={() => setReverseExitReviewOpen(false)}
      onConfirm={submitReverseExit}
    />

    <Modal open={transferModal} title="Solicitar transferência entre estoques" onClose={() => !transferSaving && setTransferModal(false)} footer={<><button className="ghost" disabled={transferSaving} onClick={() => setTransferModal(false)}>Cancelar</button><button disabled={transferSaving} onClick={openWarehouseTransferReview}>Revisar transferência</button></>}>
      <div className="form-stack warehouse-transfer-form">
        <div className="alert warning">A transferência entre estoques ficará pendente na Central de aprovações. Somente o admin executa a movimentação do saldo.</div>
        <div className="form-grid">
          <label>Estoque de origem<select value={transferForm.fromWarehouseId} onChange={(e) => changeTransferSourceWarehouse(e.target.value)}><option value="">Selecione</option>{operationalRows.map((w) => <option key={w.id} value={w.id}>{w.code} • {w.name} • {w.city || w.region || '-'}</option>)}</select></label>
          <label>Estoque de destino<select value={transferForm.toWarehouseId} onChange={(e) => setTransferForm({ ...transferForm, toWarehouseId: e.target.value })}><option value="">Selecione</option>{operationalRows.filter((w) => String(w.id) !== String(transferForm.fromWarehouseId)).map((w) => <option key={w.id} value={w.id}>{w.code} • {w.name} • {w.city || w.region || '-'}</option>)}</select></label>
          <label>Referência/motivo<input value={transferForm.reference} onChange={(e) => setTransferForm({ ...transferForm, reference: e.target.value })} placeholder="Ex.: reposição Vila Velha" /><small>Pode ser repetida. O número único da operação será gerado automaticamente.</small></label>
          <label>Buscar serial<input value={assetSearch} disabled={!transferForm.fromWarehouseId || transferInventoryLoading} onChange={(e) => setAssetSearch(e.target.value)} placeholder="Serial, MAC, modelo..." /></label>
        </div>
        <label>Observação<textarea rows="2" value={transferForm.notes} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} placeholder="Motivo da transferência, responsável, rota..." /></label>
        <div className="subtoolbar"><div><h4>Itens transferidos</h4><small>São exibidos todos os materiais com saldo físico positivo no estoque selecionado, inclusive cadastros inativos.</small></div><button type="button" className="ghost" disabled={!transferForm.fromWarehouseId || transferInventoryLoading || materials.length === 0} onClick={addTransferItem}>Adicionar item</button></div>
        {transferInventoryLoading && <div className="empty-state">Carregando materiais e seriais do estoque de origem...</div>}
        {!transferInventoryLoading && transferForm.fromWarehouseId && materials.length === 0 && <div className="empty-state">O estoque de origem não possui materiais ou equipamentos com saldo físico positivo para transferência.</div>}
        {!transferInventoryLoading && transferForm.items.length === 0 && materials.length > 0 && <div className="empty-state">Adicione os materiais que serão enviados para o estoque de destino.</div>}
        {transferForm.items.map((item, index) => {
          const material = materials.find((m) => Number(m.id) === Number(item.materialId));
          const availableMaterials = optionsWithoutSelected(materials, transferForm.items, index);
          const serialsSelectedElsewhere = selectedSerialsExcept(transferForm.items, index);
          const serialAssets = (assetsByMaterial[item.materialId] || []).filter((asset) => {
            if (serialsSelectedElsewhere.has(String(asset.serialNumber || '').toUpperCase())) return false;
            const q = assetSearch.trim().toLowerCase();
            if (!q) return true;
            return [asset.serialNumber, asset.mac, asset.brand, asset.model].filter(Boolean).join(' ').toLowerCase().includes(q);
          });
          return <div className="item-card" key={index}>
            <div className="item-head"><strong>Item {index + 1}</strong><button type="button" className="ghost danger-outline" onClick={() => removeTransferItem(index)}>Remover</button></div>
            <div className="form-grid">
              <label>Material<select value={item.materialId} onChange={(e) => updateTransferItem(index, { materialId: e.target.value, serialNumbers: [], quantity: 1 })}><option value="">Selecione o material</option>{availableMaterials.map((m) => <option key={m.id} value={m.id}>{m.name} • {m.category} • saldo {formatQuantity(m.mainStock, m.unit)}{m.active === false ? ' • INATIVO NO CATÁLOGO' : ''}</option>)}</select></label>
              {!material?.requiresSerial && <label>Quantidade<input type="number" min="0" step="1" value={item.quantity} onChange={(e) => updateTransferItem(index, { quantity: e.target.value })} /></label>}
            </div>
            {material?.requiresSerial && <div className="serial-picker">
              <div className="serial-picker-head"><strong>Seriais disponíveis no estoque de origem</strong><small>{serialAssets.length} disponível(is) • {(item.serialNumbers || []).length} selecionado(s)</small></div>
              <div className="serial-list">{serialAssets.map((asset) => { const checked = (item.serialNumbers || []).includes(asset.serialNumber); return <button type="button" key={asset.id} className={`serial-chip ${checked ? 'selected' : ''}`} onClick={() => toggleSerial(index, asset.serialNumber)}><span><b>{asset.serialNumber}</b><small>{asset.Material?.name || material.name} • {asset.status} • {brl(asset.acquisitionCost || material.unitCost)}</small></span><em>{checked ? 'Selecionado' : 'Selecionar'}</em></button>; })}</div>
              {serialAssets.length === 0 && <div className="empty-state small">Nenhum serial deste material disponível no estoque de origem.</div>}
            </div>}
          </div>;
        })}
      </div>
    </Modal>

    <OperationReviewModal
      open={transferReviewOpen}
      title="Revisar transferência entre estoques"
      description="Confira origem, destino, itens, quantidades e seriais. A solicitação só será enviada para aprovação depois da confirmação."
      metadata={[
        { label: 'Estoque de origem', value: transferSourceWarehouse?.name, hint: transferSourceWarehouse?.code },
        { label: 'Estoque de destino', value: transferTargetWarehouse?.name, hint: transferTargetWarehouse?.code },
        { label: 'Referência/motivo', value: transferForm.reference || 'Transferência entre estoques' },
        { label: 'Número da operação', value: 'Gerado automaticamente após confirmar' },
        { label: 'Observação', value: transferForm.notes || 'Não informada' },
      ]}
      items={transferReviewItems}
      totalQuantity={transferReviewQuantity}
      totalValue={transferReviewValue}
      warning="A confirmação não movimenta o saldo imediatamente: a operação será enviada à Central de aprovações e só será executada após aprovação do administrador."
      loading={transferSaving}
      confirmLabel="Confirmar e solicitar aprovação"
      onCancel={() => setTransferReviewOpen(false)}
      onConfirm={submitWarehouseTransfer}
    />

    <DetailsModal open={!!details} title={`Estoque ${details?.warehouse?.name || ''}`} onClose={() => setDetails(null)} footer={<><button className="ghost" onClick={() => setDetails(null)}>Fechar</button>{details && <button disabled={excelLoading} onClick={downloadDetailsExcel}>{excelLoading ? 'Gerando Excel...' : 'Baixar Excel'}</button>}</>}>
      <DetailGrid fields={details ? [
        ['Número/código', details.warehouse.code], ['Nome', details.warehouse.name], ['Tipo', details.warehouse.isReverseLogistics ? 'Logística reversa' : 'Estoque operacional'], ['Cidade', `${details.warehouse.city || '-'} ${details.warehouse.state || ''}`], ['Região', details.warehouse.region], ['Responsável', details.warehouse.responsibleName], ['Estoque ativo?', details.warehouse.status === 'ativo' ? 'Sim' : details.warehouse.status], ['Valor total', brl(details.bi?.totalValue)], ['Última movimentação', dt(details.bi?.lastMovementAt)],
      ] : []} />
      {details && (details.warehouse.isReverseLogistics ? <>
        <div className="kpi-grid small"><KpiCard label="Valor isolado recolhido" value={brl(details.bi?.totalValue)} /><KpiCard label="Quantidade em saldo" value={formatQuantity(details.bi?.totalQuantity || 0)} /><KpiCard label="Equipamentos serializados" value={details.bi?.assetCount || 0} /><KpiCard label="Saídas para fornecedor" value={details.bi?.reverseOutgoingMovements || 0} /></div>
        <div className="alert info">Todos os dados abaixo pertencem exclusivamente à logística reversa. Eles não alimentam estoque operacional, caixa técnica, BI geral, histórico geral ou auditoria geral.</div>
        <DetailList title="Saldo atual da logística reversa" items={details.reverseInventory || []} render={(item) => <><b>{item.code} • {item.description}</b><span>{formatQuantity(item.quantity, item.unit)} • {brl(item.totalValue)} • {item.requiresSerial ? `${(item.serials || []).length} serial(is)` : 'controle por quantidade'}</span><small>{item.requiresSerial ? (item.serials || []).slice(0, 12).map((serial) => serial.serialNumber).join(', ') : `Valor unitário: ${brl(item.unitCost)}`}</small></>} />
        <DetailList title="Entradas registradas somente neste estoque" items={details.reverseEntries || []} render={(entry) => <><b>{entry.reference} • {entry.receivedAt}</b><span>{entry.sourceCompany || '-'} • Qtd. {formatQuantity(entry.totalQuantity)} • {brl(entry.totalValue)}</span><small>Documento: {entry.documentNumber || '-'} • Operador: {entry.createdBy?.name || 'Sistema'}</small></>} />
        <DetailList title="Saídas para fornecedor registradas somente neste estoque" items={details.reverseExits || []} render={(exit) => <><b>{exit.reference} • {dt(exit.createdAt)}</b><span>{exit.supplierName} • Qtd. {formatQuantity(exit.totalQuantity)} • {brl(exit.totalValue)}</span><small>Documento: {exit.documentNumber} • {(exit.items || []).length} linha(s)</small></>} />
      </> : <>
        <div className="kpi-grid small"><KpiCard label="Valor em materiais" value={brl(details.bi?.totalValue)} /><KpiCard label="Equipamentos" value={details.bi?.assetCount || 0} /><KpiCard label="Linhas consumíveis" value={details.bi?.consumableLines || 0} /><KpiCard label="Transferências p/ técnico" value={details.bi?.technicianTransfers || 0} /></div>
        <DetailList title="Estoquistas/usuários vinculados" items={details.users || []} render={(u) => <><b>{u.name}</b><span>{u.email} • {u.role} • {u.status}</span><small>Limite de aprovação: {brl(u.approvalLimit)}</small></>} />
        <DetailList title="Técnicos com estoque padrão vinculado" items={details.technicians || []} render={(t) => <><b>{t.name}</b><span>{t.email || '-'} • {t.status}</span><small>{(t.serviceCities || []).join(', ')}</small></>} />
        <DetailList title="Equipamentos serializados no estoque" items={details.assets || []} render={(a) => <><b>{a.serialNumber}</b><span>{a.Material?.name} • {a.status} • {brl(a.acquisitionCost || a.Material?.unitCost)}</span></>} />
        <DetailList title="Materiais consumíveis no estoque" items={details.balances || []} render={(b) => <><b>{b.Material?.name}</b><span>{formatQuantity(b.quantity, b.Material?.unit)} • {brl(Number(b.quantity || 0) * Number(b.Material?.unitCost || 0))}</span></>} />
        <DetailList title="Histórico e BI de movimentações deste estoque" items={details.movements || []} render={(m) => <><b>{m.reference || m.type} • {dt(m.movementAt)}</b><span>{m.Material?.name || '-'} • Qtd. {formatQuantity(m.quantity)} • {m.serialNumber || 'sem serial'}</span><small>{m.fromWarehouse?.name || m.fromOwnerType || '-'} → {m.toWarehouse?.name || m.toOwnerType || m.toTechnician?.name || '-'} • Operador: {m.createdBy?.name || 'Sistema'}</small></>} />
      </>)}
    </DetailsModal>
  </div>;
}
