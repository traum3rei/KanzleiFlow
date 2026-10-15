/**
 * ============================================================================
 * KanzleiFlow Admin & First-Tenant Provisioning CLI
 * ============================================================================
 * 
 * Usage:
 *   npx tsx scripts/provision-admin.ts [options]
 * 
 * Options:
 *   --email <email>         Admin user email (required)
 *   --name <fullName>       Admin full name (default: "Notar Admin")
 *   --password <password>   Initial password for Supabase Auth (optional)
 *   --org-name <orgName>    Organization legal name (default: "Notariat am Karlsplatz")
 *   --org-slug <slug>       Organization slug (default: derived from org-name)
 *   --role <role>           Member role: ADMIN, NOTARY, CLERK (default: ADMIN)
 *   --jurisdiction <code    State/Federal jurisdiction (default: DE-BY)
 * 
 * Examples:
 *   npx tsx scripts/provision-admin.ts --email admin@kanzlei.de --name "Dr. Maximilian Weber"
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--") && i + 1 < args.length) {
      const key = arg.slice(2);
      options[key] = args[i + 1];
      i++;
    }
  }

  return options;
}

async function main() {
  const args = parseArgs();

  const email = args["email"] || process.env.ADMIN_INITIAL_EMAIL;
  if (!email) {
    console.error("Error: --email is required.");
    console.error("Example: npx tsx scripts/provision-admin.ts --email admin@notariat.de --name 'Dr. Justus'");
    process.exit(1);
  }

  const fullName = args["name"] || process.env.ADMIN_INITIAL_NAME || "Notariat Administrator";
  const password = args["password"] || process.env.ADMIN_INITIAL_PASSWORD;
  const orgName = args["org-name"] || "Notariat am Karlsplatz";
  const orgSlug =
    args["org-slug"] ||
    orgName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  const role = (args["role"] || "ADMIN") as "ADMIN" | "NOTARY" | "CLERK";
  const jurisdiction = args["jurisdiction"] || "DE-BY";

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Error: DATABASE_URL environment variable is missing.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  console.log("=================================================");
  console.log("KanzleiFlow Secure Admin Provisioning");
  console.log("=================================================");
  console.log(`Target Organization: ${orgName} (${orgSlug})`);
  console.log(`Admin User:          ${fullName} <${email}>`);
  console.log(`Assigned Role:       ${role}`);
  console.log(`Jurisdiction:        ${jurisdiction}`);

  let supabaseUserId: string | null = null;

  // 1. Supabase Auth Provisioning (if admin keys present)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseServiceKey) {
    console.log("\nConnecting to Supabase Admin Auth API...");
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    try {
      if (password) {
        // Attempt to create user with password
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });

        if (createError) {
          if (createError.message.includes("already registered") || createError.message.includes("exists")) {
            console.log("  Notice: Supabase Auth user already exists. Fetching existing user ID...");
            const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
            const existing = listData?.users.find((u) => u.email === email);
            if (existing) supabaseUserId = existing.id;
          } else {
            console.warn(`  Warning: Could not create Supabase Auth user: ${createError.message}`);
          }
        } else if (newUser?.user) {
          supabaseUserId = newUser.user.id;
          console.log(`  Supabase Auth user created successfully (ID: ${supabaseUserId})`);
        }
      } else {
        // Find existing Supabase Auth user if password not specified
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const existing = listData?.users.find((u) => u.email === email);
        if (existing) {
          supabaseUserId = existing.id;
          console.log(`  Found existing Supabase Auth user ID: ${supabaseUserId}`);
        }
      }
    } catch (sbErr) {
      console.warn("  Warning: Supabase Auth communication error:", sbErr);
    }
  } else {
    console.log("\nNote: SUPABASE_SERVICE_ROLE_KEY not configured. Provisioning directly in PostgreSQL.");
  }

  // 2. Ensure Organization exists in PostgreSQL
  let org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: orgName,
        slug: orgSlug,
        jurisdiction,
      },
    });
    console.log(`Created Organization: ${org.name} (ID: ${org.id})`);
  } else {
    console.log(`Existing Organization found: ${org.name} (ID: ${org.id})`);
  }

  // 3. Ensure User exists in PostgreSQL
  let user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    const userId = supabaseUserId || crypto.randomUUID();
    user = await prisma.user.create({
      data: {
        id: userId,
        email,
        fullName,
      },
    });
    console.log(`Created User in database: ${user.fullName} (ID: ${user.id})`);
  } else {
    console.log(`Existing User found in database: ${user.fullName} (ID: ${user.id})`);
    if (supabaseUserId && user.id !== supabaseUserId) {
      console.log(`  Linking PostgreSQL user record to Supabase Auth UUID (${supabaseUserId})...`);
      // Update memberships reference
      await prisma.organizationMember.updateMany({
        where: { userId: user.id },
        data: { userId: supabaseUserId },
      });
      user = await prisma.user.update({
        where: { email },
        data: { id: supabaseUserId },
      });
    }
  }

  // 4. Ensure Organization Membership exists with Role
  const membership = await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: org.id,
        userId: user.id,
      },
    },
    create: {
      organizationId: org.id,
      userId: user.id,
      role,
    },
    update: {
      role,
    },
  });

  console.log(`Assigned Membership: Role ${membership.role} in Organization ${org.name}`);

  // 5. Record Audit Event
  await prisma.auditEvent.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      action: "ADMIN_PROVISIONED",
      entityType: "ORGANIZATION",
      entityId: org.id,
      metadata: {
        adminEmail: email,
        adminName: fullName,
        role,
        provisionedVia: "CLI",
        timestamp: new Date().toISOString(),
      },
    },
  });

  console.log("Audit log entry created.");
  console.log("=================================================");
  console.log("Provisioning complete. The user can now securely log in.");
  console.log("=================================================");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Provisioning failed:", err);
  process.exit(1);
});
