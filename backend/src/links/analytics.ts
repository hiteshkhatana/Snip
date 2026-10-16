import { Prisma } from "@prisma/client";
import { prisma } from "../db";

export type ClicksByDay = { day: string; count: number };
export type TopReferrer = { referrer: string; count: number };

// Calendar days are determined by the database server's time zone
// (via Postgres's CURRENT_DATE). This is a simplification for this
// take-home: a per-user time zone is not implemented.
export async function getClicksByDay(linkId: string): Promise<ClicksByDay[]> {
  const rows = await prisma.$queryRaw<{ day: Date; count: bigint }[]>(
    Prisma.sql`
      SELECT
        d.day::date AS day,
        COUNT(c.id)::int AS count
      FROM generate_series(
        (CURRENT_DATE - INTERVAL '6 days'),
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS d(day)
      LEFT JOIN clicks c
        ON c."linkId" = ${linkId}
        AND c."clickedAt" >= d.day
        AND c."clickedAt" < d.day + INTERVAL '1 day'
      GROUP BY d.day
      ORDER BY d.day;
    `
  );

  return rows.map((row) => ({
    day: row.day.toISOString().slice(0, 10), // "YYYY-MM-DD"
    count: Number(row.count),
  }));
}

export async function getTopReferrers(linkId: string): Promise<TopReferrer[]> {
  const rows = await prisma.$queryRaw<{ referrer: string; count: bigint }[]>(
    Prisma.sql`
      SELECT
        COALESCE(NULLIF(referrer, ''), 'Direct / Unknown') AS referrer,
        COUNT(*)::int AS count
      FROM clicks
      WHERE "linkId" = ${linkId}
      GROUP BY COALESCE(NULLIF(referrer, ''), 'Direct / Unknown')
      ORDER BY count DESC
      LIMIT 5;
    `
  );

  return rows.map((row) => ({
    referrer: row.referrer,
    count: Number(row.count),
  }));
}
