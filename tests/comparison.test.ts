import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { compareRoutes } from "../src/comparison/compare-routes.js";
import { extractExpressRoutes } from "../src/extractors/express-routes.js";
import { parseOpenApiSpec } from "../src/openapi/parse-spec.js";
import type {
  OpenApiInventory,
  OpenApiOperation,
  RouteInventory,
  SourceRoute,
} from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENARIOS = path.join(__dirname, "fixtures", "scenarios");

// ─── Helpers for Synthetic Unit Testing ────────────────────────────────────

function makeSourceRoute(
  method: SourceRoute["method"],
  normalizedPath: string,
  supported: boolean = true
): SourceRoute {
  return {
    method,
    rawPath: normalizedPath,
    normalizedPath,
    location: { file: "src/routes/app.ts", line: 10, column: 1 },
    confidence: "static",
    supported,
    framework: "express",
  };
}

function makeSpecOp(
  method: OpenApiOperation["method"],
  normalizedPath: string
): OpenApiOperation {
  return {
    method,
    rawPath: normalizedPath,
    normalizedPath,
    operationId: `${method.toLowerCase()}_${normalizedPath.replace(/\W/g, "_")}`,
    sourceFile: "openapi.yaml",
  };
}

function makeSourceInventory(
  routes: SourceRoute[],
  hasLimitations: boolean = false
): RouteInventory {
  return {
    routes,
    limitations: hasLimitations
      ? [
          {
            type: "DYNAMIC_ROUTE",
            file: "src/routes/app.ts",
            message: "Dynamic route pattern",
          },
        ]
      : [],
    filesScanned: 1,
  };
}

function makeSpecInventory(operations: OpenApiOperation[]): OpenApiInventory {
  return {
    operations,
    specFile: "openapi.yaml",
    version: "3.0.3",
  };
}

// ─── Unit Tests: compareRoutes with In-Memory Inventories ───────────────────

describe("compareRoutes — unit tests", () => {
  it("returns empty discrepancies when routes match exactly", () => {
    const sourceInv = makeSourceInventory([
      makeSourceRoute("GET", "/users"),
      makeSourceRoute("POST", "/users"),
    ]);
    const specInv = makeSpecInventory([
      makeSpecOp("GET", "/users"),
      makeSpecOp("POST", "/users"),
    ]);

    const result = compareRoutes(sourceInv, specInv);

    expect(result.discrepancies).toHaveLength(0);
    expect(result.summary.mismatches).toBe(0);
    expect(result.summary.hasErrors).toBe(false);
    expect(result.summary.exitCode).toBe(0);
  });

  it("detects UNDOCUMENTED_ROUTE when route is in source but missing from spec", () => {
    const sourceInv = makeSourceInventory([
      makeSourceRoute("GET", "/users"),
      makeSourceRoute("DELETE", "/users/{id}"),
    ]);
    const specInv = makeSpecInventory([makeSpecOp("GET", "/users")]);

    const result = compareRoutes(sourceInv, specInv);

    expect(result.discrepancies).toHaveLength(1);
    const d = result.discrepancies[0];
    expect(d.type).toBe("UNDOCUMENTED_ROUTE");
    expect(d.severity).toBe("error");
    expect(d.method).toBe("DELETE");
    expect(d.path).toBe("/users/{id}");
    expect(d.sourceLocation?.file).toBe("src/routes/app.ts");
    expect(result.summary.undocumentedCount).toBe(1);
    expect(result.summary.hasErrors).toBe(true);
    expect(result.summary.exitCode).toBe(1);
  });

  it("detects STALE_SPEC_PATH when operation is in spec but absent from source", () => {
    const sourceInv = makeSourceInventory([makeSourceRoute("GET", "/users")]);
    const specInv = makeSpecInventory([
      makeSpecOp("GET", "/users"),
      makeSpecOp("GET", "/legacy-reports"),
    ]);

    const result = compareRoutes(sourceInv, specInv);

    expect(result.discrepancies).toHaveLength(1);
    const d = result.discrepancies[0];
    expect(d.type).toBe("STALE_SPEC_PATH");
    expect(d.severity).toBe("error");
    expect(d.method).toBe("GET");
    expect(d.path).toBe("/legacy-reports");
    expect(d.specLocation?.file).toBe("openapi.yaml");
    expect(result.summary.staleCount).toBe(1);
    expect(result.summary.hasErrors).toBe(true);
    expect(result.summary.exitCode).toBe(1);
  });

  it("detects METHOD_MISMATCH when path exists in both but code has an undocumented method", () => {
    const sourceInv = makeSourceInventory([
      makeSourceRoute("GET", "/users"),
      makeSourceRoute("DELETE", "/users"),
    ]);
    const specInv = makeSpecInventory([makeSpecOp("GET", "/users")]);

    const result = compareRoutes(sourceInv, specInv);

    expect(result.discrepancies).toHaveLength(1);
    const d = result.discrepancies[0];
    expect(d.type).toBe("METHOD_MISMATCH");
    expect(d.severity).toBe("error");
    expect(d.method).toBe("DELETE");
    expect(d.path).toBe("/users");
    expect(d.message).toContain("OpenAPI only declares: [GET]");
    expect(result.summary.methodMismatchCount).toBe(1);
    expect(result.summary.hasErrors).toBe(true);
    expect(result.summary.exitCode).toBe(1);
  });

  it("detects METHOD_MISMATCH symmetrically when OpenAPI declares an unimplemented method on an existing path", () => {
    const sourceInv = makeSourceInventory([makeSourceRoute("GET", "/users")]);
    const specInv = makeSpecInventory([
      makeSpecOp("GET", "/users"),
      makeSpecOp("DELETE", "/users"),
    ]);

    const result = compareRoutes(sourceInv, specInv);

    expect(result.discrepancies).toHaveLength(1);
    const d = result.discrepancies[0];
    expect(d.type).toBe("METHOD_MISMATCH");
    expect(d.severity).toBe("error");
    expect(d.method).toBe("DELETE");
    expect(d.path).toBe("/users");
    expect(d.message).toContain("code only implements: [GET]");
    expect(result.summary.methodMismatchCount).toBe(1);
    expect(result.summary.hasErrors).toBe(true);
    expect(result.summary.exitCode).toBe(1);
  });

  it("reports both methods when path exists in both but methods are completely disjoint", () => {
    const sourceInv = makeSourceInventory([makeSourceRoute("POST", "/orders")]);
    const specInv = makeSpecInventory([makeSpecOp("GET", "/orders")]);

    const result = compareRoutes(sourceInv, specInv);

    // One discrepancy for code's POST not in spec, one for spec's GET not in code
    expect(result.discrepancies).toHaveLength(2);
    expect(result.discrepancies[0].type).toBe("METHOD_MISMATCH");
    expect(result.discrepancies[1].type).toBe("METHOD_MISMATCH");
    expect(result.summary.methodMismatchCount).toBe(2);
    expect(result.summary.hasErrors).toBe(true);
    expect(result.summary.exitCode).toBe(1);
  });

  it("downgrades STALE_SPEC_PATH to warning and appends caveat when source has limitations", () => {
    const sourceInv = makeSourceInventory(
      [makeSourceRoute("GET", "/users")],
      /* hasLimitations */ true
    );
    const specInv = makeSpecInventory([
      makeSpecOp("GET", "/users"),
      makeSpecOp("GET", "/unknown"),
    ]);

    const result = compareRoutes(sourceInv, specInv);

    expect(result.discrepancies).toHaveLength(1);
    const d = result.discrepancies[0];
    expect(d.type).toBe("STALE_SPEC_PATH");
    expect(d.severity).toBe("warning");
    expect(d.message).toContain("Note: dynamic routes or limitations were detected in source");
    // Under default failOn="error", warnings do NOT cause error exitCode
    expect(result.summary.hasErrors).toBe(false);
    expect(result.summary.exitCode).toBe(0);
  });

  it("downgrades spec-side METHOD_MISMATCH to warning when source has limitations", () => {
    const sourceInv = makeSourceInventory(
      [makeSourceRoute("GET", "/users")],
      /* hasLimitations */ true
    );
    const specInv = makeSpecInventory([
      makeSpecOp("GET", "/users"),
      makeSpecOp("DELETE", "/users"),
    ]);

    const result = compareRoutes(sourceInv, specInv);

    expect(result.discrepancies).toHaveLength(1);
    const d = result.discrepancies[0];
    expect(d.type).toBe("METHOD_MISMATCH");
    expect(d.severity).toBe("warning");
    expect(d.message).toContain("Note: dynamic routes or limitations were detected in source");
    expect(result.summary.hasErrors).toBe(false);
    expect(result.summary.exitCode).toBe(0);
  });

  it("handles empty source inventory gracefully", () => {
    const sourceInv = makeSourceInventory([]);
    const specInv = makeSpecInventory([
      makeSpecOp("GET", "/users"),
      makeSpecOp("POST", "/users"),
    ]);

    const result = compareRoutes(sourceInv, specInv);

    expect(result.discrepancies).toHaveLength(2);
    expect(result.summary.staleCount).toBe(2);
    expect(result.summary.routesAnalyzed).toBe(0);
    expect(result.summary.openApiOperations).toBe(2);
    expect(result.summary.exitCode).toBe(1);
  });

  it("handles empty spec inventory gracefully", () => {
    const sourceInv = makeSourceInventory([
      makeSourceRoute("GET", "/users"),
      makeSourceRoute("POST", "/users"),
    ]);
    const specInv = makeSpecInventory([]);

    const result = compareRoutes(sourceInv, specInv);

    expect(result.discrepancies).toHaveLength(2);
    expect(result.summary.undocumentedCount).toBe(2);
    expect(result.summary.routesAnalyzed).toBe(2);
    expect(result.summary.openApiOperations).toBe(0);
    expect(result.summary.exitCode).toBe(1);
  });

  it("handles both inventories empty cleanly", () => {
    const sourceInv = makeSourceInventory([]);
    const specInv = makeSpecInventory([]);

    const result = compareRoutes(sourceInv, specInv);

    expect(result.discrepancies).toHaveLength(0);
    expect(result.summary.hasErrors).toBe(false);
    expect(result.summary.exitCode).toBe(0);
  });

  it("ignores unsupported source routes during comparison", () => {
    const sourceInv = makeSourceInventory([
      makeSourceRoute("GET", "/users", /* supported */ true),
      makeSourceRoute("GET", "/regex-route", /* supported */ false),
    ]);
    const specInv = makeSpecInventory([makeSpecOp("GET", "/users")]);

    const result = compareRoutes(sourceInv, specInv);

    // /regex-route is marked supported: false, so it must not be reported as UNDOCUMENTED_ROUTE
    expect(result.discrepancies).toHaveLength(0);
  });

  it("respects failOn='warning' by setting exitCode=1 on warnings", () => {
    const sourceInv = makeSourceInventory(
      [makeSourceRoute("GET", "/users")],
      /* hasLimitations */ true
    );
    const specInv = makeSpecInventory([
      makeSpecOp("GET", "/users"),
      makeSpecOp("GET", "/unknown"),
    ]);

    const result = compareRoutes(sourceInv, specInv, { failOn: "warning" });

    expect(result.summary.hasErrors).toBe(true);
    expect(result.summary.exitCode).toBe(1);
  });

  it("respects failOn='never' by setting exitCode=0 even on errors", () => {
    const sourceInv = makeSourceInventory([makeSourceRoute("DELETE", "/users")]);
    const specInv = makeSpecInventory([]);

    const result = compareRoutes(sourceInv, specInv, { failOn: "never" });

    expect(result.discrepancies).toHaveLength(1);
    expect(result.summary.hasErrors).toBe(false);
    expect(result.summary.exitCode).toBe(0);
  });

  it("guarantees 100% deterministic sort order by path and method", () => {
    const sourceInv = makeSourceInventory([
      makeSourceRoute("POST", "/b-route"),
      makeSourceRoute("GET", "/a-route"),
      makeSourceRoute("PUT", "/a-route"),
    ]);
    const specInv = makeSpecInventory([]);

    const result = compareRoutes(sourceInv, specInv);

    const keys = result.discrepancies.map((d) => `${d.method} ${d.path}`);
    expect(keys).toEqual([
      "GET /a-route",
      "PUT /a-route",
      "POST /b-route",
    ]);
  });
});

// ─── Integration Tests: Real Curated Scenario Fixtures ──────────────────────

describe("compareRoutes — scenario fixtures", () => {
  it("scenario: all-match produces 0 discrepancies and exitCode 0", async () => {
    const appFile = path.join(SCENARIOS, "all-match", "app.ts");
    const specFile = path.join(SCENARIOS, "all-match", "openapi.yaml");

    const sourceInv = await extractExpressRoutes([appFile]);
    const specInv = await parseOpenApiSpec(specFile);

    const result = compareRoutes(sourceInv, specInv);

    expect(result.discrepancies).toHaveLength(0);
    expect(result.summary.mismatches).toBe(0);
    expect(result.summary.hasErrors).toBe(false);
    expect(result.summary.exitCode).toBe(0);
  });

  it("scenario: undocumented-route flags DELETE /users/{id}", async () => {
    const appFile = path.join(SCENARIOS, "undocumented-route", "app.ts");
    const specFile = path.join(SCENARIOS, "undocumented-route", "openapi.yaml");

    const sourceInv = await extractExpressRoutes([appFile]);
    const specInv = await parseOpenApiSpec(specFile);

    const result = compareRoutes(sourceInv, specInv);

    expect(result.discrepancies).toHaveLength(1);
    const d = result.discrepancies[0];
    expect(d.type).toBe("UNDOCUMENTED_ROUTE");
    expect(d.method).toBe("DELETE");
    expect(d.path).toBe("/users/{id}");
    expect(d.sourceLocation?.file).toContain("app.ts");
    expect(result.summary.exitCode).toBe(1);
  });

  it("scenario: stale-spec-path flags GET /legacy-reports", async () => {
    const appFile = path.join(SCENARIOS, "stale-spec-path", "app.ts");
    const specFile = path.join(SCENARIOS, "stale-spec-path", "openapi.yaml");

    const sourceInv = await extractExpressRoutes([appFile]);
    const specInv = await parseOpenApiSpec(specFile);

    const result = compareRoutes(sourceInv, specInv);

    expect(result.discrepancies).toHaveLength(1);
    const d = result.discrepancies[0];
    expect(d.type).toBe("STALE_SPEC_PATH");
    expect(d.method).toBe("GET");
    expect(d.path).toBe("/legacy-reports");
    expect(d.severity).toBe("error");
    expect(result.summary.exitCode).toBe(1);
  });

  it("scenario: method-mismatch flags method discrepancies on /orders", async () => {
    const appFile = path.join(SCENARIOS, "method-mismatch", "app.ts");
    const specFile = path.join(SCENARIOS, "method-mismatch", "openapi.yaml");

    const sourceInv = await extractExpressRoutes([appFile]);
    const specInv = await parseOpenApiSpec(specFile);

    const result = compareRoutes(sourceInv, specInv);

    expect(result.discrepancies.length).toBeGreaterThanOrEqual(1);
    for (const d of result.discrepancies) {
      expect(d.type).toBe("METHOD_MISMATCH");
      expect(d.path).toBe("/orders");
    }
    expect(result.summary.exitCode).toBe(1);
  });

  it("scenario: dynamic-routes-warning preserves limitation and downgrades stale severity", async () => {
    const appFile = path.join(SCENARIOS, "dynamic-routes-warning", "app.ts");
    const specFile = path.join(SCENARIOS, "dynamic-routes-warning", "openapi.yaml");

    const sourceInv = await extractExpressRoutes([appFile]);
    const specInv = await parseOpenApiSpec(specFile);

    expect(sourceInv.limitations.length).toBeGreaterThan(0);
    expect(sourceInv.limitations[0].type).toBe("DYNAMIC_ROUTE");

    const result = compareRoutes(sourceInv, specInv);

    const staleDiscrepancy = result.discrepancies.find((d) => d.path === "/unknown-path");
    expect(staleDiscrepancy).toBeDefined();
    expect(staleDiscrepancy?.severity).toBe("warning");
    expect(staleDiscrepancy?.message).toContain("Note: dynamic routes or limitations were detected");
    // Under failOn="error", warnings do NOT fail the run
    expect(result.summary.hasErrors).toBe(false);
    expect(result.summary.exitCode).toBe(0);
  });
});
