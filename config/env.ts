import dotenv from "dotenv";

dotenv.config();

const port = Number(process.env.PORT) || 5000;
const deploymentHost =
  process.env.API_PUBLIC_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL;
const publicUrl = deploymentHost
  ? deploymentHost.startsWith("http")
    ? deploymentHost.replace(/\/$/, "")
    : `https://${deploymentHost.replace(/\/$/, "")}`
  : `http://localhost:${port}`;

const requiredVars = [
  "MONGO_URI",
  "JWT_SECRET",
  "DO_SPACES_KEY",
  "DO_SPACES_SECRET",
  "DO_SPACES_ENDPOINT",
  "DO_SPACES_REGION",
  "DO_SPACES_BUCKET",
] as const;

for (const key of requiredVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  port,
  nodeEnv: process.env.NODE_ENV || "development",
  mongoUri: process.env.MONGO_URI as string,
  // MONGO_URI has no database path segment, so the db name is passed to
  // mongoose.connect() separately via this.
  dbName: process.env.DB_NAME || "bongooceandb",
  clientUrl: process.env.CLIENT_URL || "http://localhost:3000",
  clientUrls: (process.env.CLIENT_URL || "http://localhost:3000")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean),
  isProduction:
    process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
  publicUrl,
  jwtSecret: process.env.JWT_SECRET as string,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  spaces: {
    key: process.env.DO_SPACES_KEY || "",
    secret: process.env.DO_SPACES_SECRET || "",
    // e.g. "nyc3.digitaloceanspaces.com" — no protocol, no bucket prefix.
    endpoint: process.env.DO_SPACES_ENDPOINT || "",
    region: process.env.DO_SPACES_REGION || "",
    bucket: process.env.DO_SPACES_BUCKET || "",
    // Optional CDN endpoint for faster public delivery; falls back to the
    // bucket's direct Spaces URL when unset.
    cdnEndpoint: process.env.DO_SPACES_CDN_ENDPOINT || "",
    // All uploads live under this root prefix within the shared bucket, so
    // this project's files stay namespaced from other apps using the bucket.
    rootFolder: "bongoocean",
  },
};
