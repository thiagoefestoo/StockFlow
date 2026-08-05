const { User } = require('../models');

const USER_ACCOUNT_LIMIT = 30;
const USER_ACCOUNT_LIMIT_MESSAGE = 'Limite máximo de 30 contas ativas atingido. Inative uma conta ou entre em contato com o Engenheiro de Software do Sistema para mais informações.';

const ACTIVE_ACCOUNT_WHERE = {
  status: 'ativo',
  blockedAt: null,
  deletedAt: null,
};

function isActiveAccount(user) {
  return !!user
    && user.status === 'ativo'
    && !user.blockedAt
    && !user.deletedAt;
}

async function getUserAccountCapacity(options = {}) {
  const used = await User.count({
    where: ACTIVE_ACCOUNT_WHERE,
    transaction: options.transaction,
  });

  return {
    limit: USER_ACCOUNT_LIMIT,
    used,
    remaining: Math.max(USER_ACCOUNT_LIMIT - used, 0),
    reached: used >= USER_ACCOUNT_LIMIT,
  };
}

async function assertUserAccountCapacity(options = {}) {
  const capacity = await getUserAccountCapacity(options);
  if (capacity.reached) {
    const error = new Error(USER_ACCOUNT_LIMIT_MESSAGE);
    error.statusCode = 409;
    error.code = 'USER_ACCOUNT_LIMIT_REACHED';
    throw error;
  }
  return capacity;
}

module.exports = {
  USER_ACCOUNT_LIMIT,
  USER_ACCOUNT_LIMIT_MESSAGE,
  ACTIVE_ACCOUNT_WHERE,
  isActiveAccount,
  getUserAccountCapacity,
  assertUserAccountCapacity,
};
