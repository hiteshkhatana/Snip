import QRCode from "qrcode";

export function generateQrCodePng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { type: "png" });
}
