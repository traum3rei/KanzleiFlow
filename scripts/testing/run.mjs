import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TEST_DATABASE_URL, assertTestDatabase } from './environment.mjs';

assertTestDatabase(TEST_DATABASE_URL);
const root = process.cwd();
await mkdir(path.join(root, '.test-data'), { recursive: true });
const directory = await mkdtemp(path.join(root, '.test-data/run-'));
const env = { ...process.env };
const mode = process.argv[2] || "unit";
// Prevent Next.js from loading any configured development or external service credentials.
for (const file of ['.env', '.env.local', '.env.development', '.env.development.local', '.env.production', '.env.production.local', '.env.test', '.env.test.local']) {
  const content = await readFile(file, 'utf8').catch(() => '');
  for (const line of content.split('\n')) {
    const key = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (key && !['HOME', 'PATH', 'TMPDIR', 'CODEX_HOME', 'NODE_ENV'].includes(key)) env[key] = '';
  }
}
Object.assign(env, {
  ENABLE_DEMO_LOGIN: "true",
  DATABASE_URL: TEST_DATABASE_URL, DIRECT_URL: TEST_DATABASE_URL,
  APP_ENV: 'development', VERCEL_ENV: 'development', REQUIRE_AUTH: 'false', ALLOW_DEMO_AUTH: 'true', KANZLEIFLOW_TEST_RUN: 'isolated',
  SESSION_SECRET: 'isolated-test-session-secret-not-for-production',
  LLM_PROVIDER: 'mock', RUN_LIVE_GEMINI: 'false',
  NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_JWT_SECRET: '',
  GEMINI_API_KEY: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '',
  STORAGE_ROOT: path.join(directory, 'storage'), DATABASE_POOL_MAX: '5',
});
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, 'postgres'), port: 55439,
  user: 'kf_test', password: 'kf_test_local_only', persistent: true,
  postgresFlags: ['-h', '127.0.0.1', '-k', directory, '-c', 'max_connections=100'],
  onLog: () => {}, onError: (message) => console.error(String(message)),
});
if (mode === "serve") Object.assign(env, { REQUIRE_AUTH: "true", ALLOW_DEMO_AUTH: "false" });
if (mode === "e2e-production") {
  Object.assign(env, { NODE_ENV: "production", APP_ENV: "production", REQUIRE_AUTH: "true", ALLOW_DEMO_AUTH: "false", KANZLEIFLOW_PRODUCTION_E2E: "true" });
}
let child;
process.once("SIGINT", () => child?.kill("SIGINT"));
process.once("SIGTERM", () => child?.kill("SIGTERM"));
const run = (args, capture = false) => new Promise((resolve, reject) => {
  child = spawn(process.execPath, args, { env, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
  let output = '';
  if (capture) child.stdout.on('data', (data) => { output += data; });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve(output) : reject(new Error(`Command exited ${code}: ${args[0]}`)));
});
let started = false;
try {
  await postgres.initialise();
  await postgres.start(); started = true;
  await postgres.createDatabase('kanzleiflow_test');
  const db = new Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();
  try {
    // Historical names sort incorrectly. Apply the existing additive files in dependency order.
    for (const migration of ['20261011_init_kanzleiflow', '20261011_add_workflow_fields', '20261015_add_case_exports', '20261015_complete_existing_schema']) {
      await db.query(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'));
    }
    const gap = await run(['node_modules/prisma/build/index.js', 'migrate', 'diff', '--config', 'scripts/testing/prisma.config.ts', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--script'], true);
    if (gap.split('\n').some((line) => line.trim() && !line.trim().startsWith('--'))) {
      await writeFile(path.join(root, '.test-data/schema-drift.sql'), gap);
      throw new Error('Migration/schema drift detected. Add a reviewed migration; automatic schema changes are refused.');
    }
    await db.query("CREATE TABLE test_environment_marker (purpose text NOT NULL); INSERT INTO test_environment_marker VALUES ('disposable-synthetic-tests-only')");
  } finally { await db.end(); }
  console.log('Isolated PostgreSQL ready at 127.0.0.1:55439 (synthetic data only).');
  await run(['--import', 'tsx', 'scripts/testing/seed.ts']);

  if (mode === 'schema') console.log('Test migrations match the current Prisma schema.');
  else if (mode === 'build') { await run(['node_modules/prisma/build/index.js', 'generate']); await run(['node_modules/next/dist/bin/next', 'build']); }
  else if (mode === 'serve') await run(['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3100']);
  else if (mode === 'e2e-production') {
    await run(['node_modules/prisma/build/index.js', 'generate']);
    await run(['node_modules/next/dist/bin/next', 'build']);
    await run(['node_modules/@playwright/test/cli.js', 'test', '--grep', 'public portfolio demo']);
  }
  else if (mode === 'e2e') await run(['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(3)]);
  else await run(['node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(3)]);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  child?.kill('SIGTERM');
  if (started) await postgres.stop();
  await rm(directory, { recursive: true, force: true });
  console.log('Disposable PostgreSQL stopped; test database and files removed.');
}

// embedded-postgres registers an async beforeExit hook that exits with zero.
// Cleanup has completed above; explicitly retain failures for CI and callers.
if (process.exitCode) process.exit(process.exitCode);
