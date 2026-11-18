// Genera lib/telemetryEvents.generated.ts a partir de docs/telemetry/event-schemas.json:
// los tipos de las properties de cada evento y su allowlist (claves permitidas y obligatorias).
// Uso (desde uis/backoffice):  npm run telemetry:generate
// __tests__/telemetryEvents.test.ts falla si el archivo generado no coincide con el JSON.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMAS_PATH = path.resolve(here, "../../../docs/telemetry/event-schemas.json");
export const OUTPUT_PATH = path.resolve(here, "../lib/telemetryEvents.generated.ts");

function tsType(prop) {
  if (prop.enum) return prop.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (prop.type === "array") {
    const items = prop.items?.enum
      ? `(${prop.items.enum.map((v) => JSON.stringify(v)).join(" | ")})`
      : prop.items?.type === "string"
        ? "string"
        : "unknown";
    return `${items}[]`;
  }
  if (prop.type === "integer" || prop.type === "number") return "number";
  if (prop.type === "boolean") return "boolean";
  if (prop.type === "string") return "string";
  return "unknown";
}

export function generate(schema) {
  const version = schema["x-schema-version"];
  const events = Object.entries(schema.definitions).filter(([name]) => name !== "envelope");
  const lines = [
    "// ARCHIVO GENERADO por scripts/generate-telemetry-events.mjs desde",
    "// docs/telemetry/event-schemas.json. No lo edites a mano: cambia el JSON y ejecuta",
    "// `npm run telemetry:generate`.",
    "",
    `export const TELEMETRY_SCHEMA_VERSION = ${JSON.stringify(version)};`,
    "",
    "export interface TelemetryEventProperties {",
  ];
  const keys = [];
  for (const [name, def] of events) {
    const props = def.allOf[1].properties.properties;
    const required = new Set(props.required);
    lines.push(`  ${name}: {`);
    for (const [key, prop] of Object.entries(props.properties)) {
      lines.push(`    ${key}${required.has(key) ? "" : "?"}: ${tsType(prop)};`);
    }
    lines.push("  };");
    keys.push(
      `  ${name}: { allowed: ${JSON.stringify(Object.keys(props.properties))}, required: ${JSON.stringify(props.required)} },`,
    );
  }
  lines.push("}", "");
  lines.push("export type TelemetryEventType = keyof TelemetryEventProperties;", "");
  lines.push("// Allowlist por evento: track() descarta cualquier clave que no esté en `allowed`");
  lines.push(
    "export const TELEMETRY_EVENT_KEYS: Record<TelemetryEventType, { allowed: readonly string[]; required: readonly string[] }> = {",
  );
  lines.push(...keys, "};", "");
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const schema = JSON.parse(readFileSync(SCHEMAS_PATH, "utf8"));
  writeFileSync(OUTPUT_PATH, generate(schema));
  console.log(`Generado ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}
