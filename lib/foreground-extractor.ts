/**
 * Foreground extraction and white outline generation
 * Creates clean subject separation with hand-drawn style outlines
 */

import sharp from 'sharp';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

export interface OutlineConfig {
    thickness: number;
    color: string;
    style: 'solid' | 'sketchy' | 'wobble';
}

/**
 * Extract foreground and create white outline overlay
 * Uses FFmpeg's edge detection and morphology filters
 * @param inputVideoPath - Path to input video
 * @param outputPath - Path to save outline video overlay
 * @param config - Outline styling configuration
 */
export async function createWhiteOutlineOverlay(
    inputVideoPath: string,
    outputPath: string,
    config: OutlineConfig = { thickness: 8, color: 'white', style: 'wobble' }
): Promise<void> {
    console.log('Creating white outline overlay with foreground extraction...');

    // FFmpeg filter to create subject outline:
    // 1. Extract edges using Sobel edge detection
    // 2. Dilate to create thick outline
    // 3. Apply threshold to create clean white outline
    // 4. Add slight blur for hand-drawn feel

    const filters = [
        // Convert to grayscale for edge detection
        'format=gray',
        // Sobel edge detection (stronger = more edges)
        'edgedetect=low=0.1:high=0.3',
        // Dilate to thicken edges (creates outline effect)
        `erosion=threshold0=${255 - config.thickness}:threshold1=${255 - config.thickness}:threshold2=${255 - config.thickness}:threshold3=${255 - config.thickness}`,
        // Threshold to pure white/black
        'threshold=threshold=127',
        // Invert so outline is white on black
        'negate',
        // Slight blur for hand-drawn wobble effect
        config.style === 'wobble' ? 'boxblur=2:1' : '',
        // Convert back to RGBA (white outline, transparent background)
        'format=rgba',
        // Make black transparent, keep white
        'colorkey=0x000000:0.3:0.1'
    ].filter(Boolean).join(',');

    const command = `ffmpeg -i "${inputVideoPath}" -vf "${filters}" -pix_fmt yuva420p "${outputPath}"`;

    try {
        await execAsync(command, { maxBuffer: 50 * 1024 * 1024 });
        console.log('White outline overlay created successfully');
    } catch (error) {
        console.error('Failed to create outline overlay:', error);
        throw new Error('Outline generation failed');
    }
}

/**
 * Create a sketchy, hand-drawn style outline using multiple passes
 * This creates the authentic marker-drawn look from reference images
 */
export async function createSketchyOutline(
    inputVideoPath: string,
    outputPath: string,
    thickness: number = 6
): Promise<void> {
    console.log('Creating sketchy hand-drawn outline...');

    // Multi-pass approach for authentic hand-drawn look:
    // Pass 1: Strong edges (main outline)
    // Pass 2: Softer edges (fill gaps)
    // Pass 3: Slight offset for "marker wobble"

    const tempDir = join(require('os').tmpdir(), 'outline-temp');
    await require('fs/promises').mkdir(tempDir, { recursive: true });

    const pass1 = join(tempDir, 'pass1.mp4');
    const pass2 = join(tempDir, 'pass2.mp4');

    try {
        // Pass 1: Strong edge detection
        const filter1 = [
            'format=gray',
            'edgedetect=low=0.05:high=0.25:mode=canny',
            `erosion=threshold0=${255 - thickness}:threshold1=${255 - thickness}:threshold2=${255 - thickness}:threshold3=${255 - thickness}`,
            'negate',
            'format=rgba',
            'colorkey=0x000000:0.3:0.1'
        ].join(',');

        await execAsync(`ffmpeg -i "${inputVideoPath}" -vf "${filter1}" -pix_fmt yuva420p "${pass1}"`,
            { maxBuffer: 50 * 1024 * 1024 });

        // Pass 2: Softer edges with slight offset (creates wobble)
        const filter2 = [
            'format=gray',
            'edgedetect=low=0.1:high=0.35',
            `erosion=threshold0=${255 - (thickness - 2)}:threshold1=${255 - (thickness - 2)}:threshold2=${255 - (thickness - 2)}:threshold3=${255 - (thickness - 2)}`,
            'negate',
            'boxblur=1:1', // Slight blur for wobble
            'format=rgba',
            'colorkey=0x000000:0.3:0.1'
        ].join(',');

        await execAsync(`ffmpeg -i "${inputVideoPath}" -vf "${filter2}" -pix_fmt yuva420p "${pass2}"`,
            { maxBuffer: 50 * 1024 * 1024 });

        // Combine both passes with slight offset for hand-drawn effect
        const combineFilter = `[0:v][1:v]overlay=x='1+sin(t*2)*0.5':y='1+cos(t*3)*0.5':format=auto`;
        await execAsync(`ffmpeg -i "${pass1}" -i "${pass2}" -filter_complex "${combineFilter}" -pix_fmt yuva420p "${outputPath}"`,
            { maxBuffer: 50 * 1024 * 1024 });

        console.log('Sketchy outline created successfully');
    } catch (error) {
        console.error('Failed to create sketchy outline:', error);
        throw error;
    } finally {
        // Cleanup temp files
        try {
            await unlink(pass1);
            await unlink(pass2);
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

/**
 * Simple subject mask extraction using color-based segmentation
 * Falls back method when advanced segmentation isn't available
 */
export async function createSimpleSubjectMask(
    inputVideoPath: string,
    outputPath: string
): Promise<void> {
    console.log('Creating simple subject mask...');

    // Use luma key and edge detection to isolate subject
    // This works well for subjects with good contrast against background

    const filter = [
        // Duplicate stream for processing
        'split[original][edges]',
        // Edge detection on one stream
        '[edges]format=gray,edgedetect=low=0.1:high=0.4[edgemask]',
        // Combine with original using luma key
        '[original][edgemask]overlay=format=auto'
    ].join(';');

    try {
        await execAsync(`ffmpeg -i "${inputVideoPath}" -filter_complex "${filter}" -pix_fmt yuva420p "${outputPath}"`,
            { maxBuffer: 50 * 1024 * 1024 });
        console.log('Subject mask created');
    } catch (error) {
        console.error('Failed to create subject mask:', error);
        throw error;
    }
}

/**
 * Create animated white outline that slightly wobbles/jiggles for hand-drawn effect
 * This matches the organic feel from reference images
 */
export async function createWobblyOutline(
    inputVideoPath: string,
    outputPath: string,
    thickness: number = 8
): Promise<void> {
    console.log('Creating wobbly animated outline...');

    // Use FFmpeg's geq filter to add per-pixel wobble based on time
    const filters = [
        'format=gray',
        'edgedetect=low=0.1:high=0.3',
        `erosion=threshold0=${255 - thickness}:threshold1=${255 - thickness}:threshold2=${255 - thickness}:threshold3=${255 - thickness}`,
        'negate',
        // Add wobble using geq (geometric equation filter)
        // Samples neighboring pixels with time-based offset
        `geq=lum='lum(X+sin(T*3)*2,Y+cos(T*2.5)*2)':cr='128':cb='128'`,
        'format=rgba',
        'colorkey=0x000000:0.3:0.1'
    ].join(',');

    try {
        await execAsync(`ffmpeg -i "${inputVideoPath}" -vf "${filters}" -pix_fmt yuva420p "${outputPath}"`,
            { maxBuffer: 50 * 1024 * 1024 });
        console.log('Wobbly outline created successfully');
    } catch (error) {
        console.error('Failed to create wobbly outline:', error);
        // Fallback to simpler method
        await createWhiteOutlineOverlay(inputVideoPath, outputPath, { thickness, color: 'white', style: 'wobble' });
    }
}
