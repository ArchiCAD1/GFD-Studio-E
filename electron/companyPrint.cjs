const fs = require('node:fs');
const path = require('node:path');
const branding = require('../branding.json');

let watermarkData;
function watermarkUrl() {
  if (!watermarkData) {
    const name = path.basename(branding.companyLogo.publicAsset);
    const packaged = path.join(__dirname, '..', 'dist', name);
    const file = fs.existsSync(packaged) ? packaged : path.join(__dirname, '..', branding.companyLogo.publicAsset);
    watermarkData = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  }
  return watermarkData;
}

function withCompanyPrintBrand(html) {
  if (typeof html !== 'string' || html.includes('id="gfde-company-watermark"')) return html;
  const style = `<style id="gfde-company-print-brand">@media print {
    #gfde-company-watermark { position: fixed; z-index: 2147483646; pointer-events: none; inset: 22% 18%; display: grid; place-items: center; }
    #gfde-company-watermark img { display: block; width: min(100%, 105mm); max-height: 70%; object-fit: contain; opacity: 0.1; filter: grayscale(1); }
    #gfde-company-footer { position: fixed; z-index: 2147483647; pointer-events: none; left: 0; right: 0; bottom: 2mm; color: #333; font: 6pt Arial, sans-serif; line-height: 1; text-align: center; letter-spacing: .15mm; }
    img.logo, img.cover-logo { display: none !important; }
  }</style>`;
  const mark = `<div id="gfde-company-watermark" aria-hidden="true"><img src="${watermarkUrl()}" alt=""></div><div id="gfde-company-footer" aria-hidden="true">${branding.publisher}</div>`;
  const withStyle = /<\/head\s*>/i.test(html) ? html.replace(/<\/head\s*>/i, `${style}</head>`) : `${style}${html}`;
  const body = /<body\b[^>]*>/i.exec(withStyle);
  if (body) return withStyle.slice(0, body.index + body[0].length) + mark + withStyle.slice(body.index + body[0].length);
  if (/<\/html\s*>/i.test(withStyle)) return withStyle.replace(/<\/html\s*>/i, `<body>${mark}</body></html>`);
  return `<body>${mark}${withStyle}</body>`;
}

module.exports = { withCompanyPrintBrand };
