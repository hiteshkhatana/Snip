import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../db";
import { signToken } from "./jwt";
import { isValidPassword } from "./validation";

const router = Router();
const BCRYPT_SALT_ROUNDS = 10;

router.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({
      error:
        "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character",
    });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash },
    });

    const token = signToken({ userId: user.id });
    return res.status(201).json({ token });
  } catch (err: any) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Email is already registered" });
    }
    throw err;
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken({ userId: user.id });
  return res.status(200).json({ token });
});

export default router;
