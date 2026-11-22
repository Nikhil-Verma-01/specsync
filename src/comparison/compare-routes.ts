import type {
  ComparisonResult,
  ComparisonSummary,
  Discrepancy,
  HttpMethod,
  OpenApiInventory,
  OpenApiOperation,
  RouteInventory,
  SourceRoute
} from "../types.js";

function makeRouteKey(method: HttpMethod, normalizedPath: string): string {
  return `${method.toUpperCase()} ${normalizedPath}`;
}

export interface CompareOptions {
  failOn?: "error" | "warning" | "never";
}

/**
 * Deterministically compares Express source routes against OpenAPI specification operations.
 */
export function compareRoutes(
  sourceInventory: RouteInventory,
  specInventory: OpenApiInventory,
  options: CompareOptions = {}
): ComparisonResult {
  const discrepancies: Discrepancy[] = [];
  const hasLimitations = sourceInventory.limitations.length > 0;

  // Group source routes by key: "METHOD /path" and by path: "/path" -> Set of methods
  const sourceMap = new Map<string, SourceRoute>();
  const sourcePathMethods = new Map<string, Set<HttpMethod>>();

  for (const route of sourceInventory.routes) {
    if (!route.supported) continue;
    const key = makeRouteKey(route.method, route.normalizedPath);
    if (!sourceMap.has(key)) {
      sourceMap.set(key, route);
    }
    if (!sourcePathMethods.has(route.normalizedPath)) {
      sourcePathMethods.set(route.normalizedPath, new Set());
    }
    sourcePathMethods.get(route.normalizedPath)!.add(route.method);
  }

  // Group OpenAPI operations by key and by path
  const specMap = new Map<string, OpenApiOperation>();
  const specPathMethods = new Map<string, Set<HttpMethod>>();

  for (const op of specInventory.operations) {
    const key = makeRouteKey(op.method, op.normalizedPath);
    if (!specMap.has(key)) {
      specMap.set(key, op);
    }
    if (!specPathMethods.has(op.normalizedPath)) {
      specPathMethods.set(op.normalizedPath, new Set());
    }
    specPathMethods.get(op.normalizedPath)!.add(op.method);
  }

  // 1. Check for Undocumented Routes & Method Mismatches in Source
  for (const [key, sourceRoute] of sourceMap.entries()) {
    if (!specMap.has(key)) {
      // The exact (method, path) pair is missing from OpenAPI
      const pathInSpec = specPathMethods.has(sourceRoute.normalizedPath);

      if (pathInSpec) {
        // Path exists in spec, but this HTTP method is not documented
        const specMethods = Array.from(specPathMethods.get(sourceRoute.normalizedPath) || []).join(", ");
        discrepancies.push({
          type: "METHOD_MISMATCH",
          severity: "error",
          method: sourceRoute.method,
          path: sourceRoute.normalizedPath,
          sourceLocation: sourceRoute.location,
          specLocation: { file: specInventory.specFile },
          message: `HTTP method ${sourceRoute.method} exists in code for "${sourceRoute.normalizedPath}", but OpenAPI only declares: [${specMethods}].`,
          suggestion: `Add the "${sourceRoute.method}" operation to ${specInventory.specFile}.`
        });
      } else {
        // Entire path is undocumented in OpenAPI
        discrepancies.push({
          type: "UNDOCUMENTED_ROUTE",
          severity: "error",
          method: sourceRoute.method,
          path: sourceRoute.normalizedPath,
          sourceLocation: sourceRoute.location,
          specLocation: { file: specInventory.specFile },
          message: `Route ${sourceRoute.method} "${sourceRoute.normalizedPath}" exists in source but is missing from OpenAPI specification.`,
          suggestion: `Add the operation to ${specInventory.specFile}.`
        });
      }
    }
  }

  // 2. Check for Stale Specification Paths & Spec-Side Method Mismatches
  for (const [key, specOp] of specMap.entries()) {
    if (!sourceMap.has(key)) {
      const pathInSource = sourcePathMethods.has(specOp.normalizedPath);
      const severity = hasLimitations ? "warning" : "error";
      const caveat = hasLimitations
        ? " (Note: dynamic routes or limitations were detected in source; this route might be handled dynamically)."
        : "";

      if (!pathInSource) {
        // Path does not exist in source at all -> STALE_SPEC_PATH
        discrepancies.push({
          type: "STALE_SPEC_PATH",
          severity,
          method: specOp.method,
          path: specOp.normalizedPath,
          specLocation: { file: specInventory.specFile },
          message: `Documented operation ${specOp.method} "${specOp.normalizedPath}" has no matching supported source route found${caveat}.`,
          suggestion: `Verify whether this route is implemented or remove it from ${specInventory.specFile}.`
        });
      } else {
        // Path exists in source, but this specific method is not implemented -> METHOD_MISMATCH
        const codeMethods = Array.from(sourcePathMethods.get(specOp.normalizedPath) || [])
          .sort()
          .join(", ");
        discrepancies.push({
          type: "METHOD_MISMATCH",
          severity,
          method: specOp.method,
          path: specOp.normalizedPath,
          specLocation: { file: specInventory.specFile },
          message: `HTTP method ${specOp.method} is declared in OpenAPI for "${specOp.normalizedPath}", but code only implements: [${codeMethods}]${caveat}.`,
          suggestion: `Implement the "${specOp.method}" route in code or remove it from ${specInventory.specFile}.`
        });
      }
    }
  }

  // Sort discrepancies deterministically by path and method
  discrepancies.sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return (a.method || "").localeCompare(b.method || "");
  });

  const undocumentedCount = discrepancies.filter((d) => d.type === "UNDOCUMENTED_ROUTE").length;
  const staleCount = discrepancies.filter((d) => d.type === "STALE_SPEC_PATH").length;
  const methodMismatchCount = discrepancies.filter((d) => d.type === "METHOD_MISMATCH").length;
  const errorCount = discrepancies.filter((d) => d.severity === "error").length;

  const failOn = options.failOn ?? "error";
  let hasErrors = false;
  if (failOn === "error") {
    hasErrors = errorCount > 0;
  } else if (failOn === "warning") {
    hasErrors = discrepancies.length > 0 || sourceInventory.limitations.length > 0;
  } else {
    hasErrors = false;
  }

  const summary: ComparisonSummary = {
    routesAnalyzed: sourceInventory.routes.length,
    openApiOperations: specInventory.operations.length,
    mismatches: discrepancies.length,
    undocumentedCount,
    staleCount,
    methodMismatchCount,
    limitationsCount: sourceInventory.limitations.length,
    hasErrors,
    exitCode: hasErrors ? 1 : 0
  };

  return {
    discrepancies,
    limitations: sourceInventory.limitations,
    summary
  };
}
