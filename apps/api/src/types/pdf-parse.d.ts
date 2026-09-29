declare module "pdf-parse/lib/pdf-parse.js" {
  function pdfParse(buffer: Buffer, options?: Record<string, unknown>): Promise<{ text: string; numpages?: number }>;
  export default pdfParse;
}
