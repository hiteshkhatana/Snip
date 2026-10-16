import { Router } from "express";
import { prisma } from "../db";

const router = Router();

router.get("/:code", async (req, res) => {
  const { code } = req.params;

  const link = await prisma.link.findUnique({ where: { shortCode: code } });

  if (!link) {
    return res.status(404).json({ error: "Short link not found" });
  }

  const isDeleted = link.deletedAt !== null;
  const isExpired = link.expiresAt !== null && link.expiresAt.getTime() < Date.now();

  if (isDeleted || isExpired) {
    return res.status(410).json({ error: "This short link is no longer available" });
  }

  await prisma.click.create({
    data: {
      linkId: link.id,
      referrer: req.get("referer") ?? null,
      userAgent: req.get("user-agent") ?? null,
    },
  });

  return res.redirect(302, link.originalUrl);
});

export default router;
