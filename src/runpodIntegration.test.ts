import { describe, it, expect } from "vitest";
import { runpodContext, runpodHandoff, runpodTasks } from "./runpodHandoff";
describe("Runpod agent handoff", () => {
  it("derives a suggested Pod only from the exact proxy hostname", () => {
    expect(
      runpodContext(
        "https://testpod12345678-8000.proxy.runpod.net/?integrations=runpod",
      ).podId,
    ).toBe("testpod12345678");
    for (const address of [
      "http://127.0.0.1:8000",
      "https://music.example.org",
      "https://testpod12345678-8000.proxy.runpod.net.evil.test",
      "https://testpod12345678-8001.proxy.runpod.net",
    ])
      expect(runpodContext(address).podId).toBeNull();
  });
  it("removes URL query, path and fragment from the copied connection", () => {
    const brief = runpodHandoff(
      "https://music.example.org/private?token=private-value#project-private",
      "Check readiness",
    );
    expect(brief).toContain("https://music.example.org/api/mcp");
    for (const value of ["/private", "private-value", "project-private"])
      expect(brief).not.toContain(value);
    expect(brief).toContain("Check readiness");
    expect(brief).toContain("Pod ID is unknown");
  });
  it("rejects credentials and non-http connection addresses", () => {
    for (const address of [
      "https://name:secret@example.org",
      "file:///tmp/app",
      "javascript:alert(1)",
    ])
      expect(() => runpodContext(address)).toThrow();
  });
  it("keeps user edits intact and includes the persistent identity", () => {
    const request = "Inspect only. 私の曲を変更しないで。";
    expect(runpodHandoff("http://localhost:8000", request)).toContain(request);
    expect(runpodTasks["Reconnect MCP"]).toContain("update only its URL");
    const id = "a".repeat(32);
    expect(runpodHandoff("https://music.example.org", request, id)).toContain(
      "Expected persistent workstation ID: " + id,
    );
    expect(
      runpodHandoff("https://music.example.org", request, "invalid-id"),
    ).not.toContain("Expected persistent workstation ID:");
  });
});
