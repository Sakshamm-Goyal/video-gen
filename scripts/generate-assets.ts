import 'dotenv/config'; // Load .env so GOOGLE_AI_API_KEY is available
import { generateScribbleAsset, generatePaperFrame, generateCornerSeparator } from '@/lib/gemini-client';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { config } from '@/lib/config';
import sharp from 'sharp';

/** Make near-white pixels transparent (RGB > 245 -> alpha 0). Enforces true alpha for Imagen output. */
async function whiteToAlpha(buffer: Buffer): Promise<Buffer> {
    const img = sharp(buffer);
    const meta = await img.metadata();
    const w = meta.width!;
    const h = meta.height!;
    const { data } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const threshold = 245;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i]! >= threshold && data[i + 1]! >= threshold && data[i + 2]! >= threshold) {
            data[i + 3] = 0;
        }
    }
    return sharp(new Uint8Array(data), { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

/**
 * Script to generate all overlay assets using Gemini AI
 * Run once to create the asset library
 */
async function generateAssets() {
    console.log('🎨 Starting asset generation...\n');

    const publicDir = join(process.cwd(), 'public', 'assets', 'overlays');

    // Create directories
    const fs = require('fs').promises;
    await fs.mkdir(join(publicDir, 'scribbles'), { recursive: true });
    await fs.mkdir(join(publicDir, 'paper-frames'), { recursive: true });
    await fs.mkdir(join(publicDir, 'corners'), { recursive: true });

    // Generate scribbles
    console.log(`📝 Generating ${config.assets.scribbleCount} scribble sprites...`);
    for (let i = 0; i < config.assets.scribbleCount; i++) {
        try {
            console.log(`  - Scribble ${i + 1}/${config.assets.scribbleCount}`);
            const blob = await generateScribbleAsset(i);
            const buffer = Buffer.from(await blob.arrayBuffer());
            await writeFile(
                join(publicDir, 'scribbles', `scribble_${String(i + 1).padStart(2, '0')}.png`),
                buffer
            );
        } catch (error) {
            console.error(`  ✗ Failed to generate scribble ${i + 1}:`, error);
        }
    }

    // Generate paper frames (corners only, transparent center) + white-to-alpha post-process
    console.log(`\n📄 Generating ${config.assets.paperFrameCount} paper frames (corners only, transparent center)...`);
    for (let i = 0; i < config.assets.paperFrameCount; i++) {
        try {
            console.log(`  - Frame ${i + 1}/${config.assets.paperFrameCount}`);
            const blob = await generatePaperFrame(i);
            const buffer = Buffer.from(await blob.arrayBuffer());
            const withAlpha = await whiteToAlpha(buffer); // Force near-white to transparent
            await writeFile(
                join(publicDir, 'paper-frames', `frame_${String(i + 1).padStart(2, '0')}.png`),
                withAlpha
            );
        } catch (error) {
            console.error(`  ✗ Failed to generate frame ${i + 1}:`, error);
        }
    }

    // Generate corner separators (torn paper corners) + white-to-alpha
    console.log('\n🖌️  Generating corner separators (torn paper corners)...');
    for (const position of ['tl', 'tr'] as const) {
        try {
            console.log(`  - Corner ${position}`);
            const blob = await generateCornerSeparator(position);
            const buffer = Buffer.from(await blob.arrayBuffer());
            const withAlpha = await whiteToAlpha(buffer);
            await writeFile(
                join(publicDir, 'corners', `corner_white_${position}.png`),
                withAlpha
            );
        } catch (error) {
            console.error(`  ✗ Failed to generate corner ${position}:`, error);
        }
    }

    console.log('\n✅ Asset generation complete!');
    console.log(`Assets saved to: ${publicDir}`);
}

// Run if called directly
if (require.main === module) {
    generateAssets().catch(console.error);
}

export { generateAssets };
