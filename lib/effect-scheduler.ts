/**
 * Intelligent Effect Timeline Scheduler
 * 
 * Generates organic, non-predictable timing for overlay effects
 * based on video duration and energy level.
 */

export interface ScribbleBurst {
    startTime: number;
    duration: number;
    density: 'sparse' | 'medium' | 'dense';
    scribbleIndices: number[]; // Which scribbles to show in this burst
    staggerDelay: number; // Delay between each scribble appearing
}

export interface PaperAppearance {
    startTime: number;
    duration: number;
    variant: number;
    fadeInDuration: number;
    fadeOutDuration: number;
    position: { x: number; y: number };
    rotation: number;
    scale: number;
}

export interface EffectTimeline {
    scribbleBursts: ScribbleBurst[];
    paperAppearances: PaperAppearance[];
    totalDuration: number;
    energyLevel: 'calm' | 'moderate' | 'energetic';
}

export interface EffectConfig {
    paper: {
        minVisibleDuration: number;
        maxVisibleDuration: number;
        minGapDuration: number;
        maxGapDuration: number;
        appearanceChance: number;
    };
    scribbles: {
        burstMinDuration: number;
        burstMaxDuration: number;
        quietMinDuration: number;
        quietMaxDuration: number;
        minDensity: number;
        maxDensity: number;
    };
}

// Seeded random for reproducible results
function seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}

/**
 * Generate intelligent effect timeline based on video duration and energy
 */
export function generateEffectTimeline(
    videoDuration: number,
    energyLevel: 'calm' | 'moderate' | 'energetic',
    totalScribbles: number,
    totalPaperVariants: number,
    config: EffectConfig,
    seed: number = Date.now()
): EffectTimeline {
    const random = seededRandom(seed);
    
    // Adjust config based on energy level
    const energyMultipliers = {
        calm: { burstFreq: 0.6, burstDensity: 0.5, paperFreq: 0.5, quietBonus: 1.5 },
        moderate: { burstFreq: 1.0, burstDensity: 1.0, paperFreq: 1.0, quietBonus: 1.0 },
        energetic: { burstFreq: 1.5, burstDensity: 1.4, paperFreq: 1.3, quietBonus: 0.6 }
    };
    const multiplier = energyMultipliers[energyLevel];
    
    // Generate scribble bursts
    const scribbleBursts = generateScribbleBursts(
        videoDuration,
        totalScribbles,
        config.scribbles,
        multiplier,
        random
    );
    
    // Generate paper appearances
    const paperAppearances = generatePaperAppearances(
        videoDuration,
        totalPaperVariants,
        config.paper,
        multiplier,
        random
    );
    
    return {
        scribbleBursts,
        paperAppearances,
        totalDuration: videoDuration,
        energyLevel
    };
}

/**
 * Generate scribble burst schedule
 * Creates organic bursts of scribble activity with quiet periods
 */
function generateScribbleBursts(
    duration: number,
    totalScribbles: number,
    config: EffectConfig['scribbles'],
    multiplier: { burstFreq: number; burstDensity: number; quietBonus: number },
    random: () => number
): ScribbleBurst[] {
    const bursts: ScribbleBurst[] = [];
    let currentTime = 0;
    
    // Start with a small delay (not immediate)
    currentTime += 0.2 + random() * 0.5;
    
    while (currentTime < duration - 0.5) {
        // Decide: burst or quiet period?
        const isBurst = random() < (0.65 * multiplier.burstFreq);
        
        if (isBurst) {
            // Create a burst
            const burstDuration = config.burstMinDuration + 
                random() * (config.burstMaxDuration - config.burstMinDuration);
            
            // Determine density for this burst
            const densityRoll = random() * multiplier.burstDensity;
            let density: 'sparse' | 'medium' | 'dense';
            let scribbleCount: number;
            
            if (densityRoll < 0.3) {
                density = 'sparse';
                scribbleCount = config.minDensity + Math.floor(random() * 3);
            } else if (densityRoll < 0.75) {
                density = 'medium';
                scribbleCount = Math.floor(config.minDensity + (config.maxDensity - config.minDensity) * 0.4);
                scribbleCount += Math.floor(random() * 4) - 2;
            } else {
                density = 'dense';
                scribbleCount = Math.floor(config.maxDensity * 0.7 + random() * config.maxDensity * 0.3);
            }
            
            // Clamp scribble count
            scribbleCount = Math.max(config.minDensity, Math.min(config.maxDensity, scribbleCount));
            
            // Select random scribbles for this burst (different each time)
            const scribbleIndices: number[] = [];
            const availableIndices = Array.from({ length: totalScribbles }, (_, i) => i);
            for (let i = 0; i < scribbleCount && availableIndices.length > 0; i++) {
                const idx = Math.floor(random() * availableIndices.length);
                scribbleIndices.push(availableIndices[idx]);
                availableIndices.splice(idx, 1);
            }
            
            // Stagger delay - scribbles don't all appear at once
            const staggerDelay = density === 'dense' 
                ? 0.02 + random() * 0.03 
                : density === 'medium'
                    ? 0.03 + random() * 0.05
                    : 0.05 + random() * 0.08;
            
            bursts.push({
                startTime: currentTime,
                duration: burstDuration,
                density,
                scribbleIndices,
                staggerDelay
            });
            
            currentTime += burstDuration;
        }
        
        // Add quiet period (gap)
        const quietDuration = (config.quietMinDuration + 
            random() * (config.quietMaxDuration - config.quietMinDuration)) * multiplier.quietBonus;
        currentTime += quietDuration;
        
        // Occasionally add extra long quiet period for breathing room
        if (random() < 0.15 * multiplier.quietBonus) {
            currentTime += 0.5 + random() * 1.0;
        }
    }
    
    return bursts;
}

/**
 * Generate paper appearance schedule
 * Papers appear and disappear randomly, not always visible
 */
function generatePaperAppearances(
    duration: number,
    totalVariants: number,
    config: EffectConfig['paper'],
    multiplier: { paperFreq: number; quietBonus: number },
    random: () => number
): PaperAppearance[] {
    const appearances: PaperAppearance[] = [];
    let currentTime = 0;
    let lastVariant = -1;
    
    // Small initial delay
    currentTime += 0.3 + random() * 0.7;
    
    while (currentTime < duration - config.minVisibleDuration) {
        // Decide if paper appears in this slot
        if (random() < config.appearanceChance * multiplier.paperFreq) {
            // Paper appears
            const visibleDuration = config.minVisibleDuration + 
                random() * (config.maxVisibleDuration - config.minVisibleDuration);
            
            // Pick a different variant than last time
            let variant = Math.floor(random() * totalVariants);
            if (variant === lastVariant && totalVariants > 1) {
                variant = (variant + 1) % totalVariants;
            }
            lastVariant = variant;
            
            // Random fade durations
            const fadeInDuration = 0.15 + random() * 0.25;
            const fadeOutDuration = 0.2 + random() * 0.3;
            
            // Random position offset (subtle movement)
            const position = {
                x: (random() - 0.5) * 20, // -10 to +10 pixels
                y: (random() - 0.5) * 16  // -8 to +8 pixels
            };
            
            // Random rotation (subtle)
            const rotation = (random() - 0.5) * 4; // -2 to +2 degrees
            
            // Random scale (subtle)
            const scale = 0.98 + random() * 0.04; // 0.98 to 1.02
            
            appearances.push({
                startTime: currentTime,
                duration: visibleDuration,
                variant,
                fadeInDuration,
                fadeOutDuration,
                position,
                rotation,
                scale
            });
            
            currentTime += visibleDuration;
        }
        
        // Gap before next potential appearance
        const gapDuration = config.minGapDuration + 
            random() * (config.maxGapDuration - config.minGapDuration);
        currentTime += gapDuration * multiplier.quietBonus;
        
        // Occasionally add longer gap
        if (random() < 0.2) {
            currentTime += 0.8 + random() * 1.5;
        }
    }
    
    return appearances;
}

/**
 * Check if a scribble should be visible at given time
 * Returns opacity (0-1) or null if not visible
 */
export function getScribbleVisibility(
    scribbleIndex: number,
    time: number,
    timeline: EffectTimeline
): { visible: boolean; opacity: number; burstIndex: number } | null {
    for (let i = 0; i < timeline.scribbleBursts.length; i++) {
        const burst = timeline.scribbleBursts[i];
        const indexInBurst = burst.scribbleIndices.indexOf(scribbleIndex);
        
        if (indexInBurst === -1) continue;
        
        // Calculate staggered start time for this scribble
        const staggeredStart = burst.startTime + indexInBurst * burst.staggerDelay;
        const endTime = burst.startTime + burst.duration;
        
        if (time >= staggeredStart && time <= endTime) {
            // Calculate fade in/out
            const fadeIn = 0.08;
            const fadeOut = 0.12;
            
            let opacity = 1.0;
            const elapsed = time - staggeredStart;
            const remaining = endTime - time;
            
            if (elapsed < fadeIn) {
                opacity = elapsed / fadeIn;
            } else if (remaining < fadeOut) {
                opacity = remaining / fadeOut;
            }
            
            return { visible: true, opacity, burstIndex: i };
        }
    }
    
    return null;
}

/**
 * Get paper visibility at given time
 * Returns appearance info or null if no paper visible
 */
export function getPaperVisibility(
    time: number,
    timeline: EffectTimeline
): PaperAppearance & { opacity: number } | null {
    for (const appearance of timeline.paperAppearances) {
        const endTime = appearance.startTime + appearance.duration;
        
        if (time >= appearance.startTime && time <= endTime) {
            const elapsed = time - appearance.startTime;
            const remaining = endTime - time;
            
            let opacity = 1.0;
            
            if (elapsed < appearance.fadeInDuration) {
                opacity = elapsed / appearance.fadeInDuration;
            } else if (remaining < appearance.fadeOutDuration) {
                opacity = remaining / appearance.fadeOutDuration;
            }
            
            return { ...appearance, opacity };
        }
    }
    
    return null;
}

/**
 * Generate FFmpeg enable expression for a scribble
 * Creates a complex expression that shows scribble only during its assigned bursts
 */
export function generateScribbleEnableExpr(
    scribbleIndex: number,
    timeline: EffectTimeline
): string {
    const conditions: string[] = [];
    
    for (const burst of timeline.scribbleBursts) {
        const indexInBurst = burst.scribbleIndices.indexOf(scribbleIndex);
        if (indexInBurst === -1) continue;
        
        const staggeredStart = burst.startTime + indexInBurst * burst.staggerDelay;
        const endTime = burst.startTime + burst.duration;
        
        // between(t, start, end)
        conditions.push(`between(t,${staggeredStart.toFixed(3)},${endTime.toFixed(3)})`);
    }
    
    if (conditions.length === 0) {
        return '0'; // Never visible
    }
    
    // Combine with OR (max of all conditions)
    if (conditions.length === 1) {
        return conditions[0];
    }
    
    // FFmpeg doesn't have OR, use max() or addition
    // For boolean conditions, max works as OR
    return conditions.join('+') + '>0';
}

/**
 * Generate FFmpeg enable expression for a paper appearance
 */
export function generatePaperEnableExpr(
    appearanceIndex: number,
    timeline: EffectTimeline
): string {
    if (appearanceIndex >= timeline.paperAppearances.length) {
        return '0';
    }
    
    const appearance = timeline.paperAppearances[appearanceIndex];
    const endTime = appearance.startTime + appearance.duration;
    
    return `between(t,${appearance.startTime.toFixed(3)},${endTime.toFixed(3)})`;
}

/**
 * Generate FFmpeg alpha/opacity expression for smooth fade
 */
export function generateFadeExpr(
    startTime: number,
    duration: number,
    fadeIn: number,
    fadeOut: number
): string {
    const endTime = startTime + duration;
    
    // Smooth fade using if/else logic in FFmpeg
    // if(t < startTime + fadeIn, (t - startTime) / fadeIn, 
    //    if(t > endTime - fadeOut, (endTime - t) / fadeOut, 1))
    return `if(lt(t,${(startTime + fadeIn).toFixed(3)}),` +
           `(t-${startTime.toFixed(3)})/${fadeIn.toFixed(3)},` +
           `if(gt(t,${(endTime - fadeOut).toFixed(3)}),` +
           `(${endTime.toFixed(3)}-t)/${fadeOut.toFixed(3)},1))`;
}

/**
 * Default effect configuration
 */
export const defaultEffectConfig: EffectConfig = {
    paper: {
        minVisibleDuration: 1.0,
        maxVisibleDuration: 4.0,
        minGapDuration: 0.5,
        maxGapDuration: 3.0,
        appearanceChance: 0.7,
    },
    scribbles: {
        burstMinDuration: 0.3,
        burstMaxDuration: 1.5,
        quietMinDuration: 0.2,
        quietMaxDuration: 1.0,
        minDensity: 2,
        maxDensity: 18,
    }
};
