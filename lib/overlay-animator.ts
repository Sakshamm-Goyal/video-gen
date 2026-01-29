import { config } from './config';

export interface SafeZone {
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
}

/**
 * Calculate safe zones for overlay placement (Level 1: Edge-based)
 * Returns zones where overlays won't cover the center subject
 */
export function calculateSafeZones(frameWidth: number, frameHeight: number): SafeZone[] {
    const { safeZones } = config.overlay;

    return [
        {
            x: 0,
            y: 0,
            width: frameWidth * safeZones.leftBand,
            height: frameHeight,
            name: 'left-band',
        },
        {
            x: frameWidth * safeZones.rightBand,
            y: 0,
            width: frameWidth * (1 - safeZones.rightBand),
            height: frameHeight,
            name: 'right-band',
        },
        {
            x: 0,
            y: 0,
            width: frameWidth,
            height: frameHeight * safeZones.topBand,
            name: 'top-band',
        },
        {
            x: 0,
            y: frameHeight * safeZones.bottomBand,
            width: frameWidth,
            height: frameHeight * (1 - safeZones.bottomBand),
            name: 'bottom-band',
        },
    ];
}

/**
 * Calculate smart safe zones based on detected objects (Level 3: AI-based)
 * Excludes areas where objects/faces are detected
 */
export function calculateSmartSafeZones(
    frameWidth: number,
    frameHeight: number,
    detectedObjects: Array<{ bounds: { x: number; y: number; width: number; height: number } }>,
    subjectBounds?: { x: number; y: number; width: number; height: number }
): SafeZone[] {
    // Start with edge-based zones
    const baseZones = calculateSafeZones(frameWidth, frameHeight);
    
    // If we have detected objects, exclude those areas
    const excludedAreas: Array<{ x: number; y: number; width: number; height: number }> = [];
    
    // Add subject bounds if provided
    if (subjectBounds) {
        excludedAreas.push({
            x: subjectBounds.x * frameWidth,
            y: subjectBounds.y * frameHeight,
            width: subjectBounds.width * frameWidth,
            height: subjectBounds.height * frameHeight
        });
    }
    
    // Add detected object bounds
    detectedObjects.forEach(obj => {
        excludedAreas.push({
            x: obj.bounds.x * frameWidth,
            y: obj.bounds.y * frameHeight,
            width: obj.bounds.width * frameWidth,
            height: obj.bounds.height * frameHeight
        });
    });
    
    // Filter safe zones to exclude overlapping areas
    const smartZones: SafeZone[] = [];
    
    baseZones.forEach(zone => {
        // Check if zone overlaps with excluded areas
        const overlaps = excludedAreas.some(excluded => {
            return !(
                zone.x + zone.width < excluded.x ||
                zone.x > excluded.x + excluded.width ||
                zone.y + zone.height < excluded.y ||
                zone.y > excluded.y + excluded.height
            );
        });
        
        if (!overlaps) {
            smartZones.push(zone);
        } else {
            // Split zone to avoid excluded area
            // For simplicity, keep edge portions that don't overlap
            const margin = 50; // Keep 50px margin from excluded areas
            
            excludedAreas.forEach(excluded => {
                // Left portion
                if (zone.x < excluded.x - margin) {
                    smartZones.push({
                        x: zone.x,
                        y: zone.y,
                        width: Math.min(zone.width, excluded.x - margin - zone.x),
                        height: zone.height,
                        name: `${zone.name}-left`
                    });
                }
                
                // Right portion
                if (zone.x + zone.width > excluded.x + excluded.width + margin) {
                    smartZones.push({
                        x: Math.max(zone.x, excluded.x + excluded.width + margin),
                        y: zone.y,
                        width: zone.x + zone.width - Math.max(zone.x, excluded.x + excluded.width + margin),
                        height: zone.height,
                        name: `${zone.name}-right`
                    });
                }
                
                // Top portion
                if (zone.y < excluded.y - margin) {
                    smartZones.push({
                        x: zone.x,
                        y: zone.y,
                        width: zone.width,
                        height: Math.min(zone.height, excluded.y - margin - zone.y),
                        name: `${zone.name}-top`
                    });
                }
                
                // Bottom portion
                if (zone.y + zone.height > excluded.y + excluded.height + margin) {
                    smartZones.push({
                        x: zone.x,
                        y: Math.max(zone.y, excluded.y + excluded.height + margin),
                        width: zone.width,
                        height: zone.y + zone.height - Math.max(zone.y, excluded.y + excluded.height + margin),
                        name: `${zone.name}-bottom`
                    });
                }
            });
        }
    });
    
    // If no smart zones, fall back to base zones
    return smartZones.length > 0 ? smartZones : baseZones;
}

/**
 * Generate random position within a safe zone
 */
export function getRandomPositionInZone(zone: SafeZone): { x: number; y: number } {
    return {
        x: zone.x + Math.random() * zone.width,
        y: zone.y + Math.random() * zone.height,
    };
}

export interface ScribbleAnimation {
    assetIndex: number;
    startFrame: number;
    endFrame: number;
    x: number;
    y: number;
    rotation: number;
    scale: number;
}

/**
 * Generate scribble animation sequence
 * Each scribble appears for 2-6 frames with random transforms
 */
export function generateScribbleSequence(
    totalFrames: number,
    scribbleCount: number,
    safeZones: SafeZone[],
    density: 'low' | 'medium' | 'high' = 'medium'
): ScribbleAnimation[] {
    const animations: ScribbleAnimation[] = [];

    // Determine number of concurrent scribbles based on density
    const concurrentScribbles = density === 'low' ? 3 : density === 'medium' ? 6 : 10;

    // Duration each scribble is visible (in frames)
    const minDuration = 2;
    const maxDuration = 6;

    let currentFrame = 0;

    while (currentFrame < totalFrames) {
        // Add batch of scribbles
        for (let i = 0; i < concurrentScribbles; i++) {
            const duration = Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;
            const randomZone = safeZones[Math.floor(Math.random() * safeZones.length)];
            const position = getRandomPositionInZone(randomZone);

            animations.push({
                assetIndex: Math.floor(Math.random() * scribbleCount),
                startFrame: currentFrame,
                endFrame: currentFrame + duration,
                x: position.x,
                y: position.y,
                rotation: (Math.random() - 0.5) * 6, // ±3 degrees
                scale: 0.95 + Math.random() * 0.1, // 0.95 to 1.05
            });
        }

        currentFrame += Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;
    }

    return animations;
}

/**
 * Create jitter transform for animation
 * Adds subtle position noise to create hand-drawn feel
 */
export function createJitterTransform(baseX: number, baseY: number, intensity: number = 1): { x: number; y: number } {
    const jitterAmount = 2 * intensity; // pixels
    return {
        x: baseX + (Math.random() - 0.5) * jitterAmount,
        y: baseY + (Math.random() - 0.5) * jitterAmount,
    };
}

/**
 * Build paper frame crossfade sequence
 * Returns timing for when to switch between paper frames
 */
export function buildPaperFrameCrossfade(totalDuration: number, frameCount: number): number[] {
    const switchPoints: number[] = [];
    const switchInterval = totalDuration / frameCount; // Switch every N seconds

    for (let i = 1; i < frameCount; i++) {
        switchPoints.push(i * switchInterval);
    }

    return switchPoints;
}
