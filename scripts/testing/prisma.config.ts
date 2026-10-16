import { defineConfig } from "prisma/config";

if (process.env.DATABASE_URL !== "postgresql://kf_test:kf_test_local_only@127.0.0.1:55439/kanzleiflow_test") {
  throw new Error("Only the isolated local test database is allowed.");
}
export default defineConfig({
  schema: "../../prisma/schema.prisma",
  datasource: { url: process.env.DATABASE_URL },
});
