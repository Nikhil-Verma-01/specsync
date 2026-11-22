import fs from "node:fs/promises";
import path from "node:path";
import type { SpecSyncConfig } from "../types.js";

export const DEFAULT_CONFIG_FILENAMES = [
  "specsync.json",
  ".specsyncrc.json",
  ".specsyncrc"
];

export const DEFAULT_SPEC_FILENAMES = [
  "openapi.yaml",
  "openapi.yml",
  "openapi.json",
  "swagger.yaml",
  "swagger.yml",
  "swagger.json"
];

/**
 * Searches the given directory for standard OpenAPI specification files.
 */
export async function findOpenApiSpec(cwd: string): Promise<string | undefined> {
  for (const filename of DEFAULT_SPEC_FILENAMES) {
    const fullPath = path.resolve(cwd, filename);
    try {
      await fs.access(fullPath);
      return fullPath;
    } catch {
      // not found, try next
    }
  }
  return undefined;
}

/**
 * Loads and resolves the SpecSync configuration from file or defaults,
 * applying any explicit CLI overrides.
 */
export async function loadConfig(
  cwd: string = process.cwd(),
  explicitConfigPath?: string,
  overrides?: Partial<SpecSyncConfig>
): Promise<SpecSyncConfig> {
  let rawConfig: Partial<SpecSyncConfig> = {};

  let resolvedConfigPath: string | undefined;

  if (explicitConfigPath) {
    resolvedConfigPath = path.resolve(cwd, explicitConfigPath);
    let content: string;
    try {
      content = await fs.readFile(resolvedConfigPath, "utf-8");
    } catch (err) {
      throw new Error(`Failed to load config file at "${explicitConfigPath}": ${(err as Error).message}`);
    }

    try {
      rawConfig = JSON.parse(content);
    } catch (err) {
      throw new Error(`Failed to parse config file at "${explicitConfigPath}": ${(err as Error).message}`);
    }
  } else {
    for (const filename of DEFAULT_CONFIG_FILENAMES) {
      const p = path.resolve(cwd, filename);
      try {
        const content = await fs.readFile(p, "utf-8");
        rawConfig = JSON.parse(content);
        resolvedConfigPath = p;
        break;
      } catch (err) {
        // If file exists but is invalid JSON, throw error
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw new Error(`Failed to parse config file at "${p}": ${(err as Error).message}`);
        }
        // If file doesn't exist, try next candidate
      }
    }
  }

  const baseDir = resolvedConfigPath ? path.dirname(resolvedConfigPath) : cwd;

  // Resolve openapi path: CLI override > config file > auto-discovered > fallback
  let openapiPath: string;
  if (overrides?.openapi) {
    openapiPath = path.resolve(cwd, overrides.openapi);
  } else if (rawConfig.openapi) {
    openapiPath = path.resolve(baseDir, rawConfig.openapi);
  } else {
    const autoFound = await findOpenApiSpec(baseDir);
    if (autoFound) {
      openapiPath = autoFound;
    } else {
      openapiPath = "openapi.yaml";
    }
  }

  // Resolve source globs: CLI override > config file > empty array
  let sourcePatterns: string[] = [];
  if (overrides?.source && overrides.source.length > 0) {
    sourcePatterns = overrides.source;
  } else if (rawConfig.source && rawConfig.source.length > 0) {
    sourcePatterns = rawConfig.source;
  }

  // Resolve exclude patterns: CLI override > config file > empty array
  let excludePatterns: string[] = [];
  if (overrides?.exclude && overrides.exclude.length > 0) {
    excludePatterns = overrides.exclude;
  } else if (rawConfig.exclude && rawConfig.exclude.length > 0) {
    excludePatterns = rawConfig.exclude;
  }

  return {
    source: sourcePatterns,
    openapi: openapiPath,
    exclude: excludePatterns,
    basePath: overrides?.basePath !== undefined ? overrides.basePath : rawConfig.basePath,
    failOn: overrides?.failOn ?? rawConfig.failOn ?? "error"
  };
}
