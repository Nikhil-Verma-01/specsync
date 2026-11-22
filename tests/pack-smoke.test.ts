import { describe, it, expect } from "vitest";
import { runPackSmokeTest } from "../scripts/smoke-pack.js";

describe("Packed Distribution Smoke Test", () => {
  it("packs, installs in temporary project, and verifies CLI and API", async () => {
    // Timeout set to 60s for npm pack and npm install
    await expect(runPackSmokeTest()).resolves.toBeUndefined();
  }, 60000);
});
