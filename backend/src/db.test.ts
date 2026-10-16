import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "./db";

describe("database connection", () => {
  it("can query the users table", async () => {
    const users = await prisma.user.findMany();
    expect(Array.isArray(users)).toBe(true);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
