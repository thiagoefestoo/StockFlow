const User = require('./user');
const ContractorCompany = require('./contractorCompany');
const Technician = require('./technician');
const Material = require('./material');
const SerializedAsset = require('./serializedAsset');
const StockBalance = require('./stockBalance');
const StockBatch = require('./stockBatch');
const StockBatchItem = require('./stockBatchItem');
const StockMovement = require('./stockMovement');
const Transfer = require('./transfer');
const TransferItem = require('./transferItem');
const ServiceOrder = require('./serviceOrder');
const ServiceOrderMaterial = require('./serviceOrderMaterial');
const AuditLog = require('./auditLog');
const Notification = require('./notification');
const Task = require('./task');
const MaterialRequest = require('./materialRequest');
const MaterialRequestItem = require('./materialRequestItem');
const ApprovalRequest = require('./approvalRequest');

ContractorCompany.hasMany(Technician, { foreignKey: 'companyId' });
Technician.belongsTo(ContractorCompany, { foreignKey: 'companyId' });

Technician.hasOne(User, { foreignKey: 'technicianId' });
User.belongsTo(Technician, { foreignKey: 'technicianId' });

Material.hasMany(SerializedAsset, { foreignKey: 'materialId' });
SerializedAsset.belongsTo(Material, { foreignKey: 'materialId' });
Technician.hasMany(SerializedAsset, { foreignKey: 'technicianId' });
SerializedAsset.belongsTo(Technician, { foreignKey: 'technicianId' });

Material.hasMany(StockBalance, { foreignKey: 'materialId' });
StockBalance.belongsTo(Material, { foreignKey: 'materialId' });
Technician.hasMany(StockBalance, { foreignKey: 'technicianId' });
StockBalance.belongsTo(Technician, { foreignKey: 'technicianId' });

StockBatch.belongsTo(User, { as: 'createdBy', foreignKey: 'createdById' });
StockBatch.hasMany(StockBatchItem, { foreignKey: 'batchId' });
StockBatchItem.belongsTo(StockBatch, { foreignKey: 'batchId' });
StockBatchItem.belongsTo(Material, { foreignKey: 'materialId' });

StockMovement.belongsTo(Material, { foreignKey: 'materialId' });
StockMovement.belongsTo(SerializedAsset, { foreignKey: 'assetId' });
StockMovement.belongsTo(Technician, { as: 'fromTechnician', foreignKey: 'fromTechnicianId' });
StockMovement.belongsTo(Technician, { as: 'toTechnician', foreignKey: 'toTechnicianId' });
StockMovement.belongsTo(User, { as: 'createdBy', foreignKey: 'createdById' });

Transfer.belongsTo(Technician, { foreignKey: 'technicianId' });
Transfer.belongsTo(User, { as: 'createdBy', foreignKey: 'createdById' });
Transfer.hasMany(TransferItem, { foreignKey: 'transferId' });
TransferItem.belongsTo(Transfer, { foreignKey: 'transferId' });
TransferItem.belongsTo(Material, { foreignKey: 'materialId' });
TransferItem.belongsTo(SerializedAsset, { foreignKey: 'assetId' });

ServiceOrder.belongsTo(Technician, { foreignKey: 'technicianId' });
ServiceOrder.belongsTo(User, { as: 'createdBy', foreignKey: 'createdById' });
ServiceOrder.hasMany(ServiceOrderMaterial, { foreignKey: 'serviceOrderId' });
ServiceOrderMaterial.belongsTo(ServiceOrder, { foreignKey: 'serviceOrderId' });
ServiceOrderMaterial.belongsTo(Material, { foreignKey: 'materialId' });
ServiceOrderMaterial.belongsTo(SerializedAsset, { foreignKey: 'assetId' });

AuditLog.belongsTo(User, { as: 'actor', foreignKey: 'actorId' });
Notification.belongsTo(User, { foreignKey: 'userId' });
Task.belongsTo(User, { as: 'assignedTo', foreignKey: 'assignedToId' });
Task.belongsTo(User, { as: 'createdBy', foreignKey: 'createdById' });

MaterialRequest.belongsTo(Technician, { foreignKey: 'technicianId' });
Technician.hasMany(MaterialRequest, { foreignKey: 'technicianId' });
MaterialRequest.belongsTo(User, { as: 'requestedBy', foreignKey: 'requestedById' });
MaterialRequest.belongsTo(User, { as: 'approvedBy', foreignKey: 'approvedById' });
MaterialRequest.belongsTo(User, { as: 'deliveredBy', foreignKey: 'deliveredById' });
MaterialRequest.belongsTo(Transfer, { foreignKey: 'transferId' });
MaterialRequest.hasMany(MaterialRequestItem, { foreignKey: 'requestId' });
MaterialRequestItem.belongsTo(MaterialRequest, { foreignKey: 'requestId' });
MaterialRequestItem.belongsTo(Material, { foreignKey: 'materialId' });
MaterialRequestItem.belongsTo(SerializedAsset, { foreignKey: 'assetId' });

ApprovalRequest.belongsTo(User, { as: 'requestedBy', foreignKey: 'requestedById' });
ApprovalRequest.belongsTo(User, { as: 'decidedBy', foreignKey: 'decidedById' });

module.exports = {
  User,
  ContractorCompany,
  Technician,
  Material,
  SerializedAsset,
  StockBalance,
  StockBatch,
  StockBatchItem,
  StockMovement,
  Transfer,
  TransferItem,
  ServiceOrder,
  ServiceOrderMaterial,
  AuditLog,
  Notification,
  Task,
  MaterialRequest,
  MaterialRequestItem,
  ApprovalRequest,
};
