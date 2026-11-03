import Ajv, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { schemas, type SchemaName } from "./schemas.generated.js";

export { schemas, type SchemaName };

export class ContractValidationError extends Error {
  constructor(
    readonly schema: SchemaName,
    readonly errors: ErrorObject[],
  ) {
    super(
      `Contract validation failed for '${schema}': ` +
        errors
          .slice(0, 8)
          .map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`)
          .join("; "),
    );
    this.name = "ContractValidationError";
  }

  toJSON(): { schema: string; errors: ErrorObject[] } {
    return { schema: this.schema, errors: this.errors };
  }
}

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);

const validators = new Map<SchemaName, ValidateFunction>();

for (const name of Object.keys(schemas) as SchemaName[]) {
  ajv.addSchema(schemas[name] as object, schemas[name].$id);
}

for (const name of Object.keys(schemas) as SchemaName[]) {
  validators.set(name, ajv.getSchema(schemas[name].$id) as ValidateFunction);
}

export function validate(schema: SchemaName, value: unknown): ErrorObject[] {
  const fn = validators.get(schema);
  if (!fn) throw new Error(`Unknown schema '${schema}'`);
  if (fn(value)) return [];
  return (
    fn.errors ?? [
      { instancePath: "/", schemaPath: "#", keyword: "validate", params: {}, message: "invalid" },
    ]
  );
}

export function isValid(schema: SchemaName, value: unknown): boolean {
  return validate(schema, value).length === 0;
}

export function assertValid<T>(schema: SchemaName, value: unknown): T {
  const errors = validate(schema, value);
  if (errors.length > 0) throw new ContractValidationError(schema, errors);
  return value as T;
}

export function schemaId(schema: SchemaName): string {
  return schemas[schema].$id;
}

export const SCHEMA_VERSION = "1.0.0" as const;
