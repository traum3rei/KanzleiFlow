import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { DEMO_NOTARIAT_CONTEXT } from "@/lib/auth/tenant";
import { createCase, getCaseById } from "@/lib/services/case-service";
import { DELETE } from "./[id]/route";
import { deleteCaseAction } from "@/app/actions/cases";

describe("Case Deletion API & Server Action", () => {
  it("deletes a case via DELETE /api/cases/[id] endpoint", async () => {
    const uniqueNumber = `2026-UR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const newCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: uniqueNumber,
      title: "API-Löschtest Akte",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    const request = new NextRequest(`http://localhost:3000/api/cases/${newCase.id}`, {
      method: "DELETE",
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: newCase.id }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);

    const verified = await getCaseById(DEMO_NOTARIAT_CONTEXT, newCase.id);
    expect(verified).toBeNull();
  });

  it("returns 404 when deleting a non-existent case via API", async () => {
    const request = new NextRequest("http://localhost:3000/api/cases/non-existent-case-12345", {
      method: "DELETE",
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "non-existent-case-12345" }),
    });

    expect(response.status).toBe(404);
  });

  it("deletes a case via deleteCaseAction server action", async () => {
    const uniqueNumber = `2026-UR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const newCase = await createCase(DEMO_NOTARIAT_CONTEXT, {
      caseNumber: uniqueNumber,
      title: "Server-Action Löschtest Akte",
      matterType: "REAL_ESTATE",
      status: "DRAFT",
      parties: [],
    });

    const result = await deleteCaseAction(newCase.id);
    expect(result.success).toBe(true);
    expect(result.message).toContain("erfolgreich gelöscht");

    const verified = await getCaseById(DEMO_NOTARIAT_CONTEXT, newCase.id);
    expect(verified).toBeNull();
  });
});
