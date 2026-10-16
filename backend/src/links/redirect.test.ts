import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { prisma } from "../db";

const userEmail = "redirect-test-user@example.com";
const password = "correct-password-123";

let userToken: string;

async function cleanup() {
  await prisma.click.deleteMany({
    where: { link: { user: { email: userEmail } } },
  });
  await prisma.link.deleteMany({ where: { user: { email: userEmail } } });
  await prisma.user.deleteMany({ where: { email: userEmail } });
}

beforeEach(async () => {
  await cleanup();

  const signup = await request(app)
    .post("/api/auth/signup")
    .send({ email: userEmail, password });
  userToken = signup.body.token;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function createLink(body: object) {
  return request(app).post("/api/links").set("Authorization", `Bearer ${userToken}`).send(body);
}

describe("GET /:code", () => {
  it("redirects to the original URL with a 302", async () => {
    const created = await createLink({ url: "https://example.com/target", alias: "redir1" });

    const response = await request(app).get(`/${created.body.shortCode}`);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("https://example.com/target");
  });

  it("does not require authentication", async () => {
    const created = await createLink({ url: "https://example.com", alias: "redir2" });

    // no Authorization header set at all
    const response = await request(app).get(`/${created.body.shortCode}`);

    expect(response.status).toBe(302);
  });

  it("matches the short code case-insensitively", async () => {
    const created = await createLink({ url: "https://example.com", alias: "CaseTest" });

    const response = await request(app).get(`/casetest`);

    expect(response.status).toBe(302);
  });

  it("records a click with referrer and user agent", async () => {
    const created = await createLink({ url: "https://example.com", alias: "redir3" });

    await request(app)
      .get(`/${created.body.shortCode}`)
      .set("Referer", "https://google.com")
      .set("User-Agent", "TestAgent/1.0");

    const clicks = await prisma.click.findMany({ where: { linkId: created.body.id } });

    expect(clicks).toHaveLength(1);
    expect(clicks[0].referrer).toBe("https://google.com");
    expect(clicks[0].userAgent).toBe("TestAgent/1.0");
    expect(clicks[0].clickedAt).toBeInstanceOf(Date);
  });

  it("records a click with null referrer when absent", async () => {
    const created = await createLink({ url: "https://example.com", alias: "redir4" });

    await request(app).get(`/${created.body.shortCode}`).set("User-Agent", "TestAgent/1.0");

    const clicks = await prisma.click.findMany({ where: { linkId: created.body.id } });

    expect(clicks).toHaveLength(1);
    expect(clicks[0].referrer).toBeNull();
  });

  it("returns 404 for an unknown short code", async () => {
    const response = await request(app).get("/does-not-exist-code");

    expect(response.status).toBe(404);
  });

  it("returns 410 for an expired link", async () => {
    const created = await createLink({
      url: "https://example.com",
      alias: "redir5",
      expiresAt: new Date(Date.now() + 1000 * 60).toISOString(),
    });

    // directly backdate expiresAt in the DB since we can't create an
    // already-expired link through the API (expiresAt must be in the future)
    await prisma.link.update({
      where: { id: created.body.id },
      data: { expiresAt: new Date(Date.now() - 1000 * 60) },
    });

    const response = await request(app).get(`/${created.body.shortCode}`);

    expect(response.status).toBe(410);
  });

  it("returns 410 for a soft-deleted link", async () => {
    const created = await createLink({ url: "https://example.com", alias: "redir6" });

    await request(app)
      .delete(`/api/links/${created.body.id}`)
      .set("Authorization", `Bearer ${userToken}`);

    const response = await request(app).get(`/${created.body.shortCode}`);

    expect(response.status).toBe(410);
  });

  it("does not record a click for an expired link", async () => {
    const created = await createLink({
      url: "https://example.com",
      alias: "redir7",
      expiresAt: new Date(Date.now() + 1000 * 60).toISOString(),
    });

    await prisma.link.update({
      where: { id: created.body.id },
      data: { expiresAt: new Date(Date.now() - 1000 * 60) },
    });

    await request(app).get(`/${created.body.shortCode}`);

    const clicks = await prisma.click.findMany({ where: { linkId: created.body.id } });
    expect(clicks).toHaveLength(0);
  });

  it("still allows /health and /api routes to work", async () => {
    const health = await request(app).get("/health");
    expect(health.status).toBe(200);

    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${userToken}`);
    expect(me.status).toBe(200);
  });
});
