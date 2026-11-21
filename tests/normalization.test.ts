import { describe, it, expect } from "vitest";
import { normalizePath, normalizeMethod, joinPaths, isDynamicOrRegexPath } from "../src/normalization/paths.js";

describe("normalization/paths", () => {
  describe("normalizeMethod", () => {
    it("converts methods to uppercase", () => {
      expect(normalizeMethod("get")).toBe("GET");
      expect(normalizeMethod("post")).toBe("POST");
      expect(normalizeMethod("DELETE")).toBe("DELETE");
    });

    it("throws on invalid methods", () => {
      expect(() => normalizeMethod("invalid")).toThrow(/Unsupported HTTP method/);
    });
  });

  describe("joinPaths", () => {
    it("joins segments safely", () => {
      expect(joinPaths("/api", "v1", "users")).toBe("/api/v1/users");
      expect(joinPaths("/api/", "/users/")).toBe("/api/users/");
      expect(joinPaths()).toBe("/");
    });
  });

  describe("normalizePath", () => {
    it("converts Express parameter syntax :param to OpenAPI {param}", () => {
      expect(normalizePath("/users/:id")).toBe("/users/{id}");
      expect(normalizePath("/orgs/:orgId/users/:userId")).toBe("/orgs/{orgId}/users/{userId}");
    });

    it("preserves already normalized {param} syntax", () => {
      expect(normalizePath("/users/{id}")).toBe("/users/{id}");
    });

    it("removes trailing slash except for root", () => {
      expect(normalizePath("/users/")).toBe("/users");
      expect(normalizePath("/")).toBe("/");
      expect(normalizePath("")).toBe("/");
    });

    it("handles multiple slashes", () => {
      expect(normalizePath("//api///users//")).toBe("/api/users");
    });

    it("prepends basePath if specified", () => {
      expect(normalizePath("/users/:id", "/api")).toBe("/api/users/{id}");
      expect(normalizePath("/api/users/:id", "/api")).toBe("/api/users/{id}");
    });
  });

  describe("isDynamicOrRegexPath", () => {
    it("detects wildcards and regexes", () => {
      expect(isDynamicOrRegexPath("/users/*")).toBe(true);
      expect(isDynamicOrRegexPath("/user(s)?")).toBe(true);
      expect(isDynamicOrRegexPath("/users/:id")).toBe(false);
      expect(isDynamicOrRegexPath("/users/{id}")).toBe(false);
    });
  });
});
