import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifySessionTokenEdge } from "./session-edge";
import { verifySessionToken } from "./session";

function signed(payload: unknown) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(body).digest("base64url")}`;
}
describe("session token input validation", () => {
  it("rejects truncated signatures without throwing", () => {
    expect(verifySessionToken("e30.invalid")).toBeNull();
    expect(verifySessionToken(`e30.${"ä".repeat(43)}`)).toBeNull();
  });
  it("rejects signed payloads without an expiry or identity", () => {
    expect(verifySessionToken(signed({}))).toBeNull();
    expect(verifySessionToken(signed({ expiresAt: Date.now() + 10000 }))).toBeNull();
  });
});

it("rejects malformed signed payloads in Edge middleware too", async () => {
  expect(await verifySessionTokenEdge(signed({}))).toBeNull();
  expect(await verifySessionTokenEdge("e30.invalid")).toBeNull();
});
