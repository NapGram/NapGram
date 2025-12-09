import Lottie2img from '@lottie2img/main';
import fs from 'fs/promises';

export default async function tgsToGif(tgsPath: string, outputPath?: string): Promise<string> {
  const outPath = outputPath || `${tgsPath}.gif`;

  // Read TGS file (gzipped Lottie JSON)
  const tgsBuffer = await fs.readFile(tgsPath);

  // Create converter instance using static factory method
  const converter = await Lottie2img.create();

  // Convert to WebP using pure WASM (no Chromium!)
  // Note: @lottie2img/main currently only supports WebP output, not GIF yet
  // But WebP works fine in QQ
  const webpBuffer = await converter.convert(tgsBuffer);

  // Write output (using .webp extension despite outputPath parameter)
  const webpPath = outPath.replace(/\.(tgs|gif)$/i, '.webp');
  await fs.writeFile(webpPath, webpBuffer);

  // Cleanup
  converter.destroy();

  return webpPath;
}
