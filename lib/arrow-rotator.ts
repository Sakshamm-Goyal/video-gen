/**
 * Arrow rotation utilities for intelligent directional arrows
 * Pre-rotates arrow images to point toward subjects before FFmpeg processing
 */

import sharp from 'sharp';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { SubjectBounds, generateDirectionalArrows, ArrowPlacement } from './arrow-director';

/**
 * Detect if a scribble type is an arrow that should be rotated
 */
export function isArrowType(scribbleType: string): boolean {
    const arrowTypes = ['arrow', 'curvedArrow', 'speedArrow', 'motionLine'];
    return arrowTypes.includes(scribbleType);
}

/**
 * Pre-rotate an arrow PNG to point toward subject
 * @param imagePath - Path to arrow PNG
 * @param outputPath - Where to save rotated arrow
 * @param rotation - Degrees to rotate (0 = pointing right)
 * @returns Path to rotated image
 */
export async function rotateArrowImage(
    imagePath: string,
    outputPath: string,
    rotation: number
): Promise<string> {
    try {
        const image = sharp(imagePath);
        const metadata = await image.metadata();

        // Rotate around center point
        await image
            .rotate(rotation, {
                background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
            })
            .toFile(outputPath);

        return outputPath;
    } catch (error) {
        console.error('Failed to rotate arrow:', error);
        return imagePath; // Return original on error
    }
}

/**
 * Batch rotate arrows for intelligent placement
 * @param scribblePaths - Array of scribble file paths
 * @param scribbleTypes - Corresponding types for each scribble
 * @param subjectBounds - Subject position for calculating arrow directions
 * @param videoWidth - Frame width
 * @param videoHeight - Frame height
 * @param outputDir - Where to save rotated arrows
 * @returns Map of original path to rotated path
 */
export async function prepareDirectionalArrows(
    scribblePaths: string[],
    scribbleTypes: string[],
    subjectBounds: SubjectBounds,
    videoWidth: number,
    videoHeight: number,
    outputDir: string
): Promise<Map<string, { path: string; rotation: number; placement: ArrowPlacement }>> {
    const rotatedArrows = new Map<string, { path: string; rotation: number; placement: ArrowPlacement }>();

    // Find all arrow scribbles
    const arrowIndices: number[] = [];
    scribblePaths.forEach((path, index) => {
        if (index < scribbleTypes.length && isArrowType(scribbleTypes[index])) {
            arrowIndices.push(index);
        }
    });

    if (arrowIndices.length === 0) {
        return rotatedArrows;
    }

    console.log(`Found ${arrowIndices.length} arrow scribbles, calculating intelligent placements...`);

    // Generate intelligent arrow placements
    const placements = generateDirectionalArrows(
        subjectBounds,
        videoWidth,
        videoHeight,
        arrowIndices.length
    );

    // Rotate each arrow to point toward subject
    const rotationTasks = arrowIndices.map(async (arrowIdx, i) => {
        const originalPath = scribblePaths[arrowIdx];
        const placement = placements[i];
        const rotatedPath = join(outputDir, `arrow_rotated_${i}_${Math.round(placement.rotation)}.png`);

        await rotateArrowImage(originalPath, rotatedPath, placement.rotation);

        rotatedArrows.set(originalPath, {
            path: rotatedPath,
            rotation: placement.rotation,
            placement
        });
    });

    await Promise.all(rotationTasks);

    console.log(`Rotated ${rotatedArrows.size} arrows to point toward subject`);
    return rotatedArrows;
}

/**
 * Calculate dynamic arrow rotation based on subject movement
 * For animated arrows that track subject across frames
 * @param subjectCenterX - Subject X position
 * @param subjectCenterY - Subject Y position
 * @param arrowX - Arrow X position
 * @param arrowY - Arrow Y position
 * @returns Rotation in degrees
 */
export function calculateArrowRotation(
    subjectCenterX: number,
    subjectCenterY: number,
    arrowX: number,
    arrowY: number
): number {
    const dx = subjectCenterX - arrowX;
    const dy = subjectCenterY - arrowY;
    const radians = Math.atan2(dy, dx);
    return radians * (180 / Math.PI);
}

/**
 * Generate FFmpeg rotate filter for dynamic arrow rotation
 * Creates expression that rotates arrow based on time (for wobble effect)
 * @param baseRotation - Base rotation toward subject
 * @param wobbleAmount - Amount of wobble (degrees)
 * @returns FFmpeg rotate filter expression
 */
export function generateWobbleRotateFilter(
    baseRotation: number,
    wobbleAmount: number = 3
): string {
    // Convert degrees to radians for FFmpeg
    const baseRad = (baseRotation * Math.PI / 180).toFixed(4);
    const wobbleRad = (wobbleAmount * Math.PI / 180).toFixed(4);

    // Rotate with slight wobble: base + sin(t) * wobble
    return `rotate='${baseRad}+${wobbleRad}*sin(t*2)':c=none:ow='hypot(iw,ih)':oh='hypot(iw,ih)'`;
}
