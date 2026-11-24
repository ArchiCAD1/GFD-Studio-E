import branding from '../../branding.json';

export const COMPANY_NAME = branding.publisher;
export const COMPANY_WATERMARK_OPACITY = branding.watermarkOpacity;

function assetUrl(path: string): string {
  const file = path.split('/').pop()!;
  const base = typeof document === 'undefined' ? 'file:///' : document.baseURI;
  return new URL(file, base).href;
}

export const companyLogoUrl = () => assetUrl(branding.companyLogo.publicAsset);

let watermarkBytes: Promise<Uint8Array> | undefined;
export function companyWatermarkPng(): Promise<Uint8Array> {
  watermarkBytes ??= import('../assets/gfd-company-logo-watermark.png?inline').then(({ default: dataUrl }) => {
    const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const binary = atob(encoded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  });
  return watermarkBytes;
}
