import { describe, it, expect, vi } from "vitest";
import {
  formatGitHubAnnotations,
  printGitHubAnnotations,
  escapeWorkflowData,
  escapeWorkflowProperty,
} from "../src/reporters/github.js";
import type { ComparisonResult } from "../src/types.js";

describe("GitHub Actions Reporter", () => {
  it("escapes workflow data and properties correctly", () => {
    expect(escapeWorkflowData("100% complete\r\nnext line")).toBe(
      "100%25 complete%0D%0Anext line"
    );
    expect(escapeWorkflowProperty("file:name,with:special%chars\n")).toBe(
      "file%3Aname%2Cwith%3Aspecial%25chars%0A"
    );
  });

  it("returns empty array when there are no discrepancies or limitations", () => {
    const result: ComparisonResult = {
      discrepancies: [],
      limitations: [],
      summary: {
        routesAnalyzed: 5,
        openApiOperations: 5,
        mismatches: 0,
        undocumentedCount: 0,
        staleCount: 0,
        methodMismatchCount: 0,
        limitationsCount: 0,
        hasErrors: false,
        exitCode: 0,
      },
    };

    const annotations = formatGitHubAnnotations(result);
    expect(annotations).toEqual([]);
  });

  it("formats error discrepancies with sourceLocation", () => {
    const result: ComparisonResult = {
      discrepancies: [
        {
          type: "UNDOCUMENTED_ROUTE",
          severity: "error",
          method: "GET",
          path: "/api/users",
          sourceLocation: {
            file: "src/routes/users.ts",
            line: 14,
            column: 5,
          },
          message: "Route exists in code but is missing from OpenAPI spec",
          suggestion: "Add 'GET /api/users' to openapi.yaml",
        },
      ],
      limitations: [],
      summary: {
        routesAnalyzed: 1,
        openApiOperations: 0,
        mismatches: 1,
        undocumentedCount: 1,
        staleCount: 0,
        methodMismatchCount: 0,
        limitationsCount: 0,
        hasErrors: true,
        exitCode: 1,
      },
    };

    const annotations = formatGitHubAnnotations(result, process.cwd());
    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toBe(
      "::error file=src/routes/users.ts,line=14,col=5,title=UNDOCUMENTED_ROUTE (GET /api/users)::Route exists in code but is missing from OpenAPI spec → Add 'GET /api/users' to openapi.yaml"
    );
  });

  it("formats warning discrepancies and falls back to specLocation", () => {
    const result: ComparisonResult = {
      discrepancies: [
        {
          type: "STALE_SPEC_PATH",
          severity: "warning",
          method: "DELETE",
          path: "/api/legacy",
          specLocation: {
            file: "docs/openapi.yaml",
            line: 42,
          },
          message: "Operation documented in OpenAPI spec but not implemented in code",
          suggestion: "Remove 'DELETE /api/legacy' from openapi.yaml",
        },
      ],
      limitations: [],
      summary: {
        routesAnalyzed: 0,
        openApiOperations: 1,
        mismatches: 1,
        undocumentedCount: 0,
        staleCount: 1,
        methodMismatchCount: 0,
        limitationsCount: 0,
        hasErrors: false,
        exitCode: 0,
      },
    };

    const annotations = formatGitHubAnnotations(result, process.cwd());
    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toBe(
      "::warning file=docs/openapi.yaml,line=42,title=STALE_SPEC_PATH (DELETE /api/legacy)::Operation documented in OpenAPI spec but not implemented in code → Remove 'DELETE /api/legacy' from openapi.yaml"
    );
  });

  it("formats analysis limitations as warnings", () => {
    const result: ComparisonResult = {
      discrepancies: [],
      limitations: [
        {
          type: "DYNAMIC_ROUTE",
          file: "src/dynamic.ts",
          location: {
            file: "src/dynamic.ts",
            line: 8,
            column: 3,
          },
          message: "Dynamic path expression detected",
          snippet: "app.get(getPath(), handler)",
        },
      ],
      summary: {
        routesAnalyzed: 1,
        openApiOperations: 1,
        mismatches: 0,
        undocumentedCount: 0,
        staleCount: 0,
        methodMismatchCount: 0,
        limitationsCount: 1,
        hasErrors: false,
        exitCode: 0,
      },
    };

    const annotations = formatGitHubAnnotations(result, process.cwd());
    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toBe(
      "::warning file=src/dynamic.ts,line=8,col=3,title=Limitation%3A DYNAMIC_ROUTE::Dynamic path expression detected (Snippet: app.get(getPath(), handler))"
    );
  });

  it("prints annotations to console.log", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result: ComparisonResult = {
      discrepancies: [
        {
          type: "METHOD_MISMATCH",
          severity: "error",
          method: "POST",
          path: "/api/items",
          sourceLocation: { file: "app.ts", line: 10 },
          message: "Method differs",
          suggestion: "Fix method",
        },
      ],
      limitations: [],
      summary: {
        routesAnalyzed: 1,
        openApiOperations: 1,
        mismatches: 1,
        undocumentedCount: 0,
        staleCount: 0,
        methodMismatchCount: 1,
        limitationsCount: 0,
        hasErrors: true,
        exitCode: 1,
      },
    };

    printGitHubAnnotations(result);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain("::error ");

    logSpy.mockRestore();
  });
});
