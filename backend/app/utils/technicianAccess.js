const { isPrivileged, userWarehouseIds, userCities } = require('./warehouseAccess');

function normalizeCity(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function technicianAllowed(user, technician) {
  if (!technician) return false;
  if (isPrivileged(user)) return true;

  const technicianId = Number(technician.id || 0);
  if (Number(user?.technicianId || 0) === technicianId && technicianId > 0) return true;

  const defaultWarehouseId = Number(technician.defaultWarehouseId || 0);
  if (defaultWarehouseId > 0) {
    // O estoque padrão define a cidade operacional do técnico. Não permite que
    // serviceCities amplie o acesso para uma cidade diferente da sua base.
    return userWarehouseIds(user).includes(defaultWarehouseId);
  }

  // Compatibilidade com cadastros antigos que ainda não possuem estoque padrão.
  const allowedCities = new Set(userCities(user).map(normalizeCity).filter(Boolean));
  if (!allowedCities.size) return false;

  const warehouseCity = normalizeCity(technician.defaultWarehouse?.city || technician.DefaultWarehouse?.city);
  if (warehouseCity) return allowedCities.has(warehouseCity);

  const serviceCities = Array.isArray(technician.serviceCities) ? technician.serviceCities : [];
  return serviceCities.some((city) => allowedCities.has(normalizeCity(city)));
}

function filterTechniciansForUser(user, technicians = []) {
  return (Array.isArray(technicians) ? technicians : []).filter((technician) => technicianAllowed(user, technician));
}

function assertTechnicianAccess(user, technician, message = 'Você não tem acesso a este técnico porque ele pertence a outra cidade.') {
  if (!technicianAllowed(user, technician)) {
    const error = new Error(message);
    error.statusCode = 403;
    throw error;
  }
}

module.exports = {
  normalizeCity,
  technicianAllowed,
  filterTechniciansForUser,
  assertTechnicianAccess,
};
