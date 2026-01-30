import ffmpeg from 'fluent-ffmpeg';
import { config } from './config';
import { ScribbleAnimation } from './overlay-animator';
import { EffectTimeline, generateEffectTimeline, defaultEffectConfig } from './effect-scheduler';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import { writeFile, unlink } from 'fs/promises';

const execAsync = promisify(exec);

export interface VideoInfo {
    duration: number;
    fps: number;
    width: number;
    height: number;
    codec: string;
}

/**
 * Extract video metadata using ffprobe
 */
export async function extractVideoInfo(videoPath: string): Promise<VideoInfo> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                reject(err);
                return;
            }

            const videoStream = metadata.streams.find(s => s.codec_type === 'video');
            if (!videoStream) {
                reject(new Error('No video stream found'));
                return;
            }

            resolve({
                duration: metadata.format.duration || 0,
                fps: eval(videoStream.r_frame_rate || '30/1'),
                width: videoStream.width || 1280,
                height: videoStream.height || 720,
                codec: videoStream.codec_name || 'unknown',
            });
        });
    });
}

/**
 * Composite overlays onto video using FFmpeg
 * 
 * Layer order (bottom to top):
 * 1. Paper collage background (INTELLIGENT: random timing, fade in/out, gaps)
 * 2. Scribbles (INTELLIGENT: burst-based, varying density, quiet periods)
 * 3. Subject foreground (with transparency)
 * 4. White outline
 */
export async function compositeOverlays(
    inputPath: string,
    outputPath: string,
    scribbleAnimations: ScribbleAnimation[],
    paperFramePaths: string[],
    scribblePaths: string[],
    cornerPath: string | null,
    videoInfo: VideoInfo,
    onProgress?: (percent: number) => void,
    subjectBounds?: { x: number; y: number; width?: number; height?: number },
    humanOutlinePath?: string | null,
    energyLevel: 'calm' | 'moderate' | 'energetic' = 'moderate',
    foregroundPath?: string | null,
    shadowPath?: string | null,
    effectTimeline?: EffectTimeline | null
): Promise<void> {
    return new Promise(async (resolve, reject) => {
        const fs = require('fs').promises;
        const existingPaperFrames: string[] = [];
        const existingScribbles: string[] = [];
        let existingCorner: string | null = null;
        let existingOutline: string | null = null;

        // Verify paper frames exist
        for (const p of paperFramePaths) {
            try {
                await fs.access(p);
                existingPaperFrames.push(p);
            } catch {
                console.warn(`Paper frame not found: ${p}`);
            }
        }

        // Verify scribbles exist
        for (const p of scribblePaths) {
            try {
                await fs.access(p);
                existingScribbles.push(p);
            } catch {
                console.warn(`Scribble not found: ${p}`);
            }
        }

        // Verify corner exists
        if (cornerPath) {
            try {
                await fs.access(cornerPath);
                existingCorner = cornerPath;
            } catch {
                console.warn(`Corner separator not found: ${cornerPath}`);
            }
        }

        // Verify human outline exists
        if (humanOutlinePath) {
            try {
                await fs.access(humanOutlinePath);
                existingOutline = humanOutlinePath;
            } catch {
                console.warn(`Human outline not found: ${humanOutlinePath}`);
            }
        }

        // Verify foreground exists
        let existingForeground: string | null = null;
        if (foregroundPath) {
            try {
                await fs.access(foregroundPath);
                existingForeground = foregroundPath;
            } catch {
                console.warn(`Foreground not found: ${foregroundPath}`);
            }
        }

        // Verify shadow exists
        let existingShadow: string | null = null;
        if (shadowPath) {
            try {
                await fs.access(shadowPath);
                existingShadow = shadowPath;
            } catch {
                console.warn(`Shadow not found: ${shadowPath}`);
            }
        }

        // Generate effect timeline if not provided
        const timeline = effectTimeline || generateEffectTimeline(
            videoInfo.duration,
            energyLevel,
            existingScribbles.length,
            existingPaperFrames.length,
            config.effects || defaultEffectConfig
        );

        // Build filter with only inputs we actually have (corner/paper/scribbles filtered by fs.access)
        const filterComplex = createAnimatedFilterComplex(
            scribbleAnimations,
            existingPaperFrames,
            existingScribbles,
            existingCorner, // use existingCorner so filter only expects corner when file exists
            videoInfo,
            subjectBounds,
            existingOutline,
            energyLevel,
            existingForeground,
            existingShadow,
            timeline
        );

        console.log('FFmpeg inputs:', {
            video: inputPath,
            foreground: existingForeground ? 1 : 0,
            outline: existingOutline ? 1 : 0,
            shadow: existingShadow ? 1 : 0,
            paperFrames: existingPaperFrames.length,
            scribbles: existingScribbles.length,
            corner: existingCorner ? 1 : 0,
        });

        // Write filter to temp file to avoid command-line length limits (huge filter graph)
        const filterScriptPath = path.join(os.tmpdir(), `ffmpeg-filter-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
        await writeFile(filterScriptPath, filterComplex, 'utf8');

        const cleanupFilterScript = () => {
            unlink(filterScriptPath).catch(() => { });
        };

        const command = ffmpeg(inputPath);

        // Add foreground video (input 1 if exists)
        if (existingForeground) {
            command.input(existingForeground);
        }

        // Add outline video
        if (existingOutline) {
            command.input(existingOutline);
        }

        // Add shadow video
        if (existingShadow) {
            command.input(existingShadow);
        }

        // Add paper frame inputs
        existingPaperFrames.forEach((p) => {
            command.input(p);
        });

        // Add scribble inputs
        existingScribbles.forEach((p) => {
            command.input(p);
        });

        // Add corner separator if exists
        if (existingCorner) {
            command.input(existingCorner);
        }

        command
            .outputOptions([
                '-filter_complex_script', filterScriptPath,
                '-map', '[output]',
                '-map', '0:a?',
                '-c:v', 'libx264',
                '-preset', 'ultrafast', // Optimized: faster encoding
                '-crf', '23',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-t', String(videoInfo.duration),
            ])
            .output(outputPath);

        if (onProgress) {
            command.on('progress', (progress) => {
                if (progress.percent) {
                    onProgress(progress.percent);
                }
            });
        }

        command
            .on('start', (cmdLine) => {
                console.log('FFmpeg command (filter from script):', cmdLine);
                console.log('Filter script path (for debugging):', filterScriptPath);
            })
            .on('end', () => {
                cleanupFilterScript();
                resolve();
            })
            .on('error', async (err: Error & { stdout?: string; stderr?: string }) => {
                // DON'T cleanup on error - keep for debugging
                console.error('FFmpeg error:', err.message);
                console.error('FFmpeg stderr:', err.stderr || '(no stderr)');
                console.error('Filter script kept at:', filterScriptPath);

                // Try to copy filter script to output dir for easier access
                try {
                    const debugFilterPath = path.join(config.api.outputDir, 'debug-filter-script.txt');
                    const filterContent = await fs.readFile(filterScriptPath, 'utf8');
                    await writeFile(debugFilterPath, filterContent, 'utf8');
                    console.error('Filter script copied to:', debugFilterPath);
                } catch (copyErr) {
                    console.error('Failed to copy filter script:', copyErr);
                }

                reject(new Error(err.stderr || err.message));
            })
            .run();
    });
}

/**
 * Create animated FFmpeg filter complex with INTELLIGENT EFFECT STACK:
 * 
 * Layer order (bottom to top):
 * 1. Paper collage background (INTELLIGENT: random timing, fade in/out, gaps between appearances)
 * 2. Scribbles with INTELLIGENT BURSTS (varying density, quiet periods, staggered appearance)
 * 3. DROP SHADOW (soft, offset)
 * 4. Subject foreground (with alpha)
 * 5. WHITE OUTLINE (with drips + wobble from Python)
 * 6. Corner effect
 * 7. Post-processing (grain, vignette, color grade)
 * 8. TRUE 15fps stop-motion output
 */
export function createAnimatedFilterComplex(
    scribbleAnimations: ScribbleAnimation[],
    paperFramePaths: string[],
    scribblePaths: string[],
    cornerPath: string | null,
    videoInfo: VideoInfo,
    subjectBounds?: { x: number; y: number; width?: number; height?: number },
    humanOutlinePath?: string | null,
    energyLevel: 'calm' | 'moderate' | 'energetic' = 'moderate',
    foregroundPath?: string | null,
    shadowPath?: string | null,
    effectTimeline?: EffectTimeline | null
): string {
    const filters: string[] = [];
    const width = 1280;
    const height = 720;

    // Helper for safe floating point values
    const safeFloat = (n: number, defaultVal: number = 0): number => {
        return (typeof n === 'number' && !isNaN(n) && isFinite(n)) ? n : defaultVal;
    };

    // Helper for safe time formatting
    const safeTime = (t: number): string => {
        return safeFloat(t).toFixed(3);
    };

    // Calculate input indices based on what's available
    // Order: [0]=video, [1]=foreground, [2]=outline, [3]=shadow, then papers, scribbles, corner
    let nextInputIdx = 1;
    const foregroundInputIdx = foregroundPath ? nextInputIdx++ : -1;
    const outlineInputIdx = humanOutlinePath ? nextInputIdx++ : -1;
    const shadowInputIdx = shadowPath ? nextInputIdx++ : -1;
    const paperInputStart = nextInputIdx;
    nextInputIdx += paperFramePaths.length;
    const scribbleInputStart = nextInputIdx;
    nextInputIdx += scribblePaths.length;
    const cornerInputIdx = cornerPath ? nextInputIdx : -1;

    console.log('Filter input indices:', { foregroundInputIdx, outlineInputIdx, shadowInputIdx, paperInputStart, scribbleInputStart, cornerInputIdx });

    // Get subject center and no-doodle region (subject + 15% padding) for placement
    // Get subject center and no-doodle region (subject + 15% padding) for placement
    const subjectCenterX = safeFloat(subjectBounds ? (subjectBounds.x + (subjectBounds.width || 0.3) / 2) * width : width * 0.4, width * 0.4);
    const subjectCenterY = safeFloat(subjectBounds ? (subjectBounds.y + (subjectBounds.height || 1) / 2) * height : height * 0.5, height * 0.5);
    const subW = safeFloat((subjectBounds?.width ?? 0.3) * width, width * 0.3);
    const subH = safeFloat((subjectBounds?.height ?? 0.6) * height, height * 0.6);
    const pad = 0.06; // 6% padding so scribbles can sit closer to subject (not far from object)
    const subjectLeft = safeFloat((subjectBounds?.x ?? 0.35) * width - subW * pad, width * 0.3);
    const subjectRight = safeFloat((subjectBounds?.x ?? 0.35) * width + subW + subW * pad, width * 0.7);
    const subjectTop = safeFloat((subjectBounds?.y ?? 0.2) * height - subH * pad, height * 0.2);
    const subjectBottom = safeFloat((subjectBounds?.y ?? 0.2) * height + subH + subH * pad, height * 0.8);
    /** Push (x,y) to nearest edge of subject region if inside (so doodles stay off subject) */
    const clampOutsideSubject = (x: number, y: number): { x: number; y: number } => {
        if (typeof x !== 'number' || isNaN(x)) x = 0;
        if (typeof y !== 'number' || isNaN(y)) y = 0;

        if (x < subjectLeft || x > subjectRight || y < subjectTop || y > subjectBottom) return { x, y };
        const dL = x - subjectLeft, dR = subjectRight - x, dT = y - subjectTop, dB = subjectBottom - y;
        const min = Math.min(dL, dR, dT, dB);
        if (min === dL) return { x: subjectLeft - 5, y };
        if (min === dR) return { x: subjectRight + 5, y };
        if (min === dT) return { x, y: subjectTop - 5 };
        return { x, y: subjectBottom + 5 };
    };

    // 1. Scale base video - preserve original with warm paper-like padding
    filters.push(`[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=#F8F4EC,setsar=1[base_scaled]`);

    // ENHANCED: More vibrant color grade for doodles to POP
    filters.push(`[base_scaled]eq=saturation=1.12:contrast=1.08:brightness=0.03[base_color]`);
    filters.push(`[base_color]colorbalance=rs=0.05:gs=0.03:bs=-0.04[base]`);

    let currentLayer = 'base';

    // 2. INTELLIGENT PAPER FRAMES - random appearances with fade, gaps, varying styles
    if (paperFramePaths.length > 0 && effectTimeline && effectTimeline.paperAppearances.length > 0) {
        const numPapers = paperFramePaths.length;

        console.log(`Intelligent paper: ${effectTimeline.paperAppearances.length} appearances scheduled (not always visible)`);

        // Group appearances by variant
        const appearancesByVariant: Map<number, typeof effectTimeline.paperAppearances> = new Map();
        effectTimeline.paperAppearances.forEach(app => {
            const variant = app.variant % numPapers;
            if (!appearancesByVariant.has(variant)) {
                appearancesByVariant.set(variant, []);
            }
            appearancesByVariant.get(variant)!.push(app);
        });

        // Scale ALL paper frames (FFmpeg needs all inputs processed)
        for (let i = 0; i < numPapers; i++) {
            filters.push(`[${paperInputStart + i}:v]scale=${width}:${height},format=rgba[paper${i}_base]`);
        }

        // Apply ALL papers with enable expressions (unused ones have enable=0)
        for (let i = 0; i < numPapers; i++) {
            const appearances = appearancesByVariant.get(i);
            let enableExpr: string;
            let pattern: { x: string; y: string };

            if (appearances && appearances.length > 0) {
                // Build enable expression for used papers
                const enableConditions = appearances
                    .filter(app => app.duration > 0) // Safety: ensure duration is positive
                    .map(app => {
                        let endTime = app.startTime + app.duration;
                        // Ensure strict inequality for between()
                        if (endTime <= app.startTime) endTime = app.startTime + 0.001;
                        return `between(t,${safeTime(app.startTime)},${safeTime(endTime)})`;
                    });

                // If all appearances were invalid, disable this paper
                if (enableConditions.length === 0) {
                    enableExpr = '0';
                    pattern = { x: '0', y: '0' };
                } else {
                    enableExpr = enableConditions.length === 1
                        ? enableConditions[0]
                        : `(${enableConditions.join('+')})`;

                    const baseApp = appearances[0];
                    const movePatterns = [
                        { x: `${Math.floor(baseApp.position.x)}+5*sin(t*3.5)`, y: `${Math.floor(baseApp.position.y)}+4*cos(t*3)` },
                        { x: `${Math.floor(baseApp.position.x)}+6*cos(t*4+1)`, y: `${Math.floor(baseApp.position.y)}+5*sin(t*3.5+0.5)` },
                        { x: `${Math.floor(baseApp.position.x)}+4*sin(t*5+2)`, y: `${Math.floor(baseApp.position.y)}+6*cos(t*4+1)` },
                        { x: `${Math.floor(baseApp.position.x)}+7*cos(t*3+3)`, y: `${Math.floor(baseApp.position.y)}+4*sin(t*4+2)` },
                    ];
                    pattern = movePatterns[i % movePatterns.length];
                }
            } else {
                // Unused paper - always disabled
                enableExpr = '0';
                pattern = { x: '0', y: '0' };
            }

            const layerName = `paper_layer${i}`;
            filters.push(`[${currentLayer}][paper${i}_base]overlay=x='${pattern.x}':y='${pattern.y}':enable='${enableExpr}':eof_action=repeat:format=auto[${layerName}]`);
            currentLayer = layerName;
        }
    } else if (paperFramePaths.length > 0) {
        // Fallback: simple cycling if no timeline provided
        const numPapers = paperFramePaths.length;
        for (let i = 0; i < numPapers; i++) {
            filters.push(`[${paperInputStart + i}:v]scale=${width}:${height},format=rgba[paper${i}_scaled]`);
        }

        const paperCycleDuration = 2.5;
        const totalCycle = numPapers * paperCycleDuration;

        for (let i = 0; i < numPapers; i++) {
            const offset = i * paperCycleDuration;
            const startStr = safeTime(offset);
            const endStr = safeTime(offset + paperCycleDuration);
            const cycleStr = safeTime(totalCycle);

            const enableExpr = `between(mod(t,${cycleStr}),${startStr},${endStr})`;
            const layerName = `paper_layer${i}`;
            filters.push(`[${currentLayer}][paper${i}_scaled]overlay=x=0:y=0:enable='${enableExpr}':eof_action=repeat:format=auto[${layerName}]`);
            currentLayer = layerName;
        }
    }

    // 3. Soft vignette for depth
    filters.push(`[${currentLayer}]vignette=angle='PI/4':mode=backward:eval=frame[with_vignette]`);
    currentLayer = 'with_vignette';

    // 4. INTELLIGENT SCRIBBLES - burst-based, full-screen coverage (except subject), many scribbles
    const energyMultiplier = energyLevel === 'energetic' ? 1.4 : energyLevel === 'calm' ? 0.7 : 1.0;

    // Full-screen placement zones: cover entire frame except subject center (subject stays clear)
    // Zones are offsets from subject center; large offsets fill left/right/top/bottom
    // LARGER SIZES: Bold, highlighter-like doodles like reference images
    const placementZones = [
        // Top strip (above subject) - BOLD sizes (2.5x larger)
        { offsetX: 0, offsetY: -320, sizeMin: 85, sizeMax: 160 },
        { offsetX: -120, offsetY: -300, sizeMin: 75, sizeMax: 150 },
        { offsetX: 120, offsetY: -300, sizeMin: 75, sizeMax: 150 },
        { offsetX: -220, offsetY: -280, sizeMin: 100, sizeMax: 175 },
        { offsetX: 220, offsetY: -280, sizeMin: 100, sizeMax: 175 },
        { offsetX: -350, offsetY: -260, sizeMin: 80, sizeMax: 145 },
        { offsetX: 350, offsetY: -260, sizeMin: 80, sizeMax: 145 },
        { offsetX: -450, offsetY: -220, sizeMin: 70, sizeMax: 135 },
        { offsetX: 450, offsetY: -220, sizeMin: 70, sizeMax: 135 },
        { offsetX: -550, offsetY: -180, sizeMin: 60, sizeMax: 125 },
        { offsetX: 550, offsetY: -180, sizeMin: 60, sizeMax: 125 },
        // Bottom strip (below subject) - BOLD sizes
        { offsetX: 0, offsetY: 320, sizeMin: 85, sizeMax: 160 },
        { offsetX: -120, offsetY: 300, sizeMin: 75, sizeMax: 150 },
        { offsetX: 120, offsetY: 300, sizeMin: 75, sizeMax: 150 },
        { offsetX: -220, offsetY: 280, sizeMin: 100, sizeMax: 175 },
        { offsetX: 220, offsetY: 280, sizeMin: 100, sizeMax: 175 },
        { offsetX: -350, offsetY: 260, sizeMin: 80, sizeMax: 145 },
        { offsetX: 350, offsetY: 260, sizeMin: 80, sizeMax: 145 },
        { offsetX: -450, offsetY: 220, sizeMin: 70, sizeMax: 135 },
        { offsetX: 450, offsetY: 220, sizeMin: 70, sizeMax: 135 },
        { offsetX: -550, offsetY: 180, sizeMin: 60, sizeMax: 125 },
        { offsetX: 550, offsetY: 180, sizeMin: 60, sizeMax: 125 },
        // Left strip (full height) - BOLD sizes
        { offsetX: -580, offsetY: -240, sizeMin: 95, sizeMax: 170 },
        { offsetX: -560, offsetY: -80, sizeMin: 100, sizeMax: 180 },
        { offsetX: -570, offsetY: 80, sizeMin: 95, sizeMax: 170 },
        { offsetX: -550, offsetY: 240, sizeMin: 85, sizeMax: 155 },
        { offsetX: -480, offsetY: -180, sizeMin: 80, sizeMax: 150 },
        { offsetX: -470, offsetY: 0, sizeMin: 90, sizeMax: 165 },
        { offsetX: -480, offsetY: 180, sizeMin: 80, sizeMax: 150 },
        // Right strip (full height) - BOLD sizes
        { offsetX: 580, offsetY: -240, sizeMin: 95, sizeMax: 170 },
        { offsetX: 560, offsetY: -80, sizeMin: 100, sizeMax: 180 },
        { offsetX: 570, offsetY: 80, sizeMin: 95, sizeMax: 170 },
        { offsetX: 550, offsetY: 240, sizeMin: 85, sizeMax: 155 },
        { offsetX: 480, offsetY: -180, sizeMin: 80, sizeMax: 150 },
        { offsetX: 470, offsetY: 0, sizeMin: 90, sizeMax: 165 },
        { offsetX: 480, offsetY: 180, sizeMin: 80, sizeMax: 150 },
        // Corners (dense coverage) - BOLD sizes
        { offsetX: -520, offsetY: -300, sizeMin: 75, sizeMax: 145 },
        { offsetX: 520, offsetY: -300, sizeMin: 75, sizeMax: 145 },
        { offsetX: -520, offsetY: 300, sizeMin: 75, sizeMax: 145 },
        { offsetX: 520, offsetY: 300, sizeMin: 75, sizeMax: 145 },
        // Mid-left / mid-right (between subject and edges) - BOLD sizes
        { offsetX: -380, offsetY: -140, sizeMin: 85, sizeMax: 160 },
        { offsetX: -360, offsetY: 140, sizeMin: 85, sizeMax: 160 },
        { offsetX: 380, offsetY: -140, sizeMin: 85, sizeMax: 160 },
        { offsetX: 360, offsetY: 140, sizeMin: 85, sizeMax: 160 },
        // Extra variety around subject (but not on subject) - BOLD sizes
        { offsetX: -200, offsetY: -220, sizeMin: 80, sizeMax: 150 },
        { offsetX: 200, offsetY: -220, sizeMin: 80, sizeMax: 150 },
        { offsetX: -200, offsetY: 220, sizeMin: 80, sizeMax: 150 },
        { offsetX: 200, offsetY: 220, sizeMin: 80, sizeMax: 150 },
    ];

    if (scribblePaths.length > 0 && effectTimeline && effectTimeline.scribbleBursts.length > 0) {
        // REFERENCE STYLE: Dense full-screen coverage like target images
        // 1. PERSISTENT LAYER: Always-on scribbles covering entire frame (except subject)
        const PERSISTENT_SCRIBBLE_COUNT = 30; // REDUCED: 150 was causing FFmpeg 221 errors
        type MotionType = 'orbit' | 'drift' | 'wave';
        const persistentConfigs: Array<{
            x: number; y: number;
            size: number; scribIdx: number;
            enableExpr: string;
            motionType: MotionType;
            travelX: number; travelY: number;
            speedX: number; speedY: number;
            phase: number;
        }> = [];
        for (let i = 0; i < PERSISTENT_SCRIBBLE_COUNT; i++) {
            const zone = placementZones[i % placementZones.length];
            const seed = i * 7919;
            const pseudoRand1 = Math.sin(seed * 12.9898) * 0.5 + 0.5;
            const pseudoRand2 = Math.sin(seed * 78.233) * 0.5 + 0.5;
            const pseudoRand3 = Math.sin(seed * 43.758) * 0.5 + 0.5;
            let x = subjectCenterX + zone.offsetX + (pseudoRand1 - 0.5) * 100;
            let y = subjectCenterY + zone.offsetY + (pseudoRand2 - 0.5) * 80;
            ({ x, y } = clampOutsideSubject(x, y));
            x = Math.max(-60, Math.min(width + 40, x));
            y = Math.max(-60, Math.min(height + 40, y));
            const size = zone.sizeMin + pseudoRand3 * (zone.sizeMax - zone.sizeMin);
            // Full travel: doodles MOVE across frame (every frame different)—orbit, drift, or wave
            const motionChoice = i % 5;
            const motionType: MotionType = motionChoice === 0 ? 'drift' : motionChoice === 1 ? 'wave' : 'orbit';
            const travelX = (180 + pseudoRand1 * 140) * energyMultiplier; // Large = crosses frame
            const travelY = (140 + pseudoRand2 * 110) * energyMultiplier;
            const speedX = (2.2 + pseudoRand1 * 1.8); // FASTER: Increased for more dynamic animation
            const speedY = (1.9 + pseudoRand2 * 1.6); // FASTER: Increased for more dynamic animation
            persistentConfigs.push({
                x, y,
                size: Math.floor(safeFloat(size, 50)),
                scribIdx: i % scribblePaths.length,
                enableExpr: '1',
                motionType,
                travelX: safeFloat(travelX), travelY: safeFloat(travelY),
                speedX: safeFloat(speedX), speedY: safeFloat(speedY),
                phase: safeFloat(i * 2.7 + (i % Math.max(1, scribblePaths.length)) * 0.5) // Desync
            });
        }
        // 2. BURST LAYER: Timeline-based scribbles for "running changing" dynamism
        console.log(`Scribbles: ${PERSISTENT_SCRIBBLE_COUNT} always-on (full coverage) + ${effectTimeline.scribbleBursts.length} bursts (running changing)`);

        const burstConfigs: Array<{
            x: number; y: number;
            size: number; scribIdx: number;
            enableExpr: string;
            motionType: MotionType;
            travelX: number; travelY: number;
            speedX: number; speedY: number;
            phase: number;
        }> = [];

        // For each burst, assign positions + full travel (every frame different)
        effectTimeline.scribbleBursts.forEach((burst, burstIdx) => {
            const burstEndTime = burst.startTime + burst.duration;

            burst.scribbleIndices.forEach((scribIdx, indexInBurst) => {
                const staggeredStart = burst.startTime + indexInBurst * burst.staggerDelay;
                // FFmpeg between(t,a,b) requires a <= b; otherwise conversion can fail (exit 221)
                // Ensure strictly valid time range logic
                let bEndTime = burstEndTime;
                if (staggeredStart >= bEndTime) {
                    // Force at least 1ms visibility if it's close, or skip if totally out
                    if (staggeredStart > bEndTime + 0.01) return;
                    bEndTime = staggeredStart + 0.005;
                }

                // Double check formatted strings
                const sStartStr = safeTime(staggeredStart);
                let bEndStr = safeTime(bEndTime);

                // Ensure strictly valid time range - Use floats for comparison!
                // Fix: Lexicographical comparison ("9.0" > "10.0") was causing bugs
                if (parseFloat(sStartStr) >= parseFloat(bEndStr)) {
                    bEndTime = parseFloat(sStartStr) + 0.001;
                    bEndStr = bEndTime.toFixed(3);
                }

                const enableExpr = `between(t,${sStartStr},${bEndStr})`;

                const zone = placementZones[(burstIdx * 7 + indexInBurst) % placementZones.length];
                const seed = burstIdx * 1000 + indexInBurst;
                const pseudoRand1 = Math.sin(seed * 12.9898) * 0.5 + 0.5;
                const pseudoRand2 = Math.sin(seed * 78.233) * 0.5 + 0.5;
                const pseudoRand3 = Math.sin(seed * 43.758) * 0.5 + 0.5;

                let x = subjectCenterX + zone.offsetX + (pseudoRand1 - 0.5) * 120;
                let y = subjectCenterY + zone.offsetY + (pseudoRand2 - 0.5) * 100;
                ({ x, y } = clampOutsideSubject(x, y));
                x = Math.max(-60, Math.min(width + 40, x));
                y = Math.max(-60, Math.min(height + 40, y));

                const sizeMultiplier = burst.density === 'dense' ? 1.1 : burst.density === 'sparse' ? 0.9 : 1.0;
                const size = (zone.sizeMin + pseudoRand3 * (zone.sizeMax - zone.sizeMin)) * sizeMultiplier;

                const motionChoice = (burstIdx + indexInBurst) % 5;
                const motionType: MotionType = motionChoice === 0 ? 'drift' : motionChoice === 1 ? 'wave' : 'orbit';
                const travelX = (190 + pseudoRand1 * 110) * energyMultiplier;
                const travelY = (150 + pseudoRand2 * 90) * energyMultiplier;
                const speedX = (2.4 + pseudoRand1 * 2.0); // FASTER: Burst doodles move even faster
                const speedY = (2.1 + pseudoRand2 * 1.8); // FASTER: Burst doodles move even faster

                burstConfigs.push({
                    x, y,
                    size: Math.floor(safeFloat(size, 50)),
                    scribIdx: scribIdx % scribblePaths.length,
                    enableExpr,
                    motionType,
                    travelX: safeFloat(travelX), travelY: safeFloat(travelY),
                    speedX: safeFloat(speedX), speedY: safeFloat(speedY),
                    phase: safeFloat(burstIdx * 3.1 + indexInBurst * 1.7)
                });
            });
        });

        // Combine: persistent first (base full coverage), then bursts (running changing)
        const scribbleConfigs = [...persistentConfigs, ...burstConfigs];
        console.log(`Total scribble instances: ${scribbleConfigs.length} (${persistentConfigs.length} always-on + ${burstConfigs.length} burst)`);

        // Track usage count for each scribble input
        const usageCount: Map<number, number> = new Map();
        scribbleConfigs.forEach(cfg => {
            usageCount.set(cfg.scribIdx, (usageCount.get(cfg.scribIdx) || 0) + 1);
        });

        // Pre-process ALL scribble inputs (FFmpeg requires all inputs to be processed)
        const scribbleStreams: Map<number, string[]> = new Map();

        for (let scribIdx = 0; scribIdx < scribblePaths.length; scribIdx++) {
            const inputIdx = scribbleInputStart + scribIdx;
            const count = usageCount.get(scribIdx) || 0;
            const streams: string[] = [];

            if (count === 0) {
                // Unused scribble - create single stream (will be used with enable=0)
                filters.push(`[${inputIdx}:v]format=rgba[scrib${scribIdx}_unused]`);
                streams.push(`scrib${scribIdx}_unused`);
            } else if (count === 1) {
                filters.push(`[${inputIdx}:v]format=rgba[scrib${scribIdx}_0]`);
                streams.push(`scrib${scribIdx}_0`);
            } else {
                const splitOutputs = Array.from({ length: count }, (_, j) => `[scrib${scribIdx}_${j}]`).join('');
                filters.push(`[${inputIdx}:v]format=rgba,split=${count}${splitOutputs}`);
                for (let j = 0; j < count; j++) {
                    streams.push(`scrib${scribIdx}_${j}`);
                }
            }
            scribbleStreams.set(scribIdx, streams);
        }

        // Apply unused scribbles with enable=0 to consume them
        for (let scribIdx = 0; scribIdx < scribblePaths.length; scribIdx++) {
            if (!usageCount.has(scribIdx) || usageCount.get(scribIdx) === 0) {
                const layerName = `scrib_unused_${scribIdx}`;
                filters.push(`[${currentLayer}][scrib${scribIdx}_unused]overlay=x=0:y=0:enable=0:eof_action=repeat:format=auto[${layerName}]`);
                currentLayer = layerName;
            }
        }

        const nextCopy: Map<number, number> = new Map();

        // Apply each scribble: FULL TRAVEL MOTION so every frame has something different (doodles move across frame)
        scribbleConfigs.forEach((cfg, i) => {
            const { x, y, size, scribIdx, enableExpr, motionType, travelX, travelY, speedX, speedY, phase } = cfg;
            const copyIdx = nextCopy.get(scribIdx) || 0;
            nextCopy.set(scribIdx, copyIdx + 1);

            const streams = scribbleStreams.get(scribIdx);
            if (!streams || copyIdx >= streams.length) return;

            const scribSource = streams[copyIdx];
            const layerName = `scrib_layer${i}`;
            const safeSize = Math.max(1, Math.floor(safeFloat(size, 40)));
            // SIMPLIFIED: Remove complex geq filter that may cause FFmpeg parsing errors
            filters.push(`[${scribSource}]scale=${safeSize}:-1,format=rgba[scrib_scaled${i}]`);

            const baseX = Math.floor(x);
            const baseY = Math.floor(y);

            // Motion: orbit = large ellipse; drift = horizontal sweep+wrap; wave = vertical sweep+wrap (every frame different)
            let xExpr: string;
            let yExpr: string;
            if (motionType === 'drift') {
                const driftSpeed = 65 + (i % 4) * 22;
                xExpr = `mod(${baseX}+t*${driftSpeed}+${(safeFloat(phase) * 40).toFixed(0)},${width + 160})-80`;
                yExpr = `${baseY}+${(safeFloat(travelY) * 0.4).toFixed(0)}*cos(t*${safeFloat(speedY).toFixed(2)}+${(safeFloat(phase) * 0.7).toFixed(2)})`;
            } else if (motionType === 'wave') {
                const waveSpeed = 45 + (i % 3) * 20;
                yExpr = `mod(${baseY}+t*${waveSpeed}+${(safeFloat(phase) * 35).toFixed(0)},${height + 120})-60`;
                xExpr = `round(${baseX}+${(safeFloat(travelX) * 0.35).toFixed(0)}*sin(t*${safeFloat(speedX).toFixed(2)}+${(safeFloat(phase) * 0.8).toFixed(2)}))`;
            } else {
                // Orbit: doodle moves in large ellipse = every frame different position
                xExpr = `round(${baseX}+${safeFloat(travelX).toFixed(0)}*sin(t*${safeFloat(speedX).toFixed(2)}+${safeFloat(phase).toFixed(2)}))`;
                yExpr = `round(${baseY}+${safeFloat(travelY).toFixed(0)}*cos(t*${safeFloat(speedY).toFixed(2)}+${(safeFloat(phase) * 0.9).toFixed(2)}))`;
            }

            filters.push(
                `[${currentLayer}][scrib_scaled${i}]overlay=x='${xExpr}':y='${yExpr}':enable='${enableExpr}':eof_action=repeat:format=auto[${layerName}]`
            );
            currentLayer = layerName;
        });
    } else if (scribblePaths.length > 0) {
        // FALLBACK MODE: Original group-based cycling
        console.log('Fallback scribble mode: group-based cycling');

        const numScribbleGroups = 5;
        const scribblesPerGroup = 14;
        const groupShowDuration = energyLevel === 'energetic' ? 0.28 : energyLevel === 'calm' ? 0.45 : 0.35;

        const scribbleConfigs: Array<{
            x: number; y: number;
            size: number; scribIdx: number;
            groupId: number;
            jitter: number; jitterSpeed: number;
        }> = [];

        for (let group = 0; group < numScribbleGroups; group++) {
            for (let i = 0; i < scribblesPerGroup; i++) {
                const zone = placementZones[i % placementZones.length];

                let x = subjectCenterX + zone.offsetX + (Math.random() - 0.5) * 100;
                let y = subjectCenterY + zone.offsetY + (Math.random() - 0.5) * 80;

                x = Math.max(-50, Math.min(width - 30, x));
                y = Math.max(-50, Math.min(height - 30, y));

                const size = zone.sizeMin + Math.random() * (zone.sizeMax - zone.sizeMin);
                const scribIdx = (group * scribblesPerGroup + i) % scribblePaths.length;

                scribbleConfigs.push({
                    x, y, size, scribIdx, groupId: group,
                    jitter: (4 + Math.random() * 6) * energyMultiplier,
                    jitterSpeed: (10 + Math.random() * 12) * energyMultiplier
                });
            }
        }

        const usageCount: Map<number, number> = new Map();
        scribbleConfigs.forEach(cfg => {
            usageCount.set(cfg.scribIdx, (usageCount.get(cfg.scribIdx) || 0) + 1);
        });

        const scribbleStreams: Map<number, string[]> = new Map();

        usageCount.forEach((count, scribIdx) => {
            const inputIdx = scribbleInputStart + scribIdx;
            const streams: string[] = [];

            if (count === 1) {
                filters.push(`[${inputIdx}:v]format=rgba[scrib${scribIdx}_0]`);
                streams.push(`scrib${scribIdx}_0`);
            } else {
                const splitOutputs = Array.from({ length: count }, (_, j) => `[scrib${scribIdx}_${j}]`).join('');
                filters.push(`[${inputIdx}:v]format=rgba,split=${count}${splitOutputs}`);
                for (let j = 0; j < count; j++) {
                    streams.push(`scrib${scribIdx}_${j}`);
                }
            }
            scribbleStreams.set(scribIdx, streams);
        });

        const nextCopy: Map<number, number> = new Map();
        const cycleDuration = numScribbleGroups * groupShowDuration;

        scribbleConfigs.forEach((cfg, i) => {
            const { x, y, size, scribIdx, groupId, jitter, jitterSpeed } = cfg;
            const copyIdx = nextCopy.get(scribIdx) || 0;
            nextCopy.set(scribIdx, copyIdx + 1);

            const streams = scribbleStreams.get(scribIdx);
            if (!streams || copyIdx >= streams.length) return;

            const scribSource = streams[copyIdx];
            const layerName = `scrib_layer${i}`;

            const scaledName = `scrib_scaled${i}`;
            // MAXIMUM VISIBILITY: Vibrant colors + sharper edges + doubled opacity
            filters.push(`[${scribSource}]scale=${Math.floor(size)}:-1,format=rgba,eq=saturation=2.5:contrast=1.5,unsharp=5:5:2.0:5:5:0.0,geq=lum='lum(X,Y)':a='if(gt(alpha(X,Y),10),min(alpha(X,Y)*2.0,255),alpha(X,Y))'[${scaledName}]`);

            const phase = i * 1.3 + groupId * 2.1;
            const baseX = Math.floor(x);
            const baseY = Math.floor(y);

            const xExpr = `${baseX}+${jitter.toFixed(0)}*sin(t*${jitterSpeed.toFixed(1)}+${phase.toFixed(1)})`;
            const yExpr = `${baseY}+${jitter.toFixed(0)}*cos(t*${(jitterSpeed * 1.1).toFixed(1)}+${(phase * 0.9).toFixed(1)})`;

            const groupStart = groupId * groupShowDuration;
            const groupEnd = groupStart + groupShowDuration;
            const enableExpr = `between(mod(t,${safeTime(cycleDuration)}),${safeTime(groupStart)},${safeTime(groupEnd)})`;

            filters.push(
                `[${currentLayer}][${scaledName}]overlay=x='${xExpr}':y='${yExpr}':enable='${enableExpr}':eof_action=repeat:format=auto[${layerName}]`
            );

            currentLayer = layerName;
        });
    }

    // 5. Add DROP SHADOW under subject (creates depth, "sticker pop" effect)
    if (shadowPath && shadowInputIdx > 0) {
        filters.push(`[${shadowInputIdx}:v]scale=${width}:${height},format=rgba[shadow_scaled]`);
        filters.push(`[${currentLayer}][shadow_scaled]overlay=x=0:y=0:eof_action=repeat:format=auto[with_shadow]`);
        currentLayer = 'with_shadow';
    }

    // 6. Add FOREGROUND (subject with alpha) - scribbles appear BEHIND
    if (foregroundPath && foregroundInputIdx > 0) {
        filters.push(`[${foregroundInputIdx}:v]scale=${width}:${height},format=rgba[fg_scaled]`);
        filters.push(`[${currentLayer}][fg_scaled]overlay=x=0:y=0:eof_action=repeat:format=auto[with_foreground]`);
        currentLayer = 'with_foreground';
    }

    // 7. Add WHITE OUTLINE (clean glow effect)
    if (humanOutlinePath && outlineInputIdx > 0) {
        filters.push(`[${outlineInputIdx}:v]scale=${width}:${height},format=rgba[outline_scaled]`);
        filters.push(`[${currentLayer}][outline_scaled]overlay=x=0:y=0:eof_action=repeat:format=auto[with_outline]`);
        currentLayer = 'with_outline';
    }

    // 8. Skip corner decoration (too distracting)
    // Corner effect removed for cleaner look - but we need to consume the input
    if (cornerPath && cornerInputIdx > 0) {
        filters.push(`[${cornerInputIdx}:v]scale=${width}:${height},format=rgba[corner_unused]`);
        filters.push(`[${currentLayer}][corner_unused]overlay=x=0:y=0:enable=0:eof_action=repeat:format=auto[corner_consumed]`);
        currentLayer = 'corner_consumed';
    }

    // 9. Light film grain (very subtle)
    filters.push(`[${currentLayer}]noise=c0s=5:c0f=t+u:allf=t[with_grain]`);
    currentLayer = 'with_grain';

    // 10. MAXIMUM VIBRANCY: Super bold, highlighter-like colors
    filters.push(`[${currentLayer}]eq=saturation=1.4:contrast=1.2:gamma=0.92:brightness=0.04[color_grade]`);
    currentLayer = 'color_grade';

    // 11. Stop-motion effect (15fps)
    filters.push(`[${currentLayer}]fps=15[fps15]`);
    filters.push(`[fps15]fps=${Math.round(videoInfo.fps)}:round=near[choppy]`);
    currentLayer = 'choppy';

    // 12. Final output
    filters.push(`[${currentLayer}]format=yuv420p[output]`);

    return filters.join(';');
}

/**
 * Extract foreground subject AND create outline + shadow using AI segmentation
 * Returns foreground video (subject with alpha), outline video (with drips + wobble), and shadow video
 */
export async function extractForegroundAndOutline(
    inputPath: string,
    foregroundOutputPath: string,
    outlineOutputPath: string,
    strokeSize: number = 15,
    sampleRate: number = 3 // Optimized: increased from 2 for faster processing
): Promise<{ foreground: string | null; outline: string | null; shadow: string | null }> {
    const scriptPath = path.join(process.cwd(), 'scripts', 'extract-foreground.py');
    const fs = require('fs').promises;

    // Check if Python script exists
    try {
        await fs.access(scriptPath);
    } catch {
        console.warn('Foreground extraction script not found');
        return { foreground: null, outline: null, shadow: null };
    }

    console.log('Extracting foreground, outline with drips, and shadow...');
    console.log(`Input: ${inputPath}`);
    console.log(`Foreground output: ${foregroundOutputPath}`);
    console.log(`Outline output: ${outlineOutputPath}`);

    // Derive shadow output path (Python script creates it automatically)
    const outlineDir = path.dirname(outlineOutputPath);
    const outlineName = path.basename(outlineOutputPath).replace('outline-', 'shadow-');
    const shadowOutputPath = path.join(outlineDir, outlineName);
    console.log(`Shadow output: ${shadowOutputPath}`);

    try {
        const cmd = `python3 "${scriptPath}" "${inputPath}" "${foregroundOutputPath}" "${outlineOutputPath}" --stroke ${strokeSize} --sample ${sampleRate}`;
        console.log('Running:', cmd);

        const { stdout, stderr } = await execAsync(cmd, {
            timeout: 600000, // 10 minute timeout
            maxBuffer: 50 * 1024 * 1024
        });

        if (stdout) console.log('Extraction output:', stdout);
        if (stderr) console.warn('Extraction stderr:', stderr);

        // Verify outputs exist
        let foreground: string | null = null;
        let outline: string | null = null;
        let shadow: string | null = null;

        try {
            await fs.access(foregroundOutputPath);
            foreground = foregroundOutputPath;
        } catch { }

        try {
            await fs.access(outlineOutputPath);
            outline = outlineOutputPath;
        } catch { }

        try {
            await fs.access(shadowOutputPath);
            shadow = shadowOutputPath;
        } catch { }

        console.log('Extraction complete:', { foreground, outline, shadow });
        return { foreground, outline, shadow };
    } catch (err) {
        console.error('Failed to extract foreground:', err);
        return { foreground: null, outline: null, shadow: null };
    }
}

/**
 * @deprecated Use extractForegroundAndOutline instead
 */
export async function createHumanOutline(
    inputPath: string,
    outputPath: string,
    strokeSize: number = 12,
    sampleRate: number = 3 // Optimized: increased from 2 for faster processing
): Promise<string | null> {
    const scriptPath = path.join(process.cwd(), 'scripts', 'create-human-outline.py');
    const fs = require('fs').promises;

    try {
        await fs.access(scriptPath);
    } catch {
        console.warn('Human outline script not found, skipping outline effect');
        return null;
    }

    console.log('Creating human outline using AI segmentation...');

    try {
        const cmd = `python3 "${scriptPath}" "${inputPath}" "${outputPath}" --stroke ${strokeSize} --sample ${sampleRate}`;
        const { stdout, stderr } = await execAsync(cmd, {
            timeout: 300000,
            maxBuffer: 50 * 1024 * 1024
        });

        if (stdout) console.log('Outline script output:', stdout);
        if (stderr) console.warn('Outline script stderr:', stderr);

        await fs.access(outputPath);
        return outputPath;
    } catch (err) {
        console.error('Failed to create human outline:', err);
        return null;
    }
}

/**
 * Helper to create temporary directories
 */
export async function ensureTempDirectories(): Promise<void> {
    const fs = require('fs').promises;
    await fs.mkdir(config.api.tempUploadDir, { recursive: true });
    await fs.mkdir(config.api.outputDir, { recursive: true });
}
