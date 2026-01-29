import { generateScribbleAsset, generatePaperFrame, generateCornerSeparator } from '@/lib/gemini-client';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { config } from '@/lib/config';

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

    // Generate paper frames
    console.log(`\n📄 Generating ${config.assets.paperFrameCount} paper frames...`);
    for (let i = 0; i < config.assets.paperFrameCount; i++) {
        try {
            console.log(`  - Frame ${i + 1}/${config.assets.paperFrameCount}`);
            const blob = await generatePaperFrame(i);
            const buffer = Buffer.from(await blob.arrayBuffer());
            await writeFile(
                join(publicDir, 'paper-frames', `frame_${String(i + 1).padStart(2, '0')}.png`),
                buffer
            );
        } catch (error) {
            console.error(`  ✗ Failed to generate frame ${i + 1}:`, error);
        }
    }

    // Generate corner separators
    console.log('\n🖌️  Generating corner separators...');
    for (const position of ['tl', 'tr'] as const) {
        try {
            console.log(`  - Corner ${position}`);
            const blob = await generateCornerSeparator(position);
            const buffer = Buffer.from(await blob.arrayBuffer());
            await writeFile(
                join(publicDir, 'corners', `corner_white_${position}.png`),
                buffer
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
