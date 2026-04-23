import type { ZodTypeAny, z } from "zod";
import { ValidationError } from "./errors.js";

/**
 * Parse `unknown` input against a Zod schema and raise a well-typed
 * `ValidationError` with a flattened, human-readable message on failure.
 *
 * The generic parameter preserves the schema's OUTPUT type (post-defaults,
 * post-transforms) so callers receive fully-typed, required fields.
 */
export function parseOrThrow<T extends ZodTypeAny>(
  schema: T,
  input: unknown
): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues
      .map((i: { path: Array<string | number>; message: string }) =>
        `${i.path.join(".") || "input"}: ${i.message}`
      )
      .join("; ");
    throw new ValidationError(message, result.error.format());
  }
  return result.data;
}
