const sequelize = require('../../config/db');
const { Op } = require('sequelize');
const { StockBatch, StockBatchItem, Material, SerializedAsset, StockMovement, User, Warehouse } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, okPaginated, created, fail } = require('../utils/response');
const { paginationFromQuery, paginationMeta } = require('../utils/pagination');
const { money, qty } = require('../utils/number');
const { adjustBalance } = require('../services/stockService');
const { stockWhereForUser, assertWarehouseAccess, isPrivileged } = require('../utils/warehouseAccess');
const { writeAudit } = require('../services/auditService');
const { isTrue } = require('../utils/booleans');
const { assertUniqueOperationItems } = require('../utils/itemSelectionValidation');
const { reverseWarehouseIds, warehouseOutsideReverse } = require('../utils/reverseLogistics');
const { correctForcedInitialStock } = require('../services/initialStockCorrectionService');
const { hasModuleAccess } = require('../config/modulePermissions');

exports.list = asyncHandler(async (req, res) => {
  const reverseIds = await reverseWarehouseIds();
  const where = { [Op.and]: [stockWhereForUser(req.user, req.query.warehouseId), warehouseOutsideReverse(reverseIds)] };
  const pagination = paginationFromQuery(req.query);
  const limit = pagination.enabled ? pagination.limit : Math.min(Math.max(Number(req.query.limit || 150), 1), 300);
  const [batches, total] = await Promise.all([
    StockBatch.findAll({
      where,
      attributes: { exclude: ['proofAttachmentData'] },
      include: [
        { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] },
        Warehouse,
        { model: StockBatchItem, include: [Material] },
      ],
      distinct: true,
      order: [['receivedAt', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      ...(pagination.enabled ? { offset: pagination.offset } : {}),
    }),
    pagination.enabled ? StockBatch.count({ where }) : Promise.resolve(0),
  ]);
  return pagination.enabled
    ? okPaginated(res, batches, paginationMeta(total, pagination.page, pagination.pageSize))
    : ok(res, batches);
});

exports.get = asyncHandler(async (req, res) => {
  const reverseIds = await reverseWarehouseIds();
  const where = { id: req.params.id, [Op.and]: [stockWhereForUser(req.user), warehouseOutsideReverse(reverseIds)] };
  const batch = await StockBatch.findOne({
    where,
    include: [
      { model: StockBatchItem, include: [Material] },
      { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] },
      Warehouse,
    ],
  });
  if (!batch) return fail(res, 404, 'Entrada de estoque não encontrada ou sem acesso.');
  return ok(res, batch);
});

const EDITABLE_BATCH_FIELDS = [
  'receiptNumber',
  'sourceCompany',
  'receivedAt',
  'cycle',
  'notes',
  'fiscalDocumentType',
  'fiscalDocumentNumber',
  'fiscalDocumentDate',
  'fiscalIssuer',
  'invoiceAccessKey',
  'receivedByName',
  'conferenceStatus',
  'warehouseLocation',
  'proofAttachmentName',
  'proofAttachmentData',
];

function cleanOptionalText(value) {
  if (value === undefined) return undefined;
  const clean = String(value ?? '').trim();
  return clean || null;
}

exports.update = asyncHandler(async (req, res) => {
  const canEditDocuments = hasModuleAccess(req.user, 'stockBatchEdit');
  const canEditQuantities = hasModuleAccess(req.user, 'stockBatchQuantityEdit');
  const documentFieldsRequested = EDITABLE_BATCH_FIELDS.some((field) => req.body[field] !== undefined)
    || req.body.warehouseId !== undefined;
  const quantityEditRequested = req.body.items !== undefined;

  if (documentFieldsRequested && !canEditDocuments) {
    return fail(res, 403, 'Você não tem permissão para editar os dados documentais desta entrada.');
  }
  if (quantityEditRequested && !canEditQuantities) {
    return fail(res, 403, 'Você não tem permissão para alterar as quantidades dos itens desta entrada.');
  }
  if (req.body.totalItems !== undefined || req.body.totalValue !== undefined) {
    return fail(res, 400, 'Os totais da entrada são calculados automaticamente a partir dos itens.');
  }
  if (!documentFieldsRequested && !quantityEditRequested) {
    return fail(res, 400, 'Nenhuma correção foi informada.');
  }

  const reverseIds = await reverseWarehouseIds();
  const where = { id: req.params.id, [Op.and]: [stockWhereForUser(req.user), warehouseOutsideReverse(reverseIds)] };

  const result = await sequelize.transaction(async (transaction) => {
    const batch = await StockBatch.findOne({
      where,
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!batch) {
      const error = new Error('Entrada de estoque não encontrada ou sem acesso.');
      error.statusCode = 404;
      throw error;
    }

    if (req.body.warehouseId !== undefined && Number(req.body.warehouseId) !== Number(batch.warehouseId)) {
      const error = new Error('O estoque/região não pode ser alterado nesta correção porque o saldo já foi movimentado.');
      error.statusCode = 400;
      throw error;
    }

    // PostgreSQL não permite aplicar FOR UPDATE ao lado anulável de um
    // OUTER JOIN. O include de Material gera LEFT OUTER JOIN no Sequelize.
    // Bloqueie primeiro somente as linhas de StockBatchItem e carregue os
    // materiais em uma consulta separada, dentro da mesma transação.
    const batchItems = await StockBatchItem.findAll({
      where: { batchId: batch.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
      order: [['id', 'ASC']],
    });

    const batchMaterialIds = Array.from(new Set(
      batchItems.map((item) => Number(item.materialId)).filter(Boolean),
    ));
    const batchMaterials = batchMaterialIds.length
      ? await Material.findAll({
        where: { id: { [Op.in]: batchMaterialIds } },
        attributes: ['id', 'name', 'sku', 'unit', 'category', 'requiresSerial'],
        transaction,
      })
      : [];
    const batchMaterialById = new Map(
      batchMaterials.map((material) => [Number(material.id), material]),
    );

    for (const item of batchItems) {
      const material = batchMaterialById.get(Number(item.materialId));
      if (!material) {
        const error = new Error(`O material vinculado ao item ${item.id} não foi encontrado. A entrada não foi alterada.`);
        error.statusCode = 409;
        throw error;
      }
      // Mantém o mesmo acesso usado pelo restante do fluxo sem adicionar
      // associação ao SELECT bloqueado e sem marcar campo persistente.
      item.Material = material;
    }

    const beforeData = {
      ...batch.toJSON(),
      StockBatchItems: batchItems.map((item) => ({
        ...item.toJSON(),
        Material: item.Material?.toJSON() || null,
      })),
      proofAttachmentData: undefined,
    };
    const previousReceiptNumber = batch.receiptNumber;

    const next = {};
    for (const field of EDITABLE_BATCH_FIELDS) {
      if (req.body[field] !== undefined) next[field] = req.body[field];
    }

    next.receiptNumber = String(next.receiptNumber ?? batch.receiptNumber ?? '').trim().toUpperCase();
    next.sourceCompany = String(next.sourceCompany ?? batch.sourceCompany ?? '').trim();
    next.receivedAt = String(next.receivedAt ?? batch.receivedAt ?? '').trim();
    next.cycle = String(next.cycle ?? batch.cycle ?? '').trim();
    next.fiscalDocumentType = String(next.fiscalDocumentType ?? batch.fiscalDocumentType ?? '').trim();
    next.conferenceStatus = String(next.conferenceStatus ?? batch.conferenceStatus ?? '').trim();
    next.fiscalDocumentNumber = cleanOptionalText(next.fiscalDocumentNumber ?? batch.fiscalDocumentNumber);
    next.fiscalDocumentDate = cleanOptionalText(next.fiscalDocumentDate ?? batch.fiscalDocumentDate);
    next.fiscalIssuer = cleanOptionalText(next.fiscalIssuer ?? batch.fiscalIssuer);
    next.invoiceAccessKey = cleanOptionalText(next.invoiceAccessKey ?? batch.invoiceAccessKey);
    next.receivedByName = cleanOptionalText(next.receivedByName ?? batch.receivedByName);
    next.warehouseLocation = cleanOptionalText(next.warehouseLocation ?? batch.warehouseLocation);
    next.notes = cleanOptionalText(next.notes ?? batch.notes);
    next.proofAttachmentName = cleanOptionalText(next.proofAttachmentName ?? batch.proofAttachmentName);
    next.proofAttachmentData = cleanOptionalText(next.proofAttachmentData ?? batch.proofAttachmentData);

    if (!next.receiptNumber || !next.sourceCompany || !next.receivedAt) {
      const error = new Error('Número da entrada, origem/fornecedor e data de recebimento são obrigatórios.');
      error.statusCode = 400;
      throw error;
    }
    if (next.receiptNumber.length > 80) {
      const error = new Error('O número da entrada deve ter no máximo 80 caracteres.');
      error.statusCode = 400;
      throw error;
    }
    if (!['quinzenal', 'mensal', 'extra'].includes(next.cycle)) {
      const error = new Error('Ciclo da entrada inválido.');
      error.statusCode = 400;
      throw error;
    }
    if (!['nota_fiscal', 'termo_entrega', 'romaneio', 'recibo', 'outro'].includes(next.fiscalDocumentType)) {
      const error = new Error('Tipo de documento inválido.');
      error.statusCode = 400;
      throw error;
    }
    if (!['pendente_conferencia', 'conferido', 'divergente'].includes(next.conferenceStatus)) {
      const error = new Error('Status de conferência inválido.');
      error.statusCode = 400;
      throw error;
    }
    if (!next.fiscalDocumentNumber && !next.invoiceAccessKey) {
      const error = new Error('Informe o número do documento fiscal/termo ou a chave de acesso da nota.');
      error.statusCode = 400;
      throw error;
    }
    if (!next.proofAttachmentName || !next.proofAttachmentData) {
      const error = new Error('A entrada deve permanecer vinculada a um comprovante.');
      error.statusCode = 400;
      throw error;
    }

    const duplicate = await StockBatch.findOne({
      where: {
        id: { [Op.ne]: batch.id },
        receiptNumber: { [Op.iLike]: next.receiptNumber },
      },
      attributes: ['id', 'receiptNumber'],
      transaction,
    });
    if (duplicate) {
      const error = new Error(`Já existe outra entrada cadastrada com o número ${duplicate.receiptNumber}.`);
      error.statusCode = 409;
      throw error;
    }

    const requestedItems = quantityEditRequested ? req.body.items : null;
    const quantityChanges = [];

    if (quantityEditRequested) {
      if (!Array.isArray(requestedItems) || requestedItems.length !== batchItems.length) {
        const error = new Error('A correção deve manter exatamente os mesmos itens da entrada. Não é permitido adicionar ou remover materiais nesta tela.');
        error.statusCode = 400;
        throw error;
      }

      const requestedById = new Map();
      for (const requestedItem of requestedItems) {
        const itemId = Number(requestedItem?.id);
        if (!Number.isInteger(itemId) || itemId <= 0 || requestedById.has(itemId)) {
          const error = new Error('A lista de itens da correção contém um identificador inválido ou repetido.');
          error.statusCode = 400;
          throw error;
        }
        requestedById.set(itemId, requestedItem);
      }

      for (const item of batchItems) {
        const requestedItem = requestedById.get(Number(item.id));
        if (!requestedItem) {
          const error = new Error(`O item ${item.Material?.name || item.id} não foi enviado na correção.`);
          error.statusCode = 400;
          throw error;
        }

        if (
          requestedItem.materialId !== undefined
          && Number(requestedItem.materialId) !== Number(item.materialId)
        ) {
          const error = new Error(`O material do item ${item.Material?.name || item.id} não pode ser trocado.`);
          error.statusCode = 400;
          throw error;
        }

        const previousQuantity = qty(item.quantity);
        const nextQuantity = qty(requestedItem.quantity);

        if (!Number.isFinite(Number(nextQuantity)) || Number(nextQuantity) <= 0) {
          const error = new Error(`Informe uma quantidade maior que zero para ${item.Material?.name || 'o item'}.`);
          error.statusCode = 400;
          throw error;
        }

        if (isTrue(item.Material?.requiresSerial) && Number(nextQuantity) !== Number(previousQuantity)) {
          const error = new Error(`A quantidade de ${item.Material?.name || 'material serializado'} não pode ser alterada nesta tela porque está vinculada a seriais. Corrija os seriais pelo fluxo específico.`);
          error.statusCode = 400;
          throw error;
        }

        if (!isTrue(item.Material?.requiresSerial) && Number(nextQuantity) !== Number(previousQuantity)) {
          quantityChanges.push({
            item,
            previousQuantity,
            nextQuantity,
            delta: qty(Number(nextQuantity) - Number(previousQuantity)),
          });
        }
      }
    }

    const materialIds = Array.from(new Set(batchItems.map((item) => Number(item.materialId)).filter(Boolean)));
    const movements = materialIds.length
      ? await StockMovement.findAll({
        where: {
          type: 'entrada',
          reference: { [Op.iLike]: previousReceiptNumber },
          toWarehouseId: batch.warehouseId,
          materialId: { [Op.in]: materialIds },
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
        order: [['id', 'ASC']],
      })
      : [];

    for (const change of quantityChanges) {
      const itemMovements = movements.filter((movement) => (
        Number(movement.materialId) === Number(change.item.materialId)
        && !movement.serialNumber
        && !movement.assetId
      ));

      if (itemMovements.length !== 1) {
        const error = new Error(`Não foi possível identificar com segurança a movimentação original de ${change.item.Material?.name || 'um item'}. A quantidade não foi alterada.`);
        error.statusCode = 409;
        throw error;
      }

      await adjustBalance({
        materialId: change.item.materialId,
        ownerType: 'estoque',
        technicianId: null,
        warehouseId: batch.warehouseId,
        delta: change.delta,
        transaction,
      });

      change.item.quantity = change.nextQuantity;
      change.item.totalCost = money(Number(change.nextQuantity) * Number(change.item.unitCost || 0));
      await change.item.save({ transaction });

      await itemMovements[0].update({
        quantity: change.nextQuantity,
      }, { transaction });
    }

    const documentReference = next.fiscalDocumentNumber || next.invoiceAccessKey;
    for (const movement of movements) {
      await movement.update({
        reference: next.receiptNumber,
        notes: `Entrada por lote ${next.receiptNumber}. Documento: ${documentReference}.`,
      }, { transaction });
    }

    const totalItems = qty(batchItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0));
    const totalValue = money(batchItems.reduce((sum, item) => sum + Number(item.totalCost || 0), 0));

    await batch.update({
      ...next,
      totalItems,
      totalValue,
    }, { transaction });

    const afterItems = await StockBatchItem.findAll({
      where: { batchId: batch.id },
      include: [{ model: Material, attributes: ['id', 'name', 'sku', 'unit', 'category', 'requiresSerial'] }],
      transaction,
      order: [['id', 'ASC']],
    });
    const afterData = {
      ...batch.toJSON(),
      StockBatchItems: afterItems.map((item) => item.toJSON()),
      proofAttachmentData: undefined,
    };

    const quantitySummary = quantityChanges.map((change) => (
      `${change.item.Material?.name || change.item.materialId}: ${change.previousQuantity} → ${change.nextQuantity}`
    ));

    await writeAudit({
      req,
      action: 'update',
      entity: 'StockBatch',
      entityId: batch.id,
      message: quantitySummary.length
        ? `Entrada de estoque ${previousReceiptNumber} corrigida. Quantidades alteradas: ${quantitySummary.join('; ')}. Saldo e movimentação de entrada ajustados pela diferença.`
        : `Entrada de estoque ${previousReceiptNumber} corrigida para ${next.receiptNumber}. Quantidades e saldo permaneceram inalterados.`,
      beforeData,
      afterData,
      transaction,
    });

    return {
      batchId: batch.id,
      quantityChanges: quantitySummary,
    };
  });

  const updated = await StockBatch.findByPk(result.batchId, {
    include: [
      { model: StockBatchItem, include: [Material] },
      { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] },
      Warehouse,
    ],
  });

  const message = result.quantityChanges.length
    ? `Entrada atualizada com auditoria. ${result.quantityChanges.length} quantidade(s) corrigida(s), com ajuste correspondente no saldo do estoque.`
    : 'Entrada de estoque atualizada com auditoria. Quantidades e saldo permaneceram inalterados.';

  return ok(res, updated, message);
});

exports.create = asyncHandler(async (req, res) => {
  const {
    receiptNumber,
    sourceCompany,
    receivedAt,
    cycle,
    notes,
    fiscalDocumentType = 'nota_fiscal',
    fiscalDocumentNumber,
    fiscalDocumentDate,
    fiscalIssuer,
    invoiceAccessKey,
    receivedByName,
    conferenceStatus = 'conferido',
    warehouseLocation,
    warehouseId,
    proofAttachmentName,
    proofAttachmentData,
    items = [],
  } = req.body;

  if (!receiptNumber || !receivedAt || !items.length) return fail(res, 400, 'Número de recebimento, data e itens são obrigatórios.');
  try { assertUniqueOperationItems(items); } catch (error) { return fail(res, error.statusCode || 400, error.message); }
  if (!proofAttachmentName || !proofAttachmentData) return fail(res, 400, 'Anexe um comprovante da entrada, como nota fiscal, termo de entrega, romaneio ou recibo.');
  if (!fiscalDocumentNumber && !invoiceAccessKey) return fail(res, 400, 'Informe o número do documento fiscal/termo ou a chave de acesso da nota.');
  let targetWarehouseId = warehouseId || null;
  if (!targetWarehouseId) return fail(res, 400, 'Selecione o estoque regional onde a entrada será registrada. Não existe mais entrada em estoque central.');
  if (targetWarehouseId) {
    try { assertWarehouseAccess(req.user, targetWarehouseId, 'Você não tem acesso ao estoque informado.'); } catch (error) { return fail(res, error.statusCode || 403, error.message); }
    const warehouse = await Warehouse.findByPk(targetWarehouseId);
    if (!warehouse || warehouse.status !== 'ativo') return fail(res, 404, 'Estoque/região informado não existe ou está inativo.');
    if (warehouse.isReverseLogistics) return fail(res, 400, 'Entradas de logística reversa usam o fluxo isolado e não podem ser registradas como entrada operacional.');
  }

  const result = await sequelize.transaction(async (transaction) => {
    let totalItems = 0;
    const serialsInThisEntry = new Set();
    let totalValue = 0;
    const batch = await StockBatch.create({
      receiptNumber,
      sourceCompany,
      receivedAt,
      cycle,
      notes,
      fiscalDocumentType,
      fiscalDocumentNumber,
      fiscalDocumentDate,
      fiscalIssuer,
      invoiceAccessKey,
      receivedByName,
      conferenceStatus,
      warehouseLocation,
      proofAttachmentName,
      proofAttachmentData,
      warehouseId: targetWarehouseId,
      createdById: req.user.id,
    }, { transaction });

    for (const item of items) {
      const material = await Material.findByPk(item.materialId, { transaction });
      if (!material) throw new Error('Material não encontrado.');
      const materialRequiresSerial = isTrue(material.requiresSerial);
      const typedSerials = Array.isArray(item.serialNumbers) ? item.serialNumbers.map((s) => String(s).trim()).filter(Boolean) : [];
      const serials = materialRequiresSerial ? typedSerials : [];
      const quantity = qty(item.quantity || (materialRequiresSerial ? serials.length : 0) || 0);
      const unitCost = money(item.unitCost ?? 0);
      if (quantity <= 0) throw new Error(`Quantidade inválida para ${material.name}.`);
      if (unitCost <= 0) throw new Error(`Informe o valor unitário da entrada para ${material.name}.`);
      if (materialRequiresSerial) {
        if (serials.length !== Number(quantity)) throw new Error(`Informe exatamente ${Number(quantity)} serial(is) para ${material.name}. Você informou ${serials.length}.`);
        const localSet = new Set();
        const repeatedTyped = [];
        for (const serialNumber of serials) {
          const normalizedSerial = serialNumber.toUpperCase();
          if (localSet.has(normalizedSerial) || serialsInThisEntry.has(normalizedSerial)) repeatedTyped.push(serialNumber);
          localSet.add(normalizedSerial);
        }
        if (repeatedTyped.length) throw new Error(`Serial digitado repetido: ${[...new Set(repeatedTyped)].join(', ')}.`);
        const alreadyRegistered = serials.length ? await SerializedAsset.findAll({ where: { [Op.or]: serials.map((serialNumber) => ({ serialNumber: { [Op.iLike]: serialNumber } })) }, transaction }) : [];
        if (alreadyRegistered.length) throw new Error(`Serial já cadastrado: ${alreadyRegistered.map((asset) => asset.serialNumber).join(', ')}.`);
        serials.forEach((serialNumber) => serialsInThisEntry.add(serialNumber.toUpperCase()));
      }
      const totalCost = money(quantity * unitCost);
      totalItems += quantity;
      totalValue += totalCost;

      await StockBatchItem.create({
        batchId: batch.id,
        materialId: material.id,
        quantity,
        unitCost,
        totalCost,
        serialNumbers: serials,
        manufacturerLot: item.manufacturerLot || null,
        purchaseOrder: item.purchaseOrder || null,
        condition: item.condition || 'novo',
        warehouseLocation: item.warehouseLocation || warehouseLocation || null,
        itemNotes: item.itemNotes || null,
        warehouseId: targetWarehouseId,
      }, { transaction });

      if (materialRequiresSerial) {
        for (const serialNumber of serials) {
          const asset = await SerializedAsset.create({
            materialId: material.id,
            serialNumber,
            mac: item.macBySerial?.[serialNumber] || null,
            brand: item.brand || null,
            model: item.model || null,
            acquisitionCost: unitCost,
            status: 'em_estoque',
            ownerType: 'estoque',
            lastMovementAt: new Date(),
            warehouseId: targetWarehouseId,
            notes: [
              item.itemNotes,
              item.manufacturerLot ? `Lote fabricante: ${item.manufacturerLot}` : null,
              item.purchaseOrder ? `Pedido/OC: ${item.purchaseOrder}` : null,
              item.condition ? `Condição: ${item.condition}` : null,
              item.warehouseLocation || warehouseLocation ? `Local: ${item.warehouseLocation || warehouseLocation}` : null,
            ].filter(Boolean).join(' | ') || null,
          }, { transaction });
          await StockMovement.create({
            type: 'entrada',
            materialId: material.id,
            assetId: asset.id,
            quantity: 1,
            serialNumber,
            toOwnerType: 'estoque',
            toWarehouseId: targetWarehouseId,
            reference: receiptNumber,
            notes: `Entrada por lote ${receiptNumber}. Documento: ${fiscalDocumentNumber || invoiceAccessKey}.`,
            createdById: req.user.id,
          }, { transaction });
        }
      } else {
        // Corrige, de forma idempotente, a unidade que versões anteriores criavam
        // automaticamente ao cadastrar o material antes de registrar a entrada real.
        await correctForcedInitialStock({
          materialId: material.id,
          warehouseId: targetWarehouseId,
          createdById: req.user.id,
          transaction,
        });
        await adjustBalance({ materialId: material.id, ownerType: 'estoque', technicianId: null, warehouseId: targetWarehouseId, delta: quantity, transaction });
        await StockMovement.create({
          type: 'entrada',
          materialId: material.id,
          quantity,
          toOwnerType: 'estoque',
          toWarehouseId: targetWarehouseId,
          reference: receiptNumber,
          notes: `Entrada por lote ${receiptNumber}. Documento: ${fiscalDocumentNumber || invoiceAccessKey}.`,
          createdById: req.user.id,
        }, { transaction });
      }
    }

    batch.totalItems = qty(totalItems);
    batch.totalValue = money(totalValue);
    await batch.save({ transaction });
    await writeAudit({
      req,
      action: 'create',
      entity: 'StockBatch',
      entityId: batch.id,
      message: `Entrada de estoque ${receiptNumber} confirmada com comprovante ${proofAttachmentName}.`,
      afterData: { ...batch.toJSON(), proofAttachmentData: undefined },
      transaction,
    });
    return batch;
  });

  return created(res, { ...result.toJSON(), proofAttachmentData: undefined }, 'Entrada de estoque registrada com documento comprobatório.');
});
