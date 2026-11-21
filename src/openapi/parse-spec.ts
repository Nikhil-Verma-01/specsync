import fs from "node:fs/promises";
import YAML from "yaml";
import type { HttpMethod, OpenApiOperation, OpenApiInventory } from "../types.js";
import { normalizeMethod, normalizePath } from "../normalization/paths.js";

const VALID_HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "options",
  "head"
]);

/**
 * Parses an OpenAPI 3.x document (YAML or JSON) and returns an inventory of declared operations.
 */
export async function parseOpenApiSpec(
  specFilePath: string,
  basePath?: string
): Promise<OpenApiInventory> {
  let content: string;
  try {
    content = await fs.readFile(specFilePath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read OpenAPI spec at "${specFilePath}": ${(err as Error).message}`);
  }

  let doc: any;
  try {
    doc = YAML.parse(content);
  } catch (err) {
    throw new Error(`Failed to parse OpenAPI YAML/JSON in "${specFilePath}": ${(err as Error).message}`);
  }

  if (!doc || typeof doc !== "object") {
    throw new Error(`Invalid OpenAPI document: root must be an object in "${specFilePath}"`);
  }

  const version = doc.openapi || doc.swagger || "3.0.0";
  const operations: OpenApiOperation[] = [];
  const unresolvedRefs: string[] = [];

  const paths = doc.paths;
  if (!paths || typeof paths !== "object") {
    return {
      operations: [],
      specFile: specFilePath,
      version: String(version),
      unresolvedRefs
    };
  }

  // Determine effective base path: explicit argument > doc.basePath (Swagger 2.0) > doc.servers[0].url (OpenAPI 3.x)
  let effectiveBasePath = basePath;
  if (!effectiveBasePath) {
    if (typeof doc.basePath === "string" && doc.basePath.length > 0 && doc.basePath !== "/") {
      effectiveBasePath = doc.basePath;
    } else if (Array.isArray(doc.servers) && doc.servers.length > 0 && typeof doc.servers[0]?.url === "string") {
      const serverUrl = doc.servers[0].url.trim();
      try {
        if (serverUrl.startsWith("/")) {
          if (serverUrl !== "/") effectiveBasePath = serverUrl;
        } else if (serverUrl.startsWith("http://") || serverUrl.startsWith("https://")) {
          const parsed = new URL(serverUrl);
          if (parsed.pathname && parsed.pathname !== "/") {
            effectiveBasePath = parsed.pathname;
          }
        }
      } catch {
        // ignore invalid URL format
      }
    }
  }

  for (const [rawPath, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }

    // Check for $ref on the path item level
    if ("$ref" in pathItem && typeof (pathItem as any).$ref === "string") {
      unresolvedRefs.push((pathItem as any).$ref);
      continue;
    }

    const normalizedPath = normalizePath(rawPath, effectiveBasePath);

    for (const [key, opItem] of Object.entries(pathItem)) {
      const lowerMethod = key.toLowerCase();
      if (!VALID_HTTP_METHODS.has(lowerMethod)) {
        continue;
      }

      if (!opItem || typeof opItem !== "object") {
        continue;
      }

      const method: HttpMethod = normalizeMethod(lowerMethod);
      const op = opItem as any;

      operations.push({
        method,
        rawPath,
        normalizedPath,
        operationId: typeof op.operationId === "string" ? op.operationId : undefined,
        summary: typeof op.summary === "string" ? op.summary : undefined,
        sourceFile: specFilePath
      });
    }
  }

  return {
    operations,
    specFile: specFilePath,
    version: String(version),
    unresolvedRefs
  };
}
