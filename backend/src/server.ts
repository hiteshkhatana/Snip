import "dotenv/config";

// Fail fast if required configuration is missing, instead of starting in a
// broken or insecure state (e.g. signing JWTs with "undefined" as the
// secret, or CORS silently allowing any origin).
const REQUIRED_ENV_VARS = ["DATABASE_URL", "JWT_SECRET", "FRONTEND_URL", "PUBLIC_SHORT_URL_BASE"];
const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(`Missing required environment variable(s): ${missing.join(", ")}`);
  process.exit(1);
}

import app from "./app";

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
