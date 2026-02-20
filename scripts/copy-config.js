const fs = require('fs');
const path = require('path');

const xmlDir = path.join(__dirname, '..', 'xml');
const androidAppSrcDir = path.join(__dirname, '..', 'android', 'app', 'src');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  if (!exists) {
    console.log(`Source directory ${src} does not exist, skipping copy.`);
    return;
  }
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('Copying XML configurations to Android project...');
copyRecursiveSync(xmlDir, androidAppSrcDir);
console.log('Done!');
