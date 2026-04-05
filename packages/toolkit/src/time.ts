import { time, TimestampStyles } from "discord.js";

export type DiscordTimestampInput = Date | number;
export type DiscordTimestampStyle =
  (typeof TimestampStyles)[keyof typeof TimestampStyles];

export function discordTimestamp(
  value: DiscordTimestampInput,
  style: DiscordTimestampStyle = TimestampStyles.ShortTime,
) {
  const normalized = normalizeTimestampInput(value);

  if (normalized instanceof Date) {
    return time(normalized, style);
  }

  return time(normalized, style);
}

export function relativeTime(value: DiscordTimestampInput) {
  return discordTimestamp(value, TimestampStyles.RelativeTime);
}

export function shortTime(value: DiscordTimestampInput) {
  return discordTimestamp(value, TimestampStyles.ShortTime);
}

export function longDateTime(value: DiscordTimestampInput) {
  return discordTimestamp(value, TimestampStyles.LongDateTime);
}

function normalizeTimestampInput(value: DiscordTimestampInput): DiscordTimestampInput {
  if (value instanceof Date) {
    return value;
  }

  if (value > 9_999_999_999) {
    return new Date(value);
  }

  return value;
}
