const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'apps', 'web', 'public');
const sourceDir = path.join(root, 'apps', 'web', 'media-source');
const inputs = [
  { source: 'charge-paroissial.jpeg', output: 'leader', widths: [480, 720], quality: 0.84 },
  { source: 'fondateur-ecc.jpg', output: 'fondateur-ecc', widths: [480, 640], quality: 0.82 },
  { source: 'bible-goun.jpg', output: 'bible-goun', widths: [480, 720], quality: 0.78 },
  { source: 'jesus-christ.webp', output: 'jesus-christ', widths: [480, 720], quality: 0.8 },
];
const emblemInput = path.join(sourceDir, 'ecc-emblem.png');

async function toWebp(page, dataUrl, width, quality) {
  return page.evaluate(async ({ dataUrl, width, quality }) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const targetWidth = Math.min(width, image.naturalWidth);
    const targetHeight = Math.round(image.naturalHeight * targetWidth / image.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    canvas.getContext('2d').drawImage(image, 0, 0, targetWidth, targetHeight);
    return { width: targetWidth, height: targetHeight, url: canvas.toDataURL('image/webp', quality) };
  }, { dataUrl, width, quality });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><meta charset="utf-8">');
  for (const item of inputs) {
    const inputPath = path.join(sourceDir, item.source);
    const mime = item.source.endsWith('.png') ? 'png' : item.source.endsWith('.webp') ? 'webp' : 'jpeg';
    const inputData = `data:image/${mime};base64,${fs.readFileSync(inputPath).toString('base64')}`;
    for (const width of item.widths) {
      const result = await toWebp(page, inputData, width, item.quality);
      const output = path.join(publicDir, `${item.output}-${result.width}.webp`);
      fs.writeFileSync(output, Buffer.from(result.url.split(',')[1], 'base64'));
      process.stdout.write(`${path.basename(output)} ${result.width}x${result.height} ${fs.statSync(output).size}\n`);
    }
  }

  const emblemData = `data:image/png;base64,${fs.readFileSync(emblemInput).toString('base64')}`;
  const emblem = await toWebp(page, emblemData, 480, 0.84);
  const emblemOutput = path.join(publicDir, 'ecc-emblem.webp');
  fs.writeFileSync(emblemOutput, Buffer.from(emblem.url.split(',')[1], 'base64'));
  process.stdout.write(`ecc-emblem.webp ${emblem.width}x${emblem.height} ${fs.statSync(emblemOutput).size}\n`);

  const logoData = `data:image/webp;base64,${fs.readFileSync(emblemOutput).toString('base64')}`;
  const card = await page.evaluate(async (logoData) => {
    const logo = new Image();
    logo.src = logoData;
    await logo.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext('2d');
    context.fillStyle = '#0E2747';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(logo, 72, 112, 420, 406);
    context.fillStyle = '#D4AF37';
    context.fillRect(560, 177, 3, 276);
    context.fillStyle = '#FFFFFF';
    context.font = '52px Georgia, serif';
    context.fillText('Paroisse', 610, 250);
    context.fillText('Amour des Apôtres', 610, 320);
    context.fillStyle = '#D4AF37';
    context.font = '24px Arial, sans-serif';
    context.fillText('Sainte-Cécile · Cotonou', 614, 382);
    context.fillStyle = '#E6EDF4';
    context.font = '20px Arial, sans-serif';
    context.fillText('Église du Christianisme Céleste', 614, 430);
    return canvas.toDataURL('image/jpeg', 0.88);
  }, logoData);
  const output = path.join(publicDir, 'og-paroisse.jpg');
  fs.writeFileSync(output, Buffer.from(card.split(',')[1], 'base64'));
  process.stdout.write(`og-paroisse.jpg 1200x630 ${fs.statSync(output).size}\n`);
  await browser.close();
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
