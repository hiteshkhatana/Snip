import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { prisma } from "../db";

const userAEmail = "stats-test-user-a@example.com";
const userBEmail = "stats-test-user-b@example.com";
const password = "correct-password-123";

let userAToken: string;
let userBToken: string;

async function cleanup() {
  await prisma.click.deleteMany({
    where: { link: { user: { email: { in: [userAEmail, userBEmail] } } } },
  });
  await prisma.link.deleteMany({
    where: { user: { email: { in: [userAEmail, userBEmail] } } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: [userAEmail, userBEmail] } },
  });
}

beforeEach(async () => {
  await cleanup();

  const signupA = await request(app)
    .post("/api/auth/signup")
    .send({ email: userAEmail, password });
  userAToken = signupA.body.token;

  const signupB = await request(app)
    .post("/api/auth/signup")
    .send({ email: userBEmail, password });
  userBToken = signupB.body.token;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function createLink(token: string, body: object) {
  return request(app).post("/api/links").set("Authorization", `Bearer ${token}`).send(body);
}

function daysAgo(n: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - n);
  return date;
}

describe("GET /api/links/:id/stats", () => {
  it("returns zero totals and 7 zero-click days for a link with no clicks", async () => {
    const created = await createLink(userAToken, { url: "https://example.com" });

    const response = await request(app)
      .get(`/api/links/${created.body.id}/stats`)
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.status).toBe(200);
    expect(response.body.totalClicks).toBe(0);
    expect(response.body.clicksByDay).toHaveLength(7);
    expect(response.body.clicksByDay.every((d: any) => d.count === 0)).toBe(true);
    expect(response.body.topReferrers).toEqual([]);
  });

  it("returns the correct total click count", async () => {
    const created = await createLink(userAToken, { url: "https://example.com" });

    await prisma.click.createMany({
      data: [
        { linkId: created.body.id },
        { linkId: created.body.id },
        { linkId: created.body.id },
      ],
    });

    const response = await request(app)
      .get(`/api/links/${created.body.id}/stats`)
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.body.totalClicks).toBe(3);
  });

  it("returns exactly 7 daily entries including zero-click days", async () => {
    const created = await createLink(userAToken, { url: "https://example.com" });

    await prisma.click.create({ data: { linkId: created.body.id, clickedAt: new Date() } });

    const response = await request(app)
      .get(`/api/links/${created.body.id}/stats`)
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.body.clicksByDay).toHaveLength(7);
    const zeroClickDays = response.body.clicksByDay.filter((d: any) => d.count === 0);
    expect(zeroClickDays.length).toBe(6);
  });

  it("groups clicks into the correct dates", async () => {
    const created = await createLink(userAToken, { url: "https://example.com" });

    const today = new Date();
    const twoDaysAgo = daysAgo(2);

    await prisma.click.createMany({
      data: [
        { linkId: created.body.id, clickedAt: today },
        { linkId: created.body.id, clickedAt: today },
        { linkId: created.body.id, clickedAt: twoDaysAgo },
      ],
    });

    const response = await request(app)
      .get(`/api/links/${created.body.id}/stats`)
      .set("Authorization", `Bearer ${userAToken}`);

    const todayKey = today.toISOString().slice(0, 10);
    const twoDaysAgoKey = twoDaysAgo.toISOString().slice(0, 10);

    const todayEntry = response.body.clicksByDay.find((d: any) => d.day === todayKey);
    const twoDaysAgoEntry = response.body.clicksByDay.find((d: any) => d.day === twoDaysAgoKey);

    expect(todayEntry.count).toBe(2);
    expect(twoDaysAgoEntry.count).toBe(1);
  });

  it("returns top 5 referrers ordered by count descending", async () => {
    const created = await createLink(userAToken, { url: "https://example.com" });

    const clicksData = [
      ...Array(5).fill({ referrer: "https://google.com" }),
      ...Array(3).fill({ referrer: "https://twitter.com" }),
      ...Array(2).fill({ referrer: "https://facebook.com" }),
      ...Array(1).fill({ referrer: "https://reddit.com" }),
      ...Array(1).fill({ referrer: "https://linkedin.com" }),
      ...Array(1).fill({ referrer: "https://news.ycombinator.com" }),
    ].map((c) => ({ linkId: created.body.id, referrer: c.referrer }));

    await prisma.click.createMany({ data: clicksData });

    const response = await request(app)
      .get(`/api/links/${created.body.id}/stats`)
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.body.topReferrers).toHaveLength(5);
    expect(response.body.topReferrers[0]).toEqual({ referrer: "https://google.com", count: 5 });
    expect(response.body.topReferrers[1]).toEqual({ referrer: "https://twitter.com", count: 3 });
    expect(response.body.topReferrers[2]).toEqual({ referrer: "https://facebook.com", count: 2 });

    const counts = response.body.topReferrers.map((r: any) => r.count);
    const sorted = [...counts].sort((a, b) => b - a);
    expect(counts).toEqual(sorted);
  });

  it("groups null and empty referrers together as Direct / Unknown", async () => {
    const created = await createLink(userAToken, { url: "https://example.com" });

    await prisma.click.createMany({
      data: [
        { linkId: created.body.id, referrer: null },
        { linkId: created.body.id, referrer: "" },
        { linkId: created.body.id, referrer: null },
      ],
    });

    const response = await request(app)
      .get(`/api/links/${created.body.id}/stats`)
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.body.topReferrers).toHaveLength(1);
    expect(response.body.topReferrers[0]).toEqual({ referrer: "Direct / Unknown", count: 3 });
  });

  it("returns 404 for a nonexistent link", async () => {
    const response = await request(app)
      .get("/api/links/00000000-0000-0000-0000-000000000000/stats")
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.status).toBe(404);
  });

  it("returns 404 for another user's link", async () => {
    const created = await createLink(userAToken, { url: "https://example.com" });

    const response = await request(app)
      .get(`/api/links/${created.body.id}/stats`)
      .set("Authorization", `Bearer ${userBToken}`);

    expect(response.status).toBe(404);
  });

  it("returns 404 for a deleted link", async () => {
    const created = await createLink(userAToken, { url: "https://example.com" });

    await request(app)
      .delete(`/api/links/${created.body.id}`)
      .set("Authorization", `Bearer ${userAToken}`);

    const response = await request(app)
      .get(`/api/links/${created.body.id}/stats`)
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.status).toBe(404);
  });

  it("returns 401 for a missing or invalid JWT", async () => {
    const created = await createLink(userAToken, { url: "https://example.com" });

    const noToken = await request(app).get(`/api/links/${created.body.id}/stats`);
    expect(noToken.status).toBe(401);

    const badToken = await request(app)
      .get(`/api/links/${created.body.id}/stats`)
      .set("Authorization", "Bearer not-a-real-token");
    expect(badToken.status).toBe(401);
  });
});
