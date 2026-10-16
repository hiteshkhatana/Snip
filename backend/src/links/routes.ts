import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, AuthenticatedRequest } from "../auth/middleware";
import { isValidUrl, isValidAlias, isValidFutureDate } from "./validation";
import { generateShortCode } from "./shortCode";
import { parsePagination } from "./pagination";
import { getClicksByDay, getTopReferrers } from "./analytics";

const router = Router();
const MAX_GENERATED_CODE_ATTEMPTS = 5;

router.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  const pagination = parsePagination(req.query.page, req.query.limit);

  if (!pagination) {
    return res.status(400).json({ error: "page and limit must be positive integers (limit max 100)" });
  }

  const { page, limit } = pagination;
  const userId = req.userId as string;
  const where = { userId, deletedAt: null };

  const [links, total] = await Promise.all([
    prisma.link.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { clicks: true } } },
    }),
    prisma.link.count({ where }),
  ]);

  const data = links.map((link) => ({
    id: link.id,
    shortCode: link.shortCode,
    originalUrl: link.originalUrl,
    expiresAt: link.expiresAt,
    createdAt: link.createdAt,
    clickCount: link._count.clicks,
  }));

  return res.status(200).json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

router.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  const { url, alias, expiresAt } = req.body;

  if (!isValidUrl(url)) {
    return res.status(400).json({ error: "url must be a valid http or https URL (max 2048 characters)" });
  }

  if (alias !== undefined && !isValidAlias(alias)) {
    return res.status(400).json({
      error: "alias must be 4-30 characters, letters/numbers/hyphens only, and not a reserved word",
    });
  }

  if (expiresAt !== undefined && !isValidFutureDate(expiresAt)) {
    return res.status(400).json({ error: "expiresAt must be a valid date in the future" });
  }

  const userId = req.userId as string;
  const expiresAtDate = expiresAt !== undefined ? new Date(expiresAt) : null;

  if (alias) {
    try {
      const link = await prisma.link.create({
        data: { userId, shortCode: alias, originalUrl: url, expiresAt: expiresAtDate },
      });
      return res.status(201).json(link);
    } catch (err: any) {
      if (err.code === "P2002") {
        return res.status(409).json({ error: "alias is already taken" });
      }
      throw err;
    }
  }

  for (let attempt = 0; attempt < MAX_GENERATED_CODE_ATTEMPTS; attempt++) {
    const shortCode = generateShortCode();
    try {
      const link = await prisma.link.create({
        data: { userId, shortCode, originalUrl: url, expiresAt: expiresAtDate },
      });
      return res.status(201).json(link);
    } catch (err: any) {
      if (err.code === "P2002") {
        continue; // extremely rare random collision, try a new code
      }
      throw err;
    }
  }

  return res.status(500).json({ error: "Could not generate a unique short code, please try again" });
});

router.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.userId as string;
  const { id } = req.params;

  const existing = await prisma.link.findFirst({
    where: { id, userId, deletedAt: null },
  });

  if (!existing) {
    return res.status(404).json({ error: "Link not found" });
  }

  const data: { originalUrl?: string; expiresAt?: Date | null } = {};

  if ("url" in req.body) {
    if (!isValidUrl(req.body.url)) {
      return res.status(400).json({ error: "url must be a valid http or https URL (max 2048 characters)" });
    }
    data.originalUrl = req.body.url;
  }

  if ("expiresAt" in req.body) {
    if (req.body.expiresAt === null) {
      data.expiresAt = null; // explicitly clears the expiry
    } else if (isValidFutureDate(req.body.expiresAt)) {
      data.expiresAt = new Date(req.body.expiresAt);
    } else {
      return res.status(400).json({ error: "expiresAt must be a valid date in the future, or null to clear it" });
    }
  }

  const updated = await prisma.link.update({ where: { id }, data });
  return res.status(200).json(updated);
});

router.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.userId as string;
  const { id } = req.params;

  const existing = await prisma.link.findFirst({
    where: { id, userId, deletedAt: null },
  });

  if (!existing) {
    return res.status(404).json({ error: "Link not found" });
  }

  await prisma.link.update({ where: { id }, data: { deletedAt: new Date() } });
  return res.status(204).send();
});

router.get("/:id/stats", requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.userId as string;
  const { id } = req.params;

  const existing = await prisma.link.findFirst({
    where: { id, userId, deletedAt: null },
  });

  if (!existing) {
    return res.status(404).json({ error: "Link not found" });
  }

  const [totalClicks, clicksByDay, topReferrers] = await Promise.all([
    prisma.click.count({ where: { linkId: id } }),
    getClicksByDay(id),
    getTopReferrers(id),
  ]);

  return res.status(200).json({ totalClicks, clicksByDay, topReferrers });
});

export default router;
