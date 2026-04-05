import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

export function createConfirmationRow(options: {
  confirmCustomId: string;
  cancelCustomId: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmStyle?: ButtonStyle;
  cancelStyle?: ButtonStyle;
  disableConfirm?: boolean;
  disableCancel?: boolean;
}) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(options.confirmCustomId)
      .setLabel(options.confirmLabel ?? "Confirm")
      .setStyle(options.confirmStyle ?? ButtonStyle.Success)
      .setDisabled(options.disableConfirm ?? false),
    new ButtonBuilder()
      .setCustomId(options.cancelCustomId)
      .setLabel(options.cancelLabel ?? "Cancel")
      .setStyle(options.cancelStyle ?? ButtonStyle.Secondary)
      .setDisabled(options.disableCancel ?? false),
  );
}

export function createPagerRow(options: {
  previousCustomId: string;
  nextCustomId: string;
  previousLabel?: string;
  nextLabel?: string;
  disablePrevious?: boolean;
  disableNext?: boolean;
}) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(options.previousCustomId)
      .setLabel(options.previousLabel ?? "Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(options.disablePrevious ?? false),
    new ButtonBuilder()
      .setCustomId(options.nextCustomId)
      .setLabel(options.nextLabel ?? "Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(options.disableNext ?? false),
  );
}

export function paginateItems<T>(items: T[], pageSize: number) {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("paginateItems() requires a pageSize greater than 0.");
  }

  const pages: T[][] = [];

  for (let index = 0; index < items.length; index += pageSize) {
    pages.push(items.slice(index, index + pageSize));
  }

  return pages;
}

export function clampPageIndex(page: number, pageCount: number) {
  if (pageCount <= 0) {
    return 0;
  }

  const normalizedPage = Number.isFinite(page) ? Math.trunc(page) : 0;
  return Math.min(Math.max(normalizedPage, 0), pageCount - 1);
}
