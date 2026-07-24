const { User } = require('../models');

const USER_ACCOUNT_LIMIT = 30;
const USER_ACCOUNT_LIMIT_MESSAGE = 'Limite máximo de 30 contas atingido. Entre em contato com o Engenheiro de Software do Sistema para mais informações.';

async function getUserAccountCapacity() {
  const used = await User.count();
  return {
    limit: USER_ACCOUNT_LIMIT,
    used,
    remaining: Math.max(USER_ACCOUNT_LIMIT - used, 0),
    reached: used >= USER_ACCOUNT_LIMIT,
  };
}

async function assertUserAccountCapacity() {
  const capacity = await getUserAccountCapacity();
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
  getUserAccountCapacity,
  assertUserAccountCapacity,
};
