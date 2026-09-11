/**
 * Checks a tool call's arguments against the JSON Schema the wheel supplies.
 *
 * Deliberately small. The contract's parameter schemas are what the runtime
 * exports from its `@beta_tool` signatures: an object with typed properties,
 * some required, a few enums. This covers exactly that — required keys,
 * primitive types, nested objects and arrays, enum membership — and rejects
 * anything it cannot judge on the safe side, which is "let the runtime
 * decide". A full validator would be a dependency and a second opinion; the
 * primitives' own argument checks remain the authority. What this closes is
 * the audit's B09 gap: a fully wrong shape (`{"arm": 7}` for a string,
 * `targets` missing entirely) no longer reaches the primitives at all.
 */

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
};

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function typeMatches(declared: string, actual: string): boolean {
  if (declared === actual) return true;
  // JSON Schema: every integer is a number.
  return declared === "number" && actual === "integer";
}

/** The first problem found, in words the model can act on, or null. */
export function validateArguments(schema: JsonSchema | undefined, value: unknown, path = "arguments"): string | null {
  if (!schema) return null;
  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    if (!allowed.some((declared) => typeMatches(declared, actual))) {
      return `${path} must be ${allowed.join(" or ")}, got ${actual}`;
    }
  }
  if (schema.enum && !schema.enum.some((option) => option === value)) {
    return `${path} must be one of ${schema.enum.map((option) => JSON.stringify(option)).join(", ")}`;
  }
  if (typeOf(value) === "object") {
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in record)) return `${path}.${key} is required`;
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in record) {
        const problem = validateArguments(child, record[key], `${path}.${key}`);
        if (problem) return problem;
      }
    }
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(record).find((key) => !(key in (schema.properties ?? {})));
      if (unknown) return `${path}.${unknown} is not a parameter of this tool`;
    }
  }
  if (Array.isArray(value) && schema.items) {
    for (let index = 0; index < value.length; index++) {
      const problem = validateArguments(schema.items, value[index], `${path}[${index}]`);
      if (problem) return problem;
    }
  }
  return null;
}
