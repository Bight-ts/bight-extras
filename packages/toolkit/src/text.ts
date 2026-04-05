export const DISCORD_LIMITS = {
  messageContent: 2_000,
  embedDescription: 4_096,
  embedFieldValue: 1_024,
  embedFooterText: 2_048,
  embedAuthorName: 256,
} as const;

export interface TruncateTextOptions {
  limit?: number;
  suffix?: string;
}

export interface SplitTextOptions {
  limit?: number;
  separator?: string;
  preferNewlines?: boolean;
  trim?: boolean;
}

export function truncateText(input: string, options: TruncateTextOptions = {}) {
  const limit = options.limit ?? DISCORD_LIMITS.messageContent;
  const suffix = options.suffix ?? "...";

  if (input.length <= limit) {
    return input;
  }

  if (limit <= suffix.length) {
    return suffix.slice(0, limit);
  }

  return `${input.slice(0, limit - suffix.length)}${suffix}`;
}

export function splitText(input: string, options: SplitTextOptions = {}) {
  const limit = options.limit ?? DISCORD_LIMITS.messageContent;
  const separator = options.separator ?? "\n";
  const preferNewlines = options.preferNewlines ?? true;
  const trim = options.trim ?? true;
  let remaining = trim ? input.trim() : input;
  const chunks: string[] = [];

  if (remaining.length <= limit) {
    return [remaining];
  }

  while (remaining.length > limit) {
    let splitAt = limit;

    if (preferNewlines && separator.length > 0) {
      const separatorIndex = remaining.lastIndexOf(separator, limit);
      if (separatorIndex > 0) {
        splitAt = separatorIndex;
      }
    }

    let chunk = remaining.slice(0, splitAt);
    if (trim) {
      chunk = chunk.trim();
    }

    if (!chunk) {
      chunk = remaining.slice(0, limit);
      splitAt = limit;
    }

    chunks.push(chunk);
    remaining = remaining.slice(splitAt);

    if (separator.length > 0 && remaining.startsWith(separator)) {
      remaining = remaining.slice(separator.length);
    }

    if (trim) {
      remaining = remaining.trimStart();
    }
  }

  if (remaining.length > 0 || chunks.length === 0) {
    chunks.push(trim ? remaining.trim() : remaining);
  }

  return chunks;
}

export function truncateCodeBlock(
  input: string,
  options: TruncateTextOptions & { language?: string } = {},
) {
  const language = options.language ?? "";
  const opener = `\`\`\`${language}\n`;
  const closer = "\n```";
  const limit = options.limit ?? DISCORD_LIMITS.messageContent;
  const contentLimit = Math.max(limit - opener.length - closer.length, 0);
  const content = truncateText(input, {
    limit: contentLimit,
    suffix: options.suffix,
  });

  return `${opener}${content}${closer}`;
}

export function formatJsonCodeBlock(
  value: unknown,
  options: TruncateTextOptions = {},
) {
  const json = safeStringify(value);
  return truncateCodeBlock(json, {
    ...options,
    language: "json",
  });
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
