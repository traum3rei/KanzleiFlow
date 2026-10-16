import { describe, it, expect } from "vitest";
import { testDatabaseConnection, isDatabaseConfigured } from "./db";


describe("Database Connection Health", () => {
  it("reports database configuration status", async () => {
    const configured = isDatabaseConfigured();
    console.log("Is database configured in environment?", configured);

    const result = await testDatabaseConnection();
    console.log("Database connection test result:", result);

    expect(result).toHaveProperty("connected");
    expect(result).toHaveProperty("message");
  });
});
