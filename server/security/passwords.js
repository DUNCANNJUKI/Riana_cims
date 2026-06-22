const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$/;

const isPasswordHash = (value) => BCRYPT_PATTERN.test(String(value || ''));

const hashPassword = (password) => bcrypt.hash(String(password), BCRYPT_ROUNDS);

const verifyPassword = async (password, storedPassword) => {
  if (!storedPassword) return false;
  if (isPasswordHash(storedPassword)) return bcrypt.compare(String(password), storedPassword);
  const supplied = Buffer.from(String(password));
  const legacy = Buffer.from(String(storedPassword));
  return supplied.length === legacy.length && require('crypto').timingSafeEqual(supplied, legacy);
};

const verifyAndUpgradePassword = async (pool, user, password) => {
  const valid = await verifyPassword(password, user.password);
  if (!valid) return false;
  if (!isPasswordHash(user.password)) {
    const upgraded = await hashPassword(password);
    await pool.query('UPDATE user_profiles SET password = ? WHERE id = ? AND password = ?', [upgraded, user.id, user.password]);
    user.password = upgraded;
  }
  return true;
};

module.exports = { hashPassword, isPasswordHash, verifyPassword, verifyAndUpgradePassword };
