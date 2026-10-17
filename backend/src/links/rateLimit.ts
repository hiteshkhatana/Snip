import { prisma } from "../db";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_CREATES = 10;

export async function isRateLimited(userId: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

  const recentCount = await prisma.link.count({
    where: { userId, createdAt: { gte: windowStart } },
  });

  return recentCount >= RATE_LIMIT_MAX_CREATES;
}
