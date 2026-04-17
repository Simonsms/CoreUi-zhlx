/**
 * CoreAI 图标生成器
 * 用法: node scripts/generate-icons.mjs <源图片路径>
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const TARGETS = [
  { path: 'resources/app.png', size: 1024 },
  { path: 'resources/app_dev.png', size: 1024 },
  { path: 'resources/icon.png', size: 512 },
  { path: 'public/pwa/icon-180.png', size: 180 },
  { path: 'public/pwa/icon-192.png', size: 192 },
  { path: 'public/pwa/icon-512.png', size: 512 },
  { path: 'src/renderer/assets/logos/brand/app.png', size: 512 },
  { path: 'src/renderer/assets/zhlxui-logo.png', size: 128 },
  { path: 'mobile/assets/images/icon.png', size: 1024 },
];

async function main() {
  const src = process.argv[2];
  if (!src) {
    console.error('用法: node scripts/generate-icons.mjs <源图片路径>');
    process.exit(1);
  }
  if (!existsSync(src)) {
    console.error(`文件不存在: ${src}`);
    process.exit(1);
  }

  const meta = await sharp(src).metadata();
  console.log(`源图片: ${meta.width}x${meta.height} ${meta.format}`);

  const w = meta.width;
  const h = meta.height;
  const side = Math.min(w, h);
  const squareBuf = await sharp(src)
    .extract({
      left: Math.floor((w - side) / 2),
      top: Math.floor((h - side) / 2),
      width: side,
      height: side,
    })
    .png()
    .toBuffer();
  console.log(`裁剪为 ${side}x${side} 正方形`);

  const png1024 = await sharp(squareBuf).resize(1024, 1024).png().toBuffer();

  // ICO & ICNS (动态导入，允许未安装时跳过)
  try {
    const png2icons = await import('png2icons');
    const ico = png2icons.createICO(png1024, png2icons.BICUBIC2, 0, true, true);
    if (ico) {
      writeFileSync(join(ROOT, 'resources/app.ico'), ico);
      console.log('  resources/app.ico');
    }
    const icns = png2icons.createICNS(png1024, png2icons.BICUBIC2, 0);
    if (icns) {
      writeFileSync(join(ROOT, 'resources/app.icns'), icns);
      console.log('  resources/app.icns');
    }
  } catch {
    console.warn('  跳过 ICO/ICNS: 请先安装 png2icons (bun add -d png2icons)');
  }

  // PNG 各尺寸
  for (const { path: p, size } of TARGETS) {
    const buf = await sharp(squareBuf).resize(size, size).png().toBuffer();
    writeFileSync(join(ROOT, p), buf);
    console.log(`  ${p} (${size}x${size})`);
  }

  console.log('\n完成! 窗口图标和托盘图标需要重启应用生效。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
