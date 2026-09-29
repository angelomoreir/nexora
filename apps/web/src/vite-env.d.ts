/// <reference types="vite/client" />

declare module "mammoth/mammoth.browser" {
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: Record<string, unknown>
  ): Promise<{ value: string; messages: { type: string; message: string }[] }>;
}
