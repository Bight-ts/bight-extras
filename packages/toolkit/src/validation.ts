import { z } from "zod";

export interface FormatZodIssuesOptions {
  prefix?: string;
  maxIssues?: number;
  includePath?: boolean;
  bullet?: string;
}

export function parseWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): z.infer<TSchema> {
  return schema.parse(value);
}

export function safeParseWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
) {
  return schema.safeParse(value);
}

export const parseOption = parseWithSchema;
export const safeParseOption = safeParseWithSchema;

export function formatZodIssues(
  error: z.ZodError,
  options: FormatZodIssuesOptions = {},
) {
  const prefix = options.prefix;
  const maxIssues = options.maxIssues ?? 5;
  const includePath = options.includePath ?? true;
  const bullet = options.bullet ?? "-";
  const issues = error.issues.slice(0, maxIssues).map((issue) => {
    const path =
      includePath && issue.path.length > 0
        ? `${issue.path.join(".")}: `
        : "";

    return `${bullet} ${path}${issue.message}`;
  });

  const remainder =
    error.issues.length > maxIssues
      ? `${bullet} ${error.issues.length - maxIssues} more issue(s) omitted`
      : undefined;

  return [prefix, ...issues, remainder].filter(Boolean).join("\n");
}

export function formatSafeParseIssues<TSchema extends z.ZodTypeAny>(
  result: ReturnType<TSchema["safeParse"]>,
  options?: FormatZodIssuesOptions,
) {
  if (result.success) {
    return undefined;
  }

  return formatZodIssues(result.error, options);
}
