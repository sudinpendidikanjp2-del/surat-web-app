import QRCode from 'qrcode';
import type { QrEncoder } from '@/server/application/ports';

export const qrCodeEncoder: QrEncoder = {
  toDataUrl: (text, width) => QRCode.toDataURL(text, { margin: 1, width, errorCorrectionLevel: 'M' }),
};
