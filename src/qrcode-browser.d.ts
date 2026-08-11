declare module "qrcode/lib/browser" {
  export function toString(
    text: string,
    options?: {
      type?: "svg";
      margin?: number;
      width?: number;
      errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    }
  ): Promise<string>;
}
