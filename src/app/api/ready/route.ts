import { NextResponse } from "next/server";
import { connection } from "next/server";
import { testDatabaseConnection, getDatabasePoolMetrics } from "@/lib/db";
import { getQueueMetrics } from "@/lib/queue/job-queue";

export async function GET() {
  try {
    await connection();
    const dbStatus = await testDatabaseConnection();
    const poolMetrics = getDatabasePoolMetrics();
    const queueMetrics = await getQueueMetrics();

    const isReady = dbStatus.connected;

    return NextResponse.json(
      {
        status: isReady ? "ready" : "not_ready",
        database: {
          connected: dbStatus.connected,
          message: dbStatus.message,
          pool: poolMetrics,
        },
        queue: queueMetrics,
        timestamp: new Date().toISOString(),
      },
      { status: isReady ? 200 : 503 }
    );
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      {
        status: "error",
        error: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
