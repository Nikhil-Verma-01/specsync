import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  discoverSourceFiles,
  DEFAULT_SOURCE_PATTERNS,
  DEFAULT_EXCLUDE_PATTERNS,
} from "../src/discovery/source-files.js";

describe("discoverSourceFiles", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specsync-discovery-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("exports default source and exclude patterns", () => {
    expect(DEFAULT_SOURCE_PATTERNS.length).toBeGreaterThan(0);
    expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/node_modules/**");
    expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/dist/**");
    expect(DEFAULT_EXCLUDE_PATTERNS).toContain("**/*.test.{js,ts}");
  });

  it("discovers files in default directories (src, routes, app)", async () => {
    const file1 = path.join(tempDir, "src", "routes", "users.ts");
    const file2 = path.join(tempDir, "app", "orders.js");
    const file3 = path.join(tempDir, "server", "index.ts");

    await fs.mkdir(path.dirname(file1), { recursive: true });
    await fs.mkdir(path.dirname(file2), { recursive: true });
    await fs.mkdir(path.dirname(file3), { recursive: true });

    await fs.writeFile(file1, "console.log('users');");
    await fs.writeFile(file2, "console.log('orders');");
    await fs.writeFile(file3, "console.log('server');");

    const discovered = await discoverSourceFiles({ cwd: tempDir });

    expect(discovered).toContain(path.resolve(file1));
    expect(discovered).toContain(path.resolve(file2));
    expect(discovered).toContain(path.resolve(file3));
  });

  it("ignores files matching default exclude patterns", async () => {
    const validFile = path.join(tempDir, "src", "app.ts");
    const nodeModulesFile = path.join(tempDir, "node_modules", "express", "index.js");
    const distFile = path.join(tempDir, "dist", "app.js");
    const testFile = path.join(tempDir, "src", "app.test.ts");

    await fs.mkdir(path.dirname(validFile), { recursive: true });
    await fs.mkdir(path.dirname(nodeModulesFile), { recursive: true });
    await fs.mkdir(path.dirname(distFile), { recursive: true });

    await fs.writeFile(validFile, "export default {};");
    await fs.writeFile(nodeModulesFile, "module.exports = {};");
    await fs.writeFile(distFile, "console.log('bundle');");
    await fs.writeFile(testFile, "it('tests', () => {});");

    const discovered = await discoverSourceFiles({ cwd: tempDir });

    expect(discovered).toContain(path.resolve(validFile));
    expect(discovered).not.toContain(path.resolve(nodeModulesFile));
    expect(discovered).not.toContain(path.resolve(distFile));
    expect(discovered).not.toContain(path.resolve(testFile));
  });

  it("supports custom sourcePatterns", async () => {
    const customFile = path.join(tempDir, "controllers", "api.ts");
    const srcFile = path.join(tempDir, "src", "ignored.ts");

    await fs.mkdir(path.dirname(customFile), { recursive: true });
    await fs.mkdir(path.dirname(srcFile), { recursive: true });

    await fs.writeFile(customFile, "console.log('controller');");
    await fs.writeFile(srcFile, "console.log('src');");

    const discovered = await discoverSourceFiles({
      cwd: tempDir,
      sourcePatterns: ["controllers/**/*.ts"],
    });

    expect(discovered).toContain(path.resolve(customFile));
    expect(discovered).not.toContain(path.resolve(srcFile));
  });

  it("supports additional excludePatterns", async () => {
    const normalFile = path.join(tempDir, "src", "routes.ts");
    const generatedFile = path.join(tempDir, "src", "generated", "sdk.ts");

    await fs.mkdir(path.dirname(generatedFile), { recursive: true });

    await fs.writeFile(normalFile, "console.log('routes');");
    await fs.writeFile(generatedFile, "console.log('generated');");

    const discovered = await discoverSourceFiles({
      cwd: tempDir,
      excludePatterns: ["**/generated/**"],
    });

    expect(discovered).toContain(path.resolve(normalFile));
    expect(discovered).not.toContain(path.resolve(generatedFile));
  });

  it("normalizes Windows backslashes in pattern definitions", async () => {
    const apiFile = path.join(tempDir, "src", "api", "v1.ts");
    await fs.mkdir(path.dirname(apiFile), { recursive: true });
    await fs.writeFile(apiFile, "console.log('v1');");

    // Pass pattern containing backslashes
    const discovered = await discoverSourceFiles({
      cwd: tempDir,
      sourcePatterns: ["src\\api\\**\\*.ts"],
    });

    expect(discovered).toContain(path.resolve(apiFile));
  });

  it("falls back to root-level JS/TS files when no files match default directory patterns", async () => {
    const rootServer = path.join(tempDir, "server.js");
    await fs.writeFile(rootServer, "const app = require('express')();");

    const discovered = await discoverSourceFiles({ cwd: tempDir });

    expect(discovered).toContain(path.resolve(rootServer));
  });

  it("returns empty array when no files exist", async () => {
    const discovered = await discoverSourceFiles({ cwd: tempDir });
    expect(discovered).toEqual([]);
  });
});
