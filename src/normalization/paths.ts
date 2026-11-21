import type { HttpMethod } from "../types.js";

/**
 * Normalizes an HTTP method name to standard uppercase representation.
 */
export function normalizeMethod(method: string): HttpMethod {
  const upper = method.trim().toUpperCase();
  const validMethods: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];
  if (validMethods.includes(upper as HttpMethod)) {
    return upper as HttpMethod;
  }
  throw new Error(`Unsupported HTTP method: ${method}`);
}

/**
 * Joins URL path segments safely ensuring single slashes between segments.
 */
export function joinPaths(...parts: (string | undefined | null)[]): string {
  const segments = parts
    .filter((p): p is string => Boolean(p && p.trim().length > 0))
    .map((p) => p.trim());

  if (segments.length === 0) {
    return "/";
  }

  let combined = segments.join("/");
  // Replace multiple adjacent slashes with a single slash
  combined = combined.replace(/\/+/g, "/");

  if (!combined.startsWith("/")) {
    combined = "/" + combined;
  }

  return combined;
}

/**
 * Normalizes Express/OpenAPI route paths into standard OpenAPI template format `{param}`.
 * Also handles trailing slashes, leading slashes, and basic cleanups.
 *
 * Examples:
 *   "/users/:id" -> "/users/{id}"
 *   "/users/{id}/" -> "/users/{id}"
 *   "users/:id" -> "/users/{id}"
 *   "/" -> "/"
 */
export function normalizePath(rawPath: string, basePath?: string): string {
  if (!rawPath || rawPath.trim() === "") {
    rawPath = "/";
  }

  let path = rawPath.trim();

  // If basePath is provided and path does not already begin with it, prepend it
  if (basePath && basePath.trim() !== "" && basePath.trim() !== "/") {
    const cleanBase = basePath.trim().replace(/\/+$/, "");
    if (!path.startsWith(cleanBase)) {
      path = joinPaths(cleanBase, path);
    }
  }

  // Ensure leading slash
  if (!path.startsWith("/")) {
    path = "/" + path;
  }

  // Normalize multiple slashes
  path = path.replace(/\/+/g, "/");

  // Remove trailing slash unless path is just "/"
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  // Convert Express style parameters (:paramName) to OpenAPI style ({paramName})
  // Avoid replacing if it's already in {param} form
  path = path.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");

  return path;
}

/**
 * Determines whether a route path contains dynamic expressions, regexes, or wildcards
 * that static analysis cannot reliably resolve.
 */
export function isDynamicOrRegexPath(path: string): boolean {
  // Contains RegExp syntax, Express wildcard (*), or unresolvable characters
  if (path.includes("*") || path.includes("(") || path.includes(")") || path.includes("+") || path.includes("?")) {
    return true;
  }
  return false;
}
