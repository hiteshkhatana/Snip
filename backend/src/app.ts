import express from "express";
import cors from "cors";
import authRoutes from "./auth/routes";
import linkRoutes from "./links/routes";
import redirectRoutes from "./links/redirect";
import { requireAuth, AuthenticatedRequest } from "./auth/middleware";

const app = express();

// An empty/undefined origin would make the cors package fall back to "*"
// (allow any origin), so an unset FRONTEND_URL explicitly resolves to a
// value that matches nothing rather than one that matches everything.
app.use(cors({ origin: process.env.FRONTEND_URL || "no-frontend-url-configured" }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/links", linkRoutes);

// Temporary route to verify the auth middleware; will be replaced by real
// protected routes (e.g. GET /api/links) in the next step.
app.get("/api/me", requireAuth, (req: AuthenticatedRequest, res) => {
  res.status(200).json({ userId: req.userId });
});

// Mounted last: GET /:code is a catch-all pattern and would otherwise match
// /health or any /api/* path before they get a chance to handle the request.
app.use("/", redirectRoutes);

export default app;
