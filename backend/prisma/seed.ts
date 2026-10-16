import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "../src/db";

const BCRYPT_SALT_ROUNDS = 10;

const DEMO_EMAIL = "demo@snip.local";
const DEMO_PASSWORD = "DemoPass123!"; // documented in README for local demo use only

const DEMO_LINKS = [
  { shortCode: "demo-docs", originalUrl: "https://nodejs.org/en/docs" },
  { shortCode: "demo-repo", originalUrl: "https://github.com" },
  { shortCode: "demo-news", originalUrl: "https://news.ycombinator.com" },
  { shortCode: "demo-blog", originalUrl: "https://example.com/blog" },
];

// Referrer samples mixed across real values, null, and empty string so the
// stats endpoint's "Direct / Unknown" grouping has real data to show.
const REFERRER_SAMPLES = [
  "https://google.com",
  "https://twitter.com",
  null,
  "",
  "https://news.ycombinator.com",
];

function daysAgo(n: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - n);
  return date;
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_SALT_ROUNDS);

  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, passwordHash },
  });

  const links = [];
  for (const linkData of DEMO_LINKS) {
    const link = await prisma.link.upsert({
      where: { shortCode: linkData.shortCode },
      update: { originalUrl: linkData.originalUrl, userId: demoUser.id, deletedAt: null },
      create: { ...linkData, userId: demoUser.id },
    });
    links.push(link);
  }

  // Re-seed clicks for just these demo links: delete only their existing
  // clicks, then insert the fixed demo set. This keeps the script
  // idempotent without touching any other user's data.
  const linkIds = links.map((link) => link.id);
  await prisma.click.deleteMany({ where: { linkId: { in: linkIds } } });

  const clickRows = [];
  for (const link of links) {
    for (let day = 0; day < 7; day++) {
      const clicksOnThisDay = day % 2 === 0 ? 2 : 1; // spreads clicks across several days
      for (let i = 0; i < clicksOnThisDay; i++) {
        clickRows.push({
          linkId: link.id,
          clickedAt: daysAgo(day),
          referrer: REFERRER_SAMPLES[(day + i) % REFERRER_SAMPLES.length],
          userAgent: "Mozilla/5.0 (Seed Script Demo Data)",
        });
      }
    }
  }

  await prisma.click.createMany({ data: clickRows });

  console.log(`Seeded demo user: ${DEMO_EMAIL} (password: ${DEMO_PASSWORD})`);
  console.log(`Seeded ${links.length} demo links and ${clickRows.length} demo clicks.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
