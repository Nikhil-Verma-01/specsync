import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { extractExpressRoutes } from "../src/extractors/express-routes.js";
import { parseOpenApiSpec } from "../src/openapi/parse-spec.js";
import { compareRoutes } from "../src/comparison/compare-routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EDGE_FIXTURES = path.join(__dirname, "fixtures", "edge-cases");

describe("Edge Cases: Multi-Tier Router Mounts", () => {
  it("resolves composed prefixes across 3 levels of nested routers", async () => {
    const fixtureDir = path.join(EDGE_FIXTURES, "multi-tier-routing");
    const files = [
      path.join(fixtureDir, "app.ts"),
      path.join(fixtureDir, "routes", "api.ts"),
      path.join(fixtureDir, "routes", "v1.ts"),
      path.join(fixtureDir, "routes", "users.ts"),
    ];

    const inventory = await extractExpressRoutes(files);
    expect(inventory.filesScanned).toBe(4);
    expect(inventory.limitations).toHaveLength(0);

    const routes = inventory.routes.map((r) => `${r.method} ${r.normalizedPath}`);
    expect(routes).toContain("GET /api/v1/users/{id}");
    expect(routes).toContain("DELETE /api/v1/users/{id}");
    expect(routes).toHaveLength(2);
  });

  it("matches multi-tier routes against OpenAPI specification without drift", async () => {
    const fixtureDir = path.join(EDGE_FIXTURES, "multi-tier-routing");
    const files = [
      path.join(fixtureDir, "app.ts"),
      path.join(fixtureDir, "routes", "api.ts"),
      path.join(fixtureDir, "routes", "v1.ts"),
      path.join(fixtureDir, "routes", "users.ts"),
    ];
    const specFile = path.join(fixtureDir, "openapi.yaml");

    const codeInv = await extractExpressRoutes(files);
    const specInv = await parseOpenApiSpec(specFile);
    const report = compareRoutes(codeInv, specInv);

    expect(report.summary.routesAnalyzed).toBe(2);
    expect(report.summary.openApiOperations).toBe(2);
    expect(report.summary.mismatches).toBe(0);
    expect(report.summary.undocumentedCount).toBe(0);
    expect(report.summary.staleCount).toBe(0);
    expect(report.discrepancies).toHaveLength(0);
  });
});

describe("Edge Cases: Middleware Chains", () => {
  it("extracts routes correctly when multiple middlewares precede handler or router", async () => {
    const fixtureDir = path.join(EDGE_FIXTURES, "middleware-chains");
    const file = path.join(fixtureDir, "app.ts");

    const inventory = await extractExpressRoutes([file]);
    expect(inventory.filesScanned).toBe(1);
    expect(inventory.limitations).toHaveLength(0);

    const routes = inventory.routes.map((r) => `${r.method} ${r.normalizedPath}`);
    expect(routes).toContain("GET /items");
    expect(routes).toContain("POST /api/create");
    expect(routes).toHaveLength(2);
  });
});

describe("Edge Cases: Server Base Path Auto-Detection", () => {
  const fixtureDir = path.join(EDGE_FIXTURES, "server-base-path");

  it("auto-detects server base path from OpenAPI 3.x servers[0].url", async () => {
    const specFile = path.join(fixtureDir, "openapi-servers.yaml");
    const specInv = await parseOpenApiSpec(specFile);

    const paths = specInv.operations.map((op) => `${op.method} ${op.normalizedPath}`);
    expect(paths).toContain("GET /api/v2/products");
    expect(paths).toContain("DELETE /api/v2/products/{id}");
    expect(paths).toHaveLength(2);
  });

  it("auto-detects base path from Swagger 2.0 basePath field", async () => {
    const specFile = path.join(fixtureDir, "openapi-swagger2.json");
    const specInv = await parseOpenApiSpec(specFile);

    const paths = specInv.operations.map((op) => `${op.method} ${op.normalizedPath}`);
    expect(paths).toContain("GET /api/v2/products");
    expect(paths).toContain("DELETE /api/v2/products/{id}");
    expect(paths).toHaveLength(2);
  });

  it("allows explicit basePath option to override server URL base path", async () => {
    const specFile = path.join(fixtureDir, "openapi-servers.yaml");
    const specInv = await parseOpenApiSpec(specFile, "/custom/v3");

    const paths = specInv.operations.map((op) => `${op.method} ${op.normalizedPath}`);
    expect(paths).toContain("GET /custom/v3/products");
    expect(paths).toContain("DELETE /custom/v3/products/{id}");
  });

  it("cleanly matches code routes when OpenAPI server base path is auto-detected", async () => {
    const specFile = path.join(fixtureDir, "openapi-servers.yaml");
    const appFile = path.join(fixtureDir, "app.ts");

    const codeInv = await extractExpressRoutes([appFile]);
    const specInv = await parseOpenApiSpec(specFile);
    const report = compareRoutes(codeInv, specInv);

    expect(report.summary.routesAnalyzed).toBe(2);
    expect(report.summary.openApiOperations).toBe(2);
    expect(report.summary.mismatches).toBe(0);
    expect(report.summary.undocumentedCount).toBe(0);
    expect(report.summary.staleCount).toBe(0);
    expect(report.discrepancies).toHaveLength(0);
  });
});

describe("Edge Cases: Named ESM and CJS Imports", () => {
  it("resolves named ESM imports and CJS destructured requires for routers", async () => {
    const fixtureDir = path.join(EDGE_FIXTURES, "named-imports");
    const files = [
      path.join(fixtureDir, "app.ts"),
      path.join(fixtureDir, "routes", "users.ts"),
      path.join(fixtureDir, "routes", "orders.js"),
    ];

    const inventory = await extractExpressRoutes(files);
    expect(inventory.filesScanned).toBe(3);
    expect(inventory.limitations).toHaveLength(0);

    const routes = inventory.routes.map((r) => `${r.method} ${r.normalizedPath}`);
    // ESM named import: usersRouter mounted at /users
    expect(routes).toContain("GET /users");
    expect(routes).toContain("GET /users/{id}");
    // CJS destructured require: ordersRouter mounted at /orders
    expect(routes).toContain("POST /orders");
    expect(routes).toContain("GET /orders/{orderId}");
    expect(routes).toHaveLength(4);
  });
});

describe("Edge Cases: Array Route Paths", () => {
  it("extracts all route variations when path argument is an array literal", async () => {
    const fixtureDir = path.join(EDGE_FIXTURES, "array-paths");
    const file = path.join(fixtureDir, "app.ts");

    const inventory = await extractExpressRoutes([file]);
    expect(inventory.filesScanned).toBe(1);
    expect(inventory.limitations).toHaveLength(0);

    const routes = inventory.routes.map((r) => `${r.method} ${r.normalizedPath}`);
    expect(routes).toContain("GET /users");
    expect(routes).toContain("GET /accounts");
    expect(routes).toContain("POST /v1/auth");
    expect(routes).toContain("POST /v2/auth");
    expect(routes).toContain("DELETE /admin/cache");
    expect(routes).toContain("DELETE /admin/temp");
    expect(routes).toHaveLength(6);
  });
});

describe("Edge Cases: Root Router Mounts", () => {
  it("resolves router mounted at root without path prefix (app.use(router))", async () => {
    const fixtureDir = path.join(EDGE_FIXTURES, "root-mount");
    const files = [
      path.join(fixtureDir, "app.ts"),
      path.join(fixtureDir, "health.ts"),
    ];

    const inventory = await extractExpressRoutes(files);
    expect(inventory.filesScanned).toBe(2);
    expect(inventory.limitations).toHaveLength(0);

    const routes = inventory.routes.map((r) => `${r.method} ${r.normalizedPath}`);
    expect(routes).toContain("GET /health");
    expect(routes).toContain("GET /live");
    expect(routes).toHaveLength(2);
  });
});

describe("Edge Cases: Server URL Variations", () => {
  it("handles relative server URLs with trailing slashes gracefully", async () => {
    const fixtureDir = path.join(EDGE_FIXTURES, "server-base-path");
    const specFile = path.join(fixtureDir, "openapi-relative-slash.yaml");

    const specInv = await parseOpenApiSpec(specFile);
    const paths = specInv.operations.map((op) => `${op.method} ${op.normalizedPath}`);
    expect(paths).toContain("GET /api/v3/status");
    expect(paths).toHaveLength(1);
  });
});

describe("Edge Cases: Intra-File Hierarchical Router Mounts", () => {
  it("resolves composed prefixes across nested routers defined within the same file", async () => {
    const fixtureDir = path.join(EDGE_FIXTURES, "intra-file-mounts");
    const file = path.join(fixtureDir, "app.ts");

    const inventory = await extractExpressRoutes([file]);
    expect(inventory.filesScanned).toBe(1);
    expect(inventory.limitations).toHaveLength(0);

    const routes = inventory.routes.map((r) => `${r.method} ${r.normalizedPath}`);
    expect(routes).toContain("GET /api/v1/health");
    expect(routes).toContain("POST /api/v1/echo");
    expect(routes).toContain("GET /api/ping");
    expect(routes).toContain("GET /root-status");
    expect(routes).toHaveLength(4);
  });
});

describe("Edge Cases: Method-Chained .use() Mounts", () => {
  it("resolves multiple routers mounted via chained .use() calls on app", async () => {
    const fixtureDir = path.join(EDGE_FIXTURES, "chained-use");
    const file = path.join(fixtureDir, "app.ts");

    const inventory = await extractExpressRoutes([file]);
    expect(inventory.filesScanned).toBe(1);
    expect(inventory.limitations).toHaveLength(0);

    const routes = inventory.routes.map((r) => `${r.method} ${r.normalizedPath}`);
    expect(routes).toContain("GET /test/ping");
    expect(routes).toContain("GET /test/pong");
    expect(routes).toHaveLength(2);
  });

  it("resolves fluent Router().use() initialization chaining with parent mounting", async () => {
    const fixtureDir = path.join(EDGE_FIXTURES, "chained-router-init");
    const file = path.join(fixtureDir, "app.ts");

    const inventory = await extractExpressRoutes([file]);
    expect(inventory.filesScanned).toBe(1);
    expect(inventory.limitations).toHaveLength(0);

    const routes = inventory.routes.map((r) => `${r.method} ${r.normalizedPath}`);
    expect(routes).toContain("GET /api/a/alpha");
    expect(routes).toContain("GET /api/b/beta");
    expect(routes).toHaveLength(2);
  });
});

describe("Edge Cases: Barrel Re-Export Resolution", () => {
  it("transitively resolves router imports through barrel re-export files", async () => {
    const fixtureDir = path.join(EDGE_FIXTURES, "barrel-exports");
    const files = [
      path.join(fixtureDir, "app.ts"),
      path.join(fixtureDir, "routes", "index.ts"),
      path.join(fixtureDir, "routes", "users.ts"),
      path.join(fixtureDir, "routes", "orders.ts"),
    ];

    const inventory = await extractExpressRoutes(files);
    expect(inventory.filesScanned).toBe(4);
    expect(inventory.limitations).toHaveLength(0);

    const routes = inventory.routes.map((r) => `${r.method} ${r.normalizedPath}`);
    expect(routes).toContain("GET /users");
    expect(routes).toContain("GET /users/{id}");
    expect(routes).toContain("POST /orders");
    expect(routes).toContain("GET /orders/{orderId}");
    expect(routes).toHaveLength(4);
  });

  it("verifies zero drift between barrel-exported code routes and OpenAPI specification", async () => {
    const fixtureDir = path.join(EDGE_FIXTURES, "barrel-exports");
    const files = [
      path.join(fixtureDir, "app.ts"),
      path.join(fixtureDir, "routes", "index.ts"),
      path.join(fixtureDir, "routes", "users.ts"),
      path.join(fixtureDir, "routes", "orders.ts"),
    ];
    const specFile = path.join(fixtureDir, "openapi.yaml");

    const codeInv = await extractExpressRoutes(files);
    const specInv = await parseOpenApiSpec(specFile);
    const report = compareRoutes(codeInv, specInv);

    expect(report.summary.routesAnalyzed).toBe(4);
    expect(report.summary.openApiOperations).toBe(4);
    expect(report.summary.mismatches).toBe(0);
    expect(report.summary.undocumentedCount).toBe(0);
    expect(report.summary.staleCount).toBe(0);
    expect(report.discrepancies).toHaveLength(0);
  });

  it("resolves router mounts via namespace member access (import * as routes)", async () => {
    const fixtureDir = path.join(EDGE_FIXTURES, "namespace-barrel");
    const barrelDir = path.join(EDGE_FIXTURES, "barrel-exports");
    const files = [
      path.join(fixtureDir, "app.ts"),
      path.join(barrelDir, "routes", "index.ts"),
      path.join(barrelDir, "routes", "users.ts"),
      path.join(barrelDir, "routes", "orders.ts"),
    ];

    const inventory = await extractExpressRoutes(files);
    expect(inventory.filesScanned).toBe(4);
    expect(inventory.limitations).toHaveLength(0);

    const routes = inventory.routes.map((r) => `${r.method} ${r.normalizedPath}`);
    expect(routes).toContain("GET /api/users");
    expect(routes).toContain("GET /api/users/{id}");
    expect(routes).toContain("POST /api/orders");
    expect(routes).toContain("GET /api/orders/{orderId}");
    expect(routes).toHaveLength(4);
  });
});


