import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  findOpenApiSpec,
  loadConfig,
  DEFAULT_CONFIG_FILENAMES,
  DEFAULT_SPEC_FILENAMES,
} from "../src/config/load-config.js";

describe("loadConfig & findOpenApiSpec", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specsync-config-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("exports default filenames lists", () => {
    expect(DEFAULT_CONFIG_FILENAMES).toContain("specsync.json");
    expect(DEFAULT_CONFIG_FILENAMES).toContain(".specsyncrc.json");
    expect(DEFAULT_SPEC_FILENAMES).toContain("openapi.yaml");
    expect(DEFAULT_SPEC_FILENAMES).toContain("openapi.json");
  });

  it("returns default values when no config file exists", async () => {
    const config = await loadConfig(tempDir);

    expect(config.source).toEqual([]);
    expect(config.exclude).toEqual([]);
    expect(config.basePath).toBeUndefined();
    expect(config.failOn).toBe("error");
    expect(config.openapi).toBe("openapi.yaml");
  });

  it("auto-discovers openapi.yaml in cwd if present", async () => {
    const specFile = path.join(tempDir, "openapi.yaml");
    await fs.writeFile(specFile, "openapi: 3.0.0\ninfo:\n  title: Test\n  version: 1.0\npaths: {}");

    const found = await findOpenApiSpec(tempDir);
    expect(found).toBe(specFile);

    const config = await loadConfig(tempDir);
    expect(config.openapi).toBe(specFile);
  });

  it("auto-discovers openapi.json in cwd if yaml is absent", async () => {
    const specFile = path.join(tempDir, "openapi.json");
    await fs.writeFile(specFile, JSON.stringify({ openapi: "3.1.0", info: { title: "Test", version: "1.0" }, paths: {} }));

    const found = await findOpenApiSpec(tempDir);
    expect(found).toBe(specFile);

    const config = await loadConfig(tempDir);
    expect(config.openapi).toBe(specFile);
  });

  it("auto-discovers specsync.json in cwd", async () => {
    const configFile = path.join(tempDir, "specsync.json");
    await fs.writeFile(
      configFile,
      JSON.stringify({
        source: ["src/routes/**/*.ts"],
        openapi: "./custom-spec.yaml",
        basePath: "/api/v1",
        failOn: "warning",
        exclude: ["src/legacy/**"],
      })
    );

    const config = await loadConfig(tempDir);

    expect(config.source).toEqual(["src/routes/**/*.ts"]);
    expect(config.openapi).toBe(path.resolve(tempDir, "./custom-spec.yaml"));
    expect(config.basePath).toBe("/api/v1");
    expect(config.failOn).toBe("warning");
    expect(config.exclude).toEqual(["src/legacy/**"]);
  });

  it("auto-discovers .specsyncrc.json in cwd", async () => {
    const configFile = path.join(tempDir, ".specsyncrc.json");
    await fs.writeFile(
      configFile,
      JSON.stringify({
        source: ["server/**/*.js"],
        openapi: "api.json",
      })
    );

    const config = await loadConfig(tempDir);

    expect(config.source).toEqual(["server/**/*.js"]);
    expect(config.openapi).toBe(path.resolve(tempDir, "api.json"));
  });

  it("loads config from explicit path", async () => {
    const customConfig = path.join(tempDir, "configs", "my-specsync.json");
    await fs.mkdir(path.dirname(customConfig), { recursive: true });
    await fs.writeFile(
      customConfig,
      JSON.stringify({
        source: ["app/**/*.ts"],
        failOn: "never",
      })
    );

    const config = await loadConfig(tempDir, customConfig);

    expect(config.source).toEqual(["app/**/*.ts"]);
    expect(config.failOn).toBe("never");
  });

  it("throws descriptive error when explicit config path does not exist", async () => {
    await expect(
      loadConfig(tempDir, "nonexistent-config.json")
    ).rejects.toThrow(/Failed to load config file/);
  });

  it("throws descriptive error on malformed JSON config file", async () => {
    const badConfig = path.join(tempDir, "specsync.json");
    await fs.writeFile(badConfig, "{ unclosed json");

    await expect(loadConfig(tempDir, badConfig)).rejects.toThrow(/Failed to parse config file/);
  });

  it("applies CLI overrides over config file values", async () => {
    const configFile = path.join(tempDir, "specsync.json");
    await fs.writeFile(
      configFile,
      JSON.stringify({
        source: ["src/**/*.ts"],
        openapi: "spec.yaml",
        basePath: "/v1",
        failOn: "error",
      })
    );

    const config = await loadConfig(tempDir, undefined, {
      openapi: "override-spec.json",
      source: ["custom/**/*.ts"],
      basePath: "/v2",
      failOn: "warning",
      exclude: ["custom/ignore/**"],
    });

    expect(config.openapi).toBe(path.resolve(tempDir, "override-spec.json"));
    expect(config.source).toEqual(["custom/**/*.ts"]);
    expect(config.basePath).toBe("/v2");
    expect(config.failOn).toBe("warning");
    expect(config.exclude).toEqual(["custom/ignore/**"]);
  });
});
