import path from "node:path";
import type { ComparisonResult } from "../types.js";

/**
 * Escapes characters for GitHub Actions workflow command messages:
 * % -> %25, \r -> %0D, \n -> %0A
 */
export function escapeWorkflowData(str: string): string {
  return str
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

/**
 * Escapes characters for GitHub Actions workflow command property values:
 * % -> %25, \r -> %0D, \n -> %0A, : -> %3A, , -> %2C
 */
export function escapeWorkflowProperty(str: string): string {
  return str
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

function normalizeFilePath(file: string, cwd: string): string {
  if (path.isAbsolute(file)) {
    const rel = path.relative(cwd, file);
    return rel.split(path.sep).join("/");
  }
  return file.split(path.sep).join("/");
}

/**
 * Formats discrepancies and limitations into GitHub Actions workflow commands:
 * ::error file={file},line={line},col={col},title={title}::{message}
 * ::warning file={file},line={line},col={col},title={title}::{message}
 */
export function formatGitHubAnnotations(
  result: ComparisonResult,
  cwd: string = process.cwd()
): string[] {
  const commands: string[] = [];

  for (const d of result.discrepancies) {
    const level = d.severity === "error" ? "error" : "warning";
    const loc = d.sourceLocation || d.specLocation;
    const file = loc?.file ? normalizeFilePath(loc.file, cwd) : "";
    const line = loc?.line;
    const col = d.sourceLocation?.column;

    const props: string[] = [];
    if (file) props.push(`file=${escapeWorkflowProperty(file)}`);
    if (line !== undefined) props.push(`line=${line}`);
    if (col !== undefined) props.push(`col=${col}`);

    const title = d.method ? `${d.type} (${d.method} ${d.path})` : `${d.type} (${d.path})`;
    props.push(`title=${escapeWorkflowProperty(title)}`);

    const propStr = props.length > 0 ? ` ${props.join(",")}` : "";
    const message = `${d.message} → ${d.suggestion}`;
    commands.push(`::${level}${propStr}::${escapeWorkflowData(message)}`);
  }

  for (const lim of result.limitations) {
    const loc = lim.location;
    const rawFile = loc ? loc.file : lim.file;
    const file = rawFile ? normalizeFilePath(rawFile, cwd) : "";
    const line = loc?.line;
    const col = loc?.column;

    const props: string[] = [];
    if (file) props.push(`file=${escapeWorkflowProperty(file)}`);
    if (line !== undefined) props.push(`line=${line}`);
    if (col !== undefined) props.push(`col=${col}`);
    props.push(`title=${escapeWorkflowProperty(`Limitation: ${lim.type}`)}`);

    const propStr = props.length > 0 ? ` ${props.join(",")}` : "";
    const snippetStr = lim.snippet ? ` (Snippet: ${lim.snippet})` : "";
    const message = `${lim.message}${snippetStr}`;
    commands.push(`::warning${propStr}::${escapeWorkflowData(message)}`);
  }

  return commands;
}

/**
 * Prints GitHub Actions workflow annotations to standard output.
 */
export function printGitHubAnnotations(
  result: ComparisonResult,
  cwd: string = process.cwd()
): void {
  const annotations = formatGitHubAnnotations(result, cwd);
  for (const line of annotations) {
    console.log(line);
  }
}
