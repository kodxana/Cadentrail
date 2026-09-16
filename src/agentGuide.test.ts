import { describe, it, expect } from "vitest";
import { agentTasks, agentTaskBrief, newAgentGuide } from "./agentGuide";
import type { Project } from "./model";
const project = {
  id: "a".repeat(32),
  name: "My song",
  generation: {
    role: "instrumental",
    lyrics: "Private lyrics",
    style: "Private style",
  },
} as Project;
describe("Bring your own agent", () => {
  it("offers arrangement rather than lyric writing for instrumentals", () => {
    expect(agentTasks(true).map((x) => x.id)).not.toContain("lyrics");
    expect(agentTasks(true)[0].id).toBe("arrange");
    expect(agentTasks(false)[0].id).toBe("lyrics");
  });
  it("copies only project reference and chosen direction", () => {
    const state = {
      ...newAgentGuide(),
      request: "Use Japanese for the draft.",
    };
    const brief = agentTaskBrief(
      "https://music.example.org/?token=secret#track",
      state,
      project,
    );
    expect(brief).toContain(project.id);
    expect(brief).toContain("My song");
    expect(brief).toContain(state.request);
    for (const hidden of [
      "Private lyrics",
      "Private style",
      "?token",
      "secret#",
    ])
      expect(brief).not.toContain(hidden);
    expect(brief).toContain("instrumental arrangement");
  });
  it("can omit the current project completely", () => {
    const brief = agentTaskBrief(
      "http://localhost:8000",
      { ...newAgentGuide(), useProject: false },
      project,
    );
    expect(brief).not.toContain(project.id);
    expect(brief).not.toContain(project.name);
    expect(brief).toContain("No project selected");
  });
  it("opens recovery only for its explicit deep link", () => {
    expect(newAgentGuide("?agents=reconnect").page).toBe("reconnect");
    expect(newAgentGuide("?agents=anything").page).toBe("start");
  });
});
