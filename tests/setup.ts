import { Client } from "pg";

const expected = "postgresql://kf_test:kf_test_local_only@127.0.0.1:55439/kanzleiflow_test";
if (process.env.DATABASE_URL !== expected || process.env.KANZLEIFLOW_TEST_RUN !== "isolated") {
  throw new Error("Tests require the isolated PostgreSQL runner. Use npm test; development/production URLs are refused.");
}
const client = new Client({ connectionString: expected });
await client.connect();
try {
  const result = await client.query("SELECT purpose FROM test_environment_marker");
  if (result.rows[0]?.purpose !== "disposable-synthetic-tests-only") throw new Error("Missing test database marker.");
} finally {
  await client.end();
}
