export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";

export type ExtractorFramework = "express" | "fastify" | "koa" | "unknown";

export type RouteConfidence = "static" | "inferred" | "dynamic";


export interface SourceLocation {
  file: string;
  line: number;
  column?: number;
}

export interface SourceRoute {
  method: HttpMethod;
  rawPath: string;
  normalizedPath: string;
  location: SourceLocation;
  confidence: RouteConfidence;
  supported: boolean;
  framework: ExtractorFramework;
  routerPrefix?: string;
  unsupportedReason?: string;
}


export interface OpenApiOperation {
  method: HttpMethod;
  rawPath: string;
  normalizedPath: string;
  operationId?: string;
  summary?: string;
  sourceFile: string;
}

export type DiscrepancyType =
  | "UNDOCUMENTED_ROUTE"
  | "STALE_SPEC_PATH"
  | "METHOD_MISMATCH";

export type DiscrepancySeverity = "error" | "warning";

export interface Discrepancy {
  type: DiscrepancyType;
  severity: DiscrepancySeverity;
  method?: HttpMethod;
  path: string;
  sourceLocation?: SourceLocation;
  specLocation?: { file: string; line?: number };
  message: string;
  suggestion: string;
}

export type LimitationType = "UNSUPPORTED_PATTERN" | "PARSE_ERROR" | "DYNAMIC_ROUTE";

export interface AnalysisLimitation {
  type: LimitationType;
  file: string;
  location?: SourceLocation;
  message: string;
  snippet?: string;
}

export interface RouteInventory {
  routes: SourceRoute[];
  limitations: AnalysisLimitation[];
  filesScanned: number;
}

export interface OpenApiInventory {
  operations: OpenApiOperation[];
  specFile: string;
  version: string;
  unresolvedRefs?: string[];
}

export interface ComparisonSummary {
  routesAnalyzed: number;
  openApiOperations: number;
  mismatches: number;
  undocumentedCount: number;
  staleCount: number;
  methodMismatchCount: number;
  limitationsCount: number;
  hasErrors: boolean;
  exitCode: number;
}

export interface ComparisonResult {
  discrepancies: Discrepancy[];
  limitations: AnalysisLimitation[];
  summary: ComparisonSummary;
}

export interface SpecSyncConfig {
  source: string[];
  openapi: string;
  exclude?: string[];
  basePath?: string;
  failOn?: "error" | "warning" | "never";
}

export interface CheckOptions {
  config?: string;
  source?: string[];
  openapi?: string;
  basePath?: string;
  format?: "terminal" | "json";
  failOn?: "error" | "warning" | "never";
  quiet?: boolean;
  githubAnnotations?: boolean;
}
