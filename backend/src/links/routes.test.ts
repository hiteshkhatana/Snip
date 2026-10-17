import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { prisma } from "../db";

const userAEmail = "links-test-user-a@example.com";
const userBEmail = "links-test-user-b@example.com";
const password = "Correct-Password-123!";

let userAToken: string;
let userBToken: string;
let userAId: string;

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

  const meA = await request(app)
    .get("/api/me")
    .set("Authorization", `Bearer ${userAToken}`);
  userAId = meA.body.userId;

  const signupB = await request(app)
    .post("/api/auth/signup")
    .send({ email: userBEmail, password });
  userBToken = signupB.body.token;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("POST /api/links", () => {
  it("creates a link with a generated short code", async () => {
    const response = await request(app)
      .post("/api/links")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ url: "https://example.com/some-page" });

    expect(response.status).toBe(201);
    expect(response.body.shortCode).toMatch(/^[a-zA-Z0-9]{6,8}$/);
    expect(response.body.originalUrl).toBe("https://example.com/some-page");
  });

  it("creates a link with a custom alias", async () => {
    const response = await request(app)
      .post("/api/links")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ url: "https://example.com", alias: "my-link" });

    expect(response.status).toBe(201);
    expect(response.body.shortCode).toBe("my-link");
  });

  it("rejects an invalid URL", async () => {
    const response = await request(app)
      .post("/api/links")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ url: "not-a-url" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/url/i);
  });

  it("rejects an invalid alias", async () => {
    const response = await request(app)
      .post("/api/links")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ url: "https://example.com", alias: "a" }); // too short

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/alias/i);
  });

  it("rejects a duplicate alias regardless of letter case", async () => {
    await request(app)
      .post("/api/links")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ url: "https://example.com", alias: "DupeTest" });

    const response = await request(app)
      .post("/api/links")
      .set("Authorization", `Bearer ${userBToken}`)
      .send({ url: "https://example.com/other", alias: "dupetest" });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/taken/i);
  });

  it("rejects an expiry date in the past", async () => {
    const response = await request(app)
      .post("/api/links")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ url: "https://example.com", expiresAt: "2020-01-01T00:00:00.000Z" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/expiresAt/i);
  });

  it("rejects a request with a missing JWT", async () => {
    const response = await request(app)
      .post("/api/links")
      .send({ url: "https://example.com" });

    expect(response.status).toBe(401);
  });

  it("rejects a request with an invalid JWT", async () => {
    const response = await request(app)
      .post("/api/links")
      .set("Authorization", "Bearer not-a-real-token")
      .send({ url: "https://example.com" });

    expect(response.status).toBe(401);
  });

  it("associates the created link with the authenticated user", async () => {
    const response = await request(app)
      .post("/api/links")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ url: "https://example.com" });

    expect(response.status).toBe(201);
    expect(response.body.userId).toBe(userAId);

    const stored = await prisma.link.findUnique({ where: { id: response.body.id } });
    expect(stored?.userId).toBe(userAId);
  });

  it("returns 429 after exceeding the per-user creation limit", async () => {
    for (let i = 0; i < 10; i++) {
      const response = await request(app)
        .post("/api/links")
        .set("Authorization", `Bearer ${userAToken}`)
        .send({ url: `https://example.com/rate-limit-${i}` });
      expect(response.status).toBe(201);
    }

    const eleventh = await request(app)
      .post("/api/links")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ url: "https://example.com/rate-limit-11" });

    expect(eleventh.status).toBe(429);
    expect(eleventh.body.error).toMatch(/too many links/i);
  });

  it("still counts a soft-deleted link toward the rate limit", async () => {
    const created = await createLink(userAToken, { url: "https://example.com/to-delete" });
    await request(app)
      .delete(`/api/links/${created.body.id}`)
      .set("Authorization", `Bearer ${userAToken}`);

    for (let i = 0; i < 9; i++) {
      const response = await createLink(userAToken, { url: `https://example.com/after-delete-${i}` });
      expect(response.status).toBe(201);
    }

    const eleventh = await createLink(userAToken, { url: "https://example.com/after-delete-11" });
    expect(eleventh.status).toBe(429);
  });

  it("applies the rate limit per user, not globally", async () => {
    for (let i = 0; i < 10; i++) {
      await createLink(userAToken, { url: `https://example.com/user-a-${i}` });
    }

    const userBResponse = await createLink(userBToken, { url: "https://example.com/user-b-1" });
    expect(userBResponse.status).toBe(201);
  });
});

describe("GET /api/links", () => {
  it("returns an empty list when the user has no links", async () => {
    const response = await request(app)
      .get("/api/links")
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination).toEqual({ page: 1, limit: 10, total: 0, totalPages: 0 });
  });

  it("returns links newest first", async () => {
    const first = await request(app)
      .post("/api/links")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ url: "https://example.com/first" });

    const second = await request(app)
      .post("/api/links")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ url: "https://example.com/second" });

    const response = await request(app)
      .get("/api/links")
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.body.data.map((l: any) => l.id)).toEqual([second.body.id, first.body.id]);
  });

  it("paginates results using page and limit", async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/links")
        .set("Authorization", `Bearer ${userAToken}`)
        .send({ url: `https://example.com/page-test-${i}` });
    }

    const response = await request(app)
      .get("/api/links?page=2&limit=2")
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.pagination).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
  });

  it("includes an accurate click count per link", async () => {
    const created = await request(app)
      .post("/api/links")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ url: "https://example.com/clicked" });

    await prisma.click.createMany({
      data: [
        { linkId: created.body.id },
        { linkId: created.body.id },
        { linkId: created.body.id },
      ],
    });

    const response = await request(app)
      .get("/api/links")
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.body.data[0].clickCount).toBe(3);
  });

  it("rejects invalid pagination values", async () => {
    const response = await request(app)
      .get("/api/links?page=0&limit=10")
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.status).toBe(400);

    const response2 = await request(app)
      .get("/api/links?page=1&limit=abc")
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response2.status).toBe(400);

    const response3 = await request(app)
      .get("/api/links?page=1&limit=500")
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response3.status).toBe(400);
  });

  it("does not return another user's links", async () => {
    await request(app)
      .post("/api/links")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ url: "https://example.com/user-a-link" });

    const response = await request(app)
      .get("/api/links")
      .set("Authorization", `Bearer ${userBToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("rejects a request with a missing JWT", async () => {
    const response = await request(app).get("/api/links");

    expect(response.status).toBe(401);
  });
});

async function createLink(token: string, body: object) {
  return request(app).post("/api/links").set("Authorization", `Bearer ${token}`).send(body);
}

describe("PATCH /api/links/:id", () => {
  it("updates the url and expiry date", async () => {
    const created = await createLink(userAToken, { url: "https://example.com/old" });
    const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString();

    const response = await request(app)
      .patch(`/api/links/${created.body.id}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ url: "https://example.com/new", expiresAt: futureDate });

    expect(response.status).toBe(200);
    expect(response.body.originalUrl).toBe("https://example.com/new");
    expect(new Date(response.body.expiresAt).toISOString()).toBe(futureDate);
  });

  it("clears the expiry when expiresAt is set to null", async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    const created = await createLink(userAToken, { url: "https://example.com", expiresAt: futureDate });

    const response = await request(app)
      .patch(`/api/links/${created.body.id}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ expiresAt: null });

    expect(response.status).toBe(200);
    expect(response.body.expiresAt).toBeNull();
  });

  it("rejects an invalid url", async () => {
    const created = await createLink(userAToken, { url: "https://example.com" });

    const response = await request(app)
      .patch(`/api/links/${created.body.id}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ url: "not-a-url" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/url/i);
  });

  it("rejects an expiry date in the past", async () => {
    const created = await createLink(userAToken, { url: "https://example.com" });

    const response = await request(app)
      .patch(`/api/links/${created.body.id}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ expiresAt: "2020-01-01T00:00:00.000Z" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/expiresAt/i);
  });

  it("ignores attempts to change shortCode, userId, createdAt, or deletedAt", async () => {
    const created = await createLink(userAToken, { url: "https://example.com" });
    const originalShortCode = created.body.shortCode;

    const response = await request(app)
      .patch(`/api/links/${created.body.id}`)
      .set("Authorization", `Bearer ${userAToken}`)
      .send({
        shortCode: "hijacked",
        userId: "someone-else",
        createdAt: "2000-01-01T00:00:00.000Z",
        deletedAt: "2000-01-01T00:00:00.000Z",
      });

    expect(response.status).toBe(200);
    expect(response.body.shortCode).toBe(originalShortCode);
    expect(response.body.deletedAt).toBeNull();

    const stored = await prisma.link.findUnique({ where: { id: created.body.id } });
    expect(stored?.shortCode).toBe(originalShortCode);
    expect(stored?.userId).toBe(userAId);
    expect(stored?.deletedAt).toBeNull();
  });

  it("returns 404 for a link belonging to another user", async () => {
    const created = await createLink(userAToken, { url: "https://example.com" });

    const response = await request(app)
      .patch(`/api/links/${created.body.id}`)
      .set("Authorization", `Bearer ${userBToken}`)
      .send({ url: "https://example.com/stolen" });

    expect(response.status).toBe(404);
  });

  it("returns 404 for a nonexistent link", async () => {
    const response = await request(app)
      .patch("/api/links/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ url: "https://example.com" });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/links/:id", () => {
  it("soft-deletes the link", async () => {
    const created = await createLink(userAToken, { url: "https://example.com" });

    const response = await request(app)
      .delete(`/api/links/${created.body.id}`)
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.status).toBe(204);

    const stored = await prisma.link.findUnique({ where: { id: created.body.id } });
    expect(stored?.deletedAt).not.toBeNull();
  });

  it("returns 404 when deleting an already-deleted link", async () => {
    const created = await createLink(userAToken, { url: "https://example.com" });

    await request(app)
      .delete(`/api/links/${created.body.id}`)
      .set("Authorization", `Bearer ${userAToken}`);

    const response = await request(app)
      .delete(`/api/links/${created.body.id}`)
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.status).toBe(404);
  });

  it("returns 404 for a link belonging to another user", async () => {
    const created = await createLink(userAToken, { url: "https://example.com" });

    const response = await request(app)
      .delete(`/api/links/${created.body.id}`)
      .set("Authorization", `Bearer ${userBToken}`);

    expect(response.status).toBe(404);

    const stored = await prisma.link.findUnique({ where: { id: created.body.id } });
    expect(stored?.deletedAt).toBeNull();
  });

  it("a deleted link no longer appears in the list", async () => {
    const created = await createLink(userAToken, { url: "https://example.com" });

    await request(app)
      .delete(`/api/links/${created.body.id}`)
      .set("Authorization", `Bearer ${userAToken}`);

    const response = await request(app)
      .get("/api/links")
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.body.data).toEqual([]);
  });
});

describe("GET /api/links/:id/qrcode", () => {
  it("returns a PNG image for the owner", async () => {
    const created = await createLink(userAToken, { url: "https://example.com", alias: "qr-test-1" });

    const response = await request(app)
      .get(`/api/links/${created.body.id}/qrcode`)
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["content-disposition"]).toMatch(/attachment/);
    expect(response.body.length).toBeGreaterThan(0);
  });

  it("returns 404 for a nonexistent link", async () => {
    const response = await request(app)
      .get("/api/links/00000000-0000-0000-0000-000000000000/qrcode")
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.status).toBe(404);
  });

  it("returns 404 for another user's link", async () => {
    const created = await createLink(userAToken, { url: "https://example.com", alias: "qr-test-2" });

    const response = await request(app)
      .get(`/api/links/${created.body.id}/qrcode`)
      .set("Authorization", `Bearer ${userBToken}`);

    expect(response.status).toBe(404);
  });

  it("returns 404 for a soft-deleted link", async () => {
    const created = await createLink(userAToken, { url: "https://example.com", alias: "qr-test-3" });

    await request(app)
      .delete(`/api/links/${created.body.id}`)
      .set("Authorization", `Bearer ${userAToken}`);

    const response = await request(app)
      .get(`/api/links/${created.body.id}/qrcode`)
      .set("Authorization", `Bearer ${userAToken}`);

    expect(response.status).toBe(404);
  });

  it("returns 401 for a missing JWT", async () => {
    const created = await createLink(userAToken, { url: "https://example.com", alias: "qr-test-4" });

    const response = await request(app).get(`/api/links/${created.body.id}/qrcode`);

    expect(response.status).toBe(401);
  });
});
