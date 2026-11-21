import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  extractExpressRoutes,
  analyzeSourceFile,
} from "../src/extractors/express-routes.js";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures", "express");

// ─── Helper ────────────────────────────────────────────────────────────────

function fix(...names: string[]): string[] {
  return names.map((n) => path.join(FIXTURES, n));
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("extractExpressRoutes — basic app.METHOD()", () => {
  it("extracts all literal routes from a basic app", async () => {
    const inv = await extractExpressRoutes(fix("basic-app.ts"));

    expect(inv.filesScanned).toBe(1);
    expect(inv.limitations).toHaveLength(0);

    const paths = inv.routes.map((r) => `${r.method} ${r.normalizedPath}`);
    expect(paths).toContain("GET /users");
    expect(paths).toContain("POST /users");
    expect(paths).toContain("GET /users/{id}");
    expect(paths).toContain("PUT /users/{id}");
    expect(paths).toContain("DELETE /users/{id}");
    expect(paths).toContain("GET /health");
  });

  it("marks all extracted routes as framework=express", async () => {
    const inv = await extractExpressRoutes(fix("basic-app.ts"));

    for (const route of inv.routes) {
      expect(route.framework).toBe("express");
    }
  });

  it("records source file and line number for every route", async () => {
    const inv = await extractExpressRoutes(fix("basic-app.ts"));

    for (const route of inv.routes) {
      expect(route.location.file).toContain("basic-app.ts");
      expect(route.location.line).toBeGreaterThan(0);
    }
  });

  it("converts :param Express syntax to {param} OpenAPI syntax", async () => {
    const inv = await extractExpressRoutes(fix("basic-app.ts"));

    const paramRoutes = inv.routes.filter((r) =>
      r.normalizedPath.includes("{id}")
    );
    expect(paramRoutes.length).toBeGreaterThan(0);
    // Ensure no raw Express :id syntax leaks into normalizedPath
    for (const r of paramRoutes) {
      expect(r.normalizedPath).not.toMatch(/:id/);
    }
  });
});

describe("extractExpressRoutes — intra-file router mount", () => {
  it("resolves router prefix for intra-file app.use() mount", async () => {
    const inv = await extractExpressRoutes(fix("router-mounted.ts"));

    const paths = inv.routes.map((r) => r.normalizedPath);
    expect(paths).toContain("/orders");
    expect(paths).toContain("/orders/{orderId}");
  });

  it("emits correct HTTP methods for mounted router", async () => {
    const inv = await extractExpressRoutes(fix("router-mounted.ts"));

    const routePairs = inv.routes.map(
      (r) => `${r.method} ${r.normalizedPath}`
    );
    expect(routePairs).toContain("GET /orders");
    expect(routePairs).toContain("POST /orders");
    expect(routePairs).toContain("GET /orders/{orderId}");
  });
});

describe("extractExpressRoutes — cross-file router resolution", () => {
  it("resolves routes from imported router file with mount prefix", async () => {
    // Both files must be provided — the extractor works across all files
    const inv = await extractExpressRoutes(
      fix("cross-file-app.ts", "users-router.ts")
    );

    const routePairs = inv.routes.map(
      (r) => `${r.method} ${r.normalizedPath}`
    );

    // Routes from users-router.ts should be prefixed with /api/users
    expect(routePairs).toContain("GET /api/users");
    expect(routePairs).toContain("POST /api/users");
    expect(routePairs).toContain("GET /api/users/{id}");
    expect(routePairs).toContain("DELETE /api/users/{id}");

    // Routes from cross-file-app.ts directly
    expect(routePairs).toContain("GET /health");
  });

  it("does not double-prefix routes", async () => {
    const inv = await extractExpressRoutes(
      fix("cross-file-app.ts", "users-router.ts")
    );

    for (const route of inv.routes) {
      // Should not appear as /api/users/api/users/{id}
      expect(route.normalizedPath).not.toMatch(/\/api\/users\/api\//);
    }
  });
});

describe("extractExpressRoutes — dynamic routes", () => {
  it("reports DYNAMIC_ROUTE limitation for variable path expressions", async () => {
    const inv = await extractExpressRoutes(fix("dynamic-routes.ts"));

    const dynamicLimitations = inv.limitations.filter(
      (l) => l.type === "DYNAMIC_ROUTE"
    );
    expect(dynamicLimitations.length).toBeGreaterThan(0);
  });

  it("reports UNSUPPORTED_PATTERN for wildcard paths", async () => {
    const inv = await extractExpressRoutes(fix("wildcard-routes.ts"));

    const unsupportedLimitations = inv.limitations.filter(
      (l) => l.type === "UNSUPPORTED_PATTERN"
    );
    expect(unsupportedLimitations.length).toBeGreaterThan(0);
  });

  it("does not include dynamic or wildcard routes in the routes array", async () => {
    const inv = await extractExpressRoutes(
      fix("dynamic-routes.ts", "wildcard-routes.ts")
    );
    // All dynamic/wildcard routes should end up as limitations, not routes
    expect(inv.routes).toHaveLength(0);
  });

  it("reports PARSE_ERROR on unreadable file paths", async () => {
    const inv = await extractExpressRoutes([
      path.join(FIXTURES, "does-not-exist.ts"),
    ]);

    expect(inv.limitations).toHaveLength(1);
    expect(inv.limitations[0].type).toBe("PARSE_ERROR");
  });
});

describe("extractExpressRoutes — app.route() chaining", () => {
  it("extracts all HTTP methods from app.route() chains", async () => {
    const inv = await extractExpressRoutes(fix("app-route-chaining.ts"));

    const routePairs = inv.routes.map(
      (r) => `${r.method} ${r.normalizedPath}`
    );
    expect(routePairs).toContain("GET /users");
    expect(routePairs).toContain("POST /users");
    expect(routePairs).toContain("GET /users/{id}");
    expect(routePairs).toContain("PUT /users/{id}");
    expect(routePairs).toContain("DELETE /users/{id}");
  });
});

describe("extractExpressRoutes — basePath support", () => {
  it("prepends basePath to all extracted routes when provided", async () => {
    const inv = await extractExpressRoutes(fix("basic-app.ts"), "/api/v1");

    for (const route of inv.routes) {
      expect(route.normalizedPath.startsWith("/api/v1")).toBe(true);
    }
  });
});

describe("analyzeSourceFile — unit", () => {
  it("handles an empty source file without errors", () => {
    const sf = ts.createSourceFile(
      "empty.ts",
      "",
      ts.ScriptTarget.Latest,
      true
    );
    const { routes, limitations } = analyzeSourceFile(sf, "empty.ts");
    expect(routes).toHaveLength(0);
    expect(limitations).toHaveLength(0);
  });

  it("resolves intra-file router mounts in an isolated single-file AST", () => {
    const code = `
      import express from "express";
      const app = express();
      const api = express.Router();
      const v1 = express.Router();
      app.use("/api", api);
      api.use("/v1", v1);
      v1.get("/status", (req, res) => res.send("ok"));
    `;
    const sf = ts.createSourceFile("single-file.ts", code, ts.ScriptTarget.Latest, true);
    const { routes, limitations } = analyzeSourceFile(sf, "single-file.ts");
    expect(limitations).toHaveLength(0);
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe("GET");
    expect(routes[0].normalizedPath).toBe("/api/v1/status");
  });
});
