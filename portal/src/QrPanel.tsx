import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrPanel({ value }: { value: string }) {
  const [svg, setSvg] = useState<string>('');
  useEffect(() => {
    void QRCode.toString(value, { type: 'svg', margin: 1, width: 180 }).then(setSvg);
  }, [value]);
  return <div role="img" aria-label="QR code" dangerouslySetInnerHTML={{ __html: svg }} />;
}
