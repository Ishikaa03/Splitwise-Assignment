import { defineConfig } from "prisma/config";

// dotenv not needed in production — Railway injects DATABASE_URL directly into process.env
// For local dev, DATABASE_URL is in server/.env which Express loads via dotenv
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
