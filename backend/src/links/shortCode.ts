import { randomInt } from "crypto";

const CODE_CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateShortCode(): string {
  const length = randomInt(6, 9); // 6, 7, or 8 characters
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARACTERS[randomInt(0, CODE_CHARACTERS.length)];
  }
  return code;
}
