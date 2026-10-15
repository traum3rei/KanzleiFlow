/**
 * KanzleiFlow SaaS Scalability & Reliability Benchmark Suite
 * Measures real latency, RPS, DB pool metrics, OCC, and Queue throughput across 2,000 tenants.
 */

import { getPrismaClient, getDatabasePoolMetrics } from "../src/lib/db";
import { getCases, getCaseStatusCounts, getDashboardStats } from "../src/lib/services/case-service";
import { saveConfiguration, ConfigurationConcurrencyError } from "../src/lib/configurator/configurator-service";
import { enqueueJob } from "../src/lib/queue/job-queue";
import { claimNextJob, markJobCompleted } from "../src/lib/queue/job-worker";
import { TenantContext } from "../src/lib/auth/tenant";

interface LatencyStats {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
  rps: number;
}

function calculatePercentiles(latencies: number[], totalDurationMs: number): LatencyStats {
  latencies.sort((a, b) => a - b);
  const count = latencies.length;
  const p50 = latencies[Math.floor(count * 0.50)] || 0;
  const p95 = latencies[Math.floor(count * 0.95)] || 0;
  const p99 = latencies[Math.floor(count * 0.99)] || 0;
  const min = latencies[0] || 0;
  const max = latencies[count - 1] || 0;
  const sum = latencies.reduce((a, b) => a + b, 0);
  const avg = count > 0 ? sum / count : 0;
  const rps = totalDurationMs > 0 ? (count / (totalDurationMs / 1000)) : 0;

  return { count, p50, p95, p99, min, max, avg, rps };
}

function createTenantContext(tenantIndex: number): TenantContext {
  const padded = String(tenantIndex).padStart(4, "0");
  return {
    organizationId: `org_notariat_${padded}`,
    organizationSlug: `notariat-${padded}`,
    organizationName: `Notariat_${padded}`,
    jurisdiction: "DE-BY",
    userId: `user_${padded}`,
    userName: `Notar ${padded}`,
    userRole: "NOTARY",
    userEmail: `notar_${padded}@kanzleiflow.de`,
  };
}

async function runBenchmark() {
  const prisma = getPrismaClient();
  if (!prisma) {
    console.error("Database connection unavailable");
    process.exit(1);
  }

  console.log("================================================================================");
  console.log("KANZLEIFLOW SAAS SCALABILITY BENCHMARK REPORT (2,000 TENANTS)");
  console.log("================================================================================\n");

  const initialPool = getDatabasePoolMetrics();
  console.log(`Initial DB Connection Pool: total=${initialPool.total}, idle=${initialPool.idle}, max=${initialPool.max}\n`);

  // ---------------------------------------------------------------------------
  // TEST 1: Bounded Case Listing & Search Across Random Tenants
  // ---------------------------------------------------------------------------
  console.log("--- SCENARIO 1: Case Listing & Search Across Random Tenants (100 Queries) ---");
  const listingLatencies: number[] = [];
  const startListing = Date.now();

  for (let i = 0; i < 100; i++) {
    const randomTenantNum = Math.floor(Math.random() * 2000) + 1;
    const tenant = createTenantContext(randomTenantNum);
    const qStart = performance.now();
    await getCases(tenant, { take: 20 });
    listingLatencies.push(performance.now() - qStart);
  }

  const listingStats = calculatePercentiles(listingLatencies, Date.now() - startListing);
  console.log(`Results: p50: ${listingStats.p50.toFixed(2)}ms | p95: ${listingStats.p95.toFixed(2)}ms | p99: ${listingStats.p99.toFixed(2)}ms | RPS: ${listingStats.rps.toFixed(1)} req/s`);

  // ---------------------------------------------------------------------------
  // TEST 2: Aggregated Status Counts (Index-Only GroupBy)
  // ---------------------------------------------------------------------------
  console.log("\n--- SCENARIO 2: Status Counts Aggregation (Index-Only Scan) (100 Queries) ---");
  const countLatencies: number[] = [];
  const startCounts = Date.now();

  for (let i = 0; i < 100; i++) {
    const randomTenantNum = Math.floor(Math.random() * 2000) + 1;
    const tenant = createTenantContext(randomTenantNum);
    const qStart = performance.now();
    await getCaseStatusCounts(tenant);
    countLatencies.push(performance.now() - qStart);
  }

  const countStats = calculatePercentiles(countLatencies, Date.now() - startCounts);
  console.log(`Results: p50: ${countStats.p50.toFixed(2)}ms | p95: ${countStats.p95.toFixed(2)}ms | p99: ${countStats.p99.toFixed(2)}ms | RPS: ${countStats.rps.toFixed(1)} req/s`);

  // ---------------------------------------------------------------------------
  // TEST 3: Dashboard Stats Aggregation
  // ---------------------------------------------------------------------------
  console.log("\n--- SCENARIO 3: Dashboard Stats Aggregation (Counts + Recent 5 Cases) (50 Queries) ---");
  const dashLatencies: number[] = [];
  const startDash = Date.now();

  for (let i = 0; i < 50; i++) {
    const randomTenantNum = Math.floor(Math.random() * 2000) + 1;
    const tenant = createTenantContext(randomTenantNum);
    const qStart = performance.now();
    await getDashboardStats(tenant);
    dashLatencies.push(performance.now() - qStart);
  }

  const dashStats = calculatePercentiles(dashLatencies, Date.now() - startDash);
  console.log(`Results: p50: ${dashStats.p50.toFixed(2)}ms | p95: ${dashStats.p95.toFixed(2)}ms | p99: ${dashStats.p99.toFixed(2)}ms | RPS: ${dashStats.rps.toFixed(1)} req/s`);

  // ---------------------------------------------------------------------------
  // TEST 4: Optimistic Concurrency Control (OCC) Autosave
  // ---------------------------------------------------------------------------
  console.log("\n--- SCENARIO 4: Optimistic Concurrency Control (Concurrent Autosave) ---");
  const testTenant = createTenantContext(1);
  const testCase = await prisma.case.findFirst({
    where: { organizationId: testTenant.organizationId },
  });

  if (testCase) {
    const templateVersion = await prisma.templateVersion.findFirst({ where: { version: "1.0.0" } });
    if (templateVersion) {
      const template = await prisma.documentTemplate.findUnique({ where: { id: templateVersion.templateId } });
      const testConfig = await prisma.documentConfiguration.create({
        data: {
          organizationId: testTenant.organizationId,
          caseId: testCase.id,
          templateId: template!.id,
          templateVersionId: templateVersion.id,
          title: "OCC Concurrency Test Config",
          status: "DRAFT",
          version: 1,
          formData: {},
          selectedClauseCodes: [],
        },
      });

      // User A and User B both hold version 1
      // User A saves first -> advances config to version 2
      await saveConfiguration(testTenant, testConfig.id, { title: "Saved by User A" }, 1, 1);
      console.log("User A successfully saved at version 1 -> advanced to version 2");

      // User B tries to save using stale version 1 -> must throw ConfigurationConcurrencyError
      let conflictDetected = false;
      try {
        await saveConfiguration(testTenant, testConfig.id, { title: "Stale save from User B" }, 1, 1);
      } catch (err) {
        if (err instanceof ConfigurationConcurrencyError) {
          conflictDetected = true;
          console.log(`User B stale write rejected with ConfigurationConcurrencyError (Current Version: ${err.currentVersion})`);
        }
      }

      console.log(`OCC Protection Result: ${conflictDetected ? "PASSED (No Lost Updates)" : "FAILED"}`);

      // Cleanup test config
      await prisma.selectedClause.deleteMany({ where: { configurationId: testConfig.id } });
      await prisma.documentConfiguration.delete({ where: { id: testConfig.id } });
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Background Queue Throughput & Worker Processing (SKIP LOCKED)
  // ---------------------------------------------------------------------------
  console.log("\n--- SCENARIO 5: Durable Job Queue Throughput (SKIP LOCKED) (50 Jobs) ---");
  const enqueueStart = Date.now();
  for (let i = 0; i < 50; i++) {
    const randomTenantNum = Math.floor(Math.random() * 2000) + 1;
    const tenant = createTenantContext(randomTenantNum);
    await enqueueJob(tenant, {
      jobType: "EXPORT_GENERATION",
      payload: { caseId: `case_${String(randomTenantNum).padStart(4, "0")}_1`, exportFormat: "JSON" },
      idempotencyKey: `bench_job_${Date.now()}_${i}`,
    });
  }
  const enqueueDuration = Date.now() - enqueueStart;
  console.log(`Enqueued 50 jobs in ${enqueueDuration}ms (${(50 / (enqueueDuration / 1000)).toFixed(1)} jobs/s)`);

  // Process 50 jobs simulating 4 concurrent workers
  const workerStart = Date.now();
  let processedCount = 0;
  const workers = [1, 2, 3, 4].map(async (wId) => {
    while (true) {
      const job = await claimNextJob(`worker_bench_${wId}`);
      if (!job) break;
      await markJobCompleted(job.id, { benchmarkSuccess: true });
      processedCount++;
    }
  });

  await Promise.all(workers);
  const workerDuration = Date.now() - workerStart;
  console.log(`Processed ${processedCount} jobs across 4 workers in ${workerDuration}ms (${(processedCount / (workerDuration / 1000)).toFixed(1)} jobs/s)`);

  const finalPool = getDatabasePoolMetrics();
  console.log(`\nFinal DB Connection Pool: total=${finalPool.total}, idle=${finalPool.idle}, waiting=${finalPool.waiting}, max=${finalPool.max}`);

  console.log("\n================================================================================");
  console.log("BENCHMARK COMPLETED SUCCESSFULLY");
  console.log("================================================================================");

  process.exit(0);
}

runBenchmark().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
