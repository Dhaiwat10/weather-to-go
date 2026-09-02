const fs = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode-terminal/vendor/QRCode');
const QRErrorCorrectLevel = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');
const { PNG } = require('pngjs');

const [url, output = 'iphone-test-qr.svg'] = process.argv.slice(2);
if (!url) throw new Error('Pass the Expo URL to encode.');

const qr = new QRCode(-1, QRErrorCorrectLevel.M);
qr.addData(url);
qr.make();

const quietZone = 4;
const moduleSize = output.endsWith('.png') ? 20 : 10;
const count = qr.getModuleCount();
const size = (count + quietZone * 2) * moduleSize;
const squares = [];

for (let row = 0; row < count; row += 1) {
  for (let column = 0; column < count; column += 1) {
    if (!qr.isDark(row, column)) continue;
    squares.push(`<rect x="${(column + quietZone) * moduleSize}" y="${(row + quietZone) * moduleSize}" width="${moduleSize}" height="${moduleSize}"/>`);
  }
}

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code to open Weather To Go on iPhone">`,
  `<rect width="${size}" height="${size}" rx="28" fill="#EAF6FF"/>`,
  '<g fill="#10203F">',
  ...squares,
  '</g>',
  '</svg>',
].join('\n');

if (output.endsWith('.png')) {
  const png = new PNG({ width: size, height: size });
  const light = [234, 246, 255, 255];
  const dark = [16, 32, 63, 255];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const column = Math.floor(x / moduleSize) - quietZone;
      const row = Math.floor(y / moduleSize) - quietZone;
      const isDark = row >= 0 && column >= 0 && row < count && column < count && qr.isDark(row, column);
      const color = isDark ? dark : light;
      png.data[offset] = color[0];
      png.data[offset + 1] = color[1];
      png.data[offset + 2] = color[2];
      png.data[offset + 3] = color[3];
    }
  }
  fs.writeFileSync(path.resolve(output), PNG.sync.write(png));
} else {
  fs.writeFileSync(path.resolve(output), svg);
}
