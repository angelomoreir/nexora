import type { TFunction } from "i18next";
import { ApiClientError } from "./api";

export function apiErrorText(error: unknown, t: TFunction): string {
  if (error instanceof ApiClientError) {
    return t(`errors.${error.code}`, { defaultValue: error.message });
  }
  return error instanceof Error ? error.message : String(error);
}
