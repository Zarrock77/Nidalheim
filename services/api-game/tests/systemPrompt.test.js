import { SYSTEM_PROMPT } from "../src/systemPrompt.js";

describe("SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof SYSTEM_PROMPT).toBe("string");
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("identifies the NPC as a Nidalheim villager", () => {
    expect(SYSTEM_PROMPT).toMatch(/Nidalheim/);
  });

  it("enforces French replies", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("français");
  });
});
