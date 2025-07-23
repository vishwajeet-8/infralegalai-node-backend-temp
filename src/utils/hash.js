import bcrypt from "bcrypt";

export async function hashPassword(plain) {
  // 12 rounds as agreed
  return bcrypt.hash(plain, 12);
}

export async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
