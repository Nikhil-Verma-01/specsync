import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseOpenApiSpec } from "../src/openapi/parse-spec.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures", "openapi");

describe("parseOpenApiSpec", () => {
  // ── Happy paths ───────────────────────────────────────────────────────────

  it("parses a valid YAML OpenAPI 3.0 spec and extracts all operations", async () => {
    const inv = await parseOpenApiSpec(path.join(FIXTURES, "valid-basic.yaml"));

    expect(inv.version).toBe("3.0.3");
    expect(inv.specFile).toContain("valid-basic.yaml");
    expect(inv.operations).toHaveLength(7); // GET/POST /users, GET/PUT/DELETE /users/{id}, GET/POST /orders
    expect(inv.unresolvedRefs).toEqual([]);
  });

  it("parses a valid JSON OpenAPI 3.1 spec", async () => {
    const inv = await parseOpenApiSpec(path.join(FIXTURES, "valid-basic.json"));

    expect(inv.version).toBe("3.1.0");
    expect(inv.operations).toHaveLength(5); // GET/POST /products, GET/PATCH/DELETE /products/{productId}
    expect(inv.unresolvedRefs).toEqual([]);
  });

  it("extracts correct HTTP methods for each path", async () => {
    const inv = await parseOpenApiSpec(path.join(FIXTURES, "valid-basic.yaml"));

    const userOps = inv.operations.filter((op) => op.normalizedPath === "/users");
    const methods = userOps.map((op) => op.method).sort();
    expect(methods).toEqual(["GET", "POST"]);
  });

  it("normalises {id} paths into uniform form", async () => {
    const inv = await parseOpenApiSpec(path.join(FIXTURES, "params-and-nesting.yaml"));

    const paths = inv.operations.map((op) => op.normalizedPath);
    expect(paths).toContain("/users/{id}");
    expect(paths).toContain("/orgs/{orgId}/members/{memberId}");
  });

  it("captures operationId and summary when present", async () => {
    const inv = await parseOpenApiSpec(path.join(FIXTURES, "valid-basic.yaml"));

    const listUsers = inv.operations.find((op) => op.operationId === "listUsers");
    expect(listUsers).toBeDefined();
    expect(listUsers?.summary).toBe("List all users");
    expect(listUsers?.method).toBe("GET");
    expect(listUsers?.normalizedPath).toBe("/users");
  });

  it("ignores non-HTTP keys (parameters, summary, description) on path item", async () => {
    const inv = await parseOpenApiSpec(path.join(FIXTURES, "valid-basic.yaml"));

    // All operations should have valid HTTP methods
    const validMethods = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]);
    for (const op of inv.operations) {
      expect(validMethods.has(op.method)).toBe(true);
    }
  });

  it("returns empty operations array when paths: is an empty object", async () => {
    const inv = await parseOpenApiSpec(path.join(FIXTURES, "empty-paths.yaml"));

    expect(inv.operations).toHaveLength(0);
    expect(inv.unresolvedRefs).toHaveLength(0);
  });

  it("reports $ref path items in unresolvedRefs and skips them", async () => {
    const inv = await parseOpenApiSpec(path.join(FIXTURES, "with-unresolved-refs.yaml"));

    // /users uses $ref and should be skipped
    const userOps = inv.operations.filter((op) => op.normalizedPath === "/users");
    expect(userOps).toHaveLength(0);

    // The ref should be reported
    expect(inv.unresolvedRefs?.length).toBeGreaterThan(0);
    expect(inv.unresolvedRefs?.[0]).toContain("external-users.yaml");

    // /orders (inline operation) should still be parsed
    const orderOps = inv.operations.filter((op) => op.normalizedPath === "/orders");
    expect(orderOps).toHaveLength(1);
  });

  it("applies basePath prefix when provided", async () => {
    const inv = await parseOpenApiSpec(path.join(FIXTURES, "valid-basic.yaml"), "/api/v1");

    for (const op of inv.operations) {
      expect(op.normalizedPath.startsWith("/api/v1")).toBe(true);
    }
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("throws a readable error when the file does not exist", async () => {
    await expect(
      parseOpenApiSpec(path.join(FIXTURES, "does-not-exist.yaml"))
    ).rejects.toThrow(/Failed to read OpenAPI spec/);
  });

  it("throws a readable error when the YAML is malformed", async () => {
    // We'll write an invalid YAML string to a temp buffer by using a non-existent path
    // For now, test using a file whose content we know is invalid JSON masquerading as YAML
    // The YAML parser accepts most JSON, so we test a deeply broken input
    const badFile = path.join(FIXTURES, "_bad-yaml.yaml");
    const fs = await import("node:fs/promises");
    await fs.writeFile(badFile, "key: :\n  broken: [unclosed", "utf-8");

    await expect(parseOpenApiSpec(badFile)).rejects.toThrow(/Failed to parse OpenAPI/);
    await fs.unlink(badFile);
  });
});
