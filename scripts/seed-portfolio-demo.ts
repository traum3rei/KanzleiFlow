import "dotenv/config";
import { getPrismaClient, getRawPgPool } from "../src/lib/db";
import { provisionPortfolioDemo } from "../src/lib/services/portfolio-demo";

async function main() {
if (process.env.CONFIRM_SYNTHETIC_DEMO_SETUP !== "true") throw new Error("Explizites CONFIRM_SYNTHETIC_DEMO_SETUP=true erforderlich. Nur gegen eine dafür freigegebene Demo-Datenbank ausführen.");
const prisma = getPrismaClient();
if (!prisma) throw new Error("Demo-Datenbank nicht konfiguriert.");
try {
  await provisionPortfolioDemo(prisma);
  console.log("Synthetische Demo-Organisation eingerichtet oder unverändert bestätigt. Keine fremden Datensätze verändert.");
} finally {
  await prisma.$disconnect();
  await getRawPgPool()?.end();
}

}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Demo-Setup fehlgeschlagen."); process.exitCode = 1; });
