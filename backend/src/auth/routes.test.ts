import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app";
import { prisma } from "../db";

const testEmail = "auth-test-user@example.com";
const testPassword = "correct-password-123";

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { email: testEmail } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: testEmail } });
  await prisma.$disconnect();
});

describe("POST /api/auth/signup", () => {
  it("creates a user and returns a token", async () => {
    const response = await request(app)
      .post("/api/auth/signup")
      .send({ email: testEmail, password: testPassword });

    expect(response.status).toBe(201);
    expect(typeof response.body.token).toBe("string");
  });

  it("rejects a duplicate email", async () => {
    await request(app)
      .post("/api/auth/signup")
      .send({ email: testEmail, password: testPassword });

    const response = await request(app)
      .post("/api/auth/signup")
      .send({ email: testEmail, password: testPassword });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/already registered/i);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const response = await request(app)
      .post("/api/auth/signup")
      .send({ email: testEmail, password: "abc123" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/8 characters/i);
  });

  it("rejects a password with no digit", async () => {
    const response = await request(app)
      .post("/api/auth/signup")
      .send({ email: testEmail, password: "longenoughpassword" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/number/i);
  });

  it("accepts a password that is 8+ characters and includes a digit", async () => {
    const response = await request(app)
      .post("/api/auth/signup")
      .send({ email: testEmail, password: "password1" });

    expect(response.status).toBe(201);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await request(app)
      .post("/api/auth/signup")
      .send({ email: testEmail, password: testPassword });
  });

  it("logs in with correct credentials and returns a token", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: testPassword });

    expect(response.status).toBe(200);
    expect(typeof response.body.token).toBe("string");
  });

  it("rejects an incorrect password", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: "wrong-password" });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/invalid email or password/i);
  });
});

describe("GET /api/me (auth middleware)", () => {
  it("rejects a request with no token", async () => {
    const response = await request(app).get("/api/me");

    expect(response.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const expiredToken = jwt.sign(
      { userId: "some-user-id" },
      process.env.JWT_SECRET as string,
      { expiresIn: -10 } // already expired 10 seconds ago
    );

    const response = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
  });

  it("accepts a valid token and attaches the user id", async () => {
    const signupResponse = await request(app)
      .post("/api/auth/signup")
      .send({ email: testEmail, password: testPassword });

    const token = signupResponse.body.token;

    const response = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(typeof response.body.userId).toBe("string");
  });
});
