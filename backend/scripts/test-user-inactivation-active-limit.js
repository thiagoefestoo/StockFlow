const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, '..');
const serviceSource = fs.readFileSync(path.join(root, 'app/services/userAccountLimitService.js'), 'utf8');
const controllerSource = fs.readFileSync(path.join(root, 'app/controllers/userController.js'), 'utf8');
const schemaSource = fs.readFileSync(path.join(root, 'app/services/runtimeSchemaService.js'), 'utf8');
const usersPageSource = fs.readFileSync(path.join(root, '../frontend/src/pages/Users.jsx'), 'utf8');

assert(serviceSource.includes("status: 'ativo'"), 'O limite precisa filtrar status ativo.');
assert(serviceSource.includes('blockedAt: null'), 'Contas bloqueadas não devem ocupar vaga ativa.');
assert(serviceSource.includes('deletedAt: null'), 'Contas excluídas não devem ocupar vaga ativa.');
assert(serviceSource.includes('isActiveAccount'), 'A regra de conta ativa precisa ser compartilhada.');

assert(controllerSource.includes("if (status === 'ativo') await assertUserAccountCapacity();"), 'Criação ativa precisa validar a capacidade.');
assert(controllerSource.includes("['activate', 'unblock', 'restore'].includes(action)"), 'Reativação precisa validar a capacidade.');
assert(controllerSource.includes("action === 'deactivate'"), 'A inativação precisa permanecer disponível no backend.');
assert(controllerSource.includes('Você não pode bloquear, inativar ou excluir sua própria conta logada.'), 'A própria conta deve permanecer protegida.');

assert(schemaSource.includes('BEFORE INSERT OR UPDATE OF status, "blockedAt", "deletedAt" ON users'), 'O trigger precisa validar criação e reativação.');
assert(schemaSource.includes("WHERE status = 'ativo'"), 'O trigger precisa contar apenas contas ativas.');
assert(schemaSource.includes('AND "blockedAt" IS NULL'), 'O trigger precisa excluir bloqueados da contagem.');
assert(schemaSource.includes('AND "deletedAt" IS NULL'), 'O trigger precisa excluir excluídos da contagem.');

assert(usersPageSource.includes("askStatus(u, 'deactivate')"), 'A página precisa exibir o botão Inativar.');
assert(usersPageSource.includes('Não ocupam vaga'), 'A interface precisa explicar a contagem.');
assert(usersPageSource.includes('todos os registros históricos permanecerão intactos'), 'A confirmação precisa explicar a preservação dos dados.');

console.log('✅ Inativação de usuário e limite de contas ativas validados.');
