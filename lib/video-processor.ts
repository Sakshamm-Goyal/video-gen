import ffmpeg from 'fluent-ffmpeg';
import { config } from './config';
import { ScribbleAnimation } from './overlay-animator';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

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
    humanOutlinePath?: string | null
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

        const filterComplex = createAnimatedFilterComplex(
            scribbleAnimations,
            existingPaperFrames,
            existingScribbles,
            existingCorner,
            videoInfo,
            subjectBounds,
            existingOutline
        );

        console.log('FFmpeg inputs:', {
            video: inputPath,
            paperFrames: existingPaperFrames.length,
            scribbles: existingScribbles.length,
            corner: existingCorner ? 1 : 0,
            humanOutline: existingOutline ? 1 : 0,
            totalInputs: 1 + existingPaperFrames.length + existingScribbles.length + (existingCorner ? 1 : 0) + (existingOutline ? 1 : 0)
        });

        const command = ffmpeg(inputPath);

        // Add human outline video FIRST (so it's input 1)
        if (existingOutline) {
            command.input(existingOutline);
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
            .complexFilter(filterComplex)
            .outputOptions([
                '-map', '[output]',
                '-map', '0:a?',
                '-c:v', 'libx264',
                '-preset', 'fast',
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
            .on('end', () => resolve())
            .on('error', (err) => {
                console.error('FFmpeg error:', err);
                console.error('Filter complex:', filterComplex);
                reject(err);
            })
            .run();
    });
}

/**
 * Create animated FFmpeg filter complex with all effects:
 * 1. White outline/glow around the main subject (AI segmentation)
 * 2. Paper frame texture overlay
 * 3. Many scribbles around the subject with jitter animation
 * 4. White corner separator effect
 */
export function createAnimatedFilterComplex(
    scribbleAnimations: ScribbleAnimation[],
    paperFramePaths: string[],
    scribblePaths: string[],
    cornerPath: string | null,
    videoInfo: VideoInfo,
    subjectBounds?: { x: number; y: number; width?: number; height?: number },
    humanOutlinePath?: string | null
): string {
    const filters: string[] = [];
    const width = 1280;
    const height = 720;
    const duration = videoInfo.duration;

    // Input indices - human outline is input 1 if it exists
    const outlineInputIdx = humanOutlinePath ? 1 : -1;
    const paperInputStart = humanOutlinePath ? 2 : 1;
    const scribbleInputStart = paperInputStart + paperFramePaths.length;
    const cornerInputIdx = scribbleInputStart + scribblePaths.length;

    // 1. Scale base video
    filters.push(`[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[base]`);

    // Calculate subject area (normalized to pixels)
    const subjectX = (subjectBounds?.x ?? 0.25) * width;
    const subjectY = (subjectBounds?.y ?? 0.1) * height;
    const subjectW = (subjectBounds?.width ?? 0.5) * width;
    const subjectH = (subjectBounds?.height ?? 0.8) * height;
    
    // Exclusion zone with margin
    const margin = 80;
    const excludeLeft = Math.max(0, subjectX - margin);
    const excludeRight = Math.min(width, subjectX + subjectW + margin);
    const excludeTop = Math.max(0, subjectY - margin);
    const excludeBottom = Math.min(height, subjectY + subjectH + margin);

    let currentLayer = 'base';

    // 2. Add WHITE OUTLINE around human subject (from AI segmentation)
    if (humanOutlinePath && outlineInputIdx > 0) {
        filters.push(`[${outlineInputIdx}:v]scale=${width}:${height},format=rgba[outline_scaled]`);
        filters.push(`[${currentLayer}][outline_scaled]overlay=x=0:y=0:eof_action=repeat:format=auto[with_outline]`);
        currentLayer = 'with_outline';
    }

    // 3. Add PAPER FRAME texture overlay (visible vintage border)
    if (paperFramePaths.length > 0) {
        filters.push(`[${paperInputStart}:v]scale=${width}:${height},format=rgba[paper_scaled]`);
        filters.push(`[${currentLayer}][paper_scaled]overlay=x=0:y=0:eof_action=repeat:format=auto[with_paper]`);
        currentLayer = 'with_paper';
    }
    
    // Add a subtle vignette/border darkening effect for paper feel
    filters.push(`[${currentLayer}]vignette=PI/4:mode=backward:eval=frame[with_vignette]`);
    currentLayer = 'with_vignette';

    // 4. Add MANY SCRIBBLES covering the background with JITTER
    if (scribblePaths.length > 0) {
        // Generate LOTS of scribble positions covering the whole frame EXCEPT subject area
        const scribblePositions: Array<{ x: number; y: number; size: number; scribIdx: number }> = [];
        
        // Grid-based placement for better coverage
        const gridCols = 8;
        const gridRows = 5;
        const cellW = width / gridCols;
        const cellH = height / gridRows;
        
        for (let row = 0; row < gridRows; row++) {
            for (let col = 0; col < gridCols; col++) {
                const cellX = col * cellW;
                const cellY = row * cellH;
                const centerX = cellX + cellW / 2;
                const centerY = cellY + cellH / 2;
                
                // Skip cells that overlap with subject area
                if (centerX > excludeLeft && centerX < excludeRight &&
                    centerY > excludeTop && centerY < excludeBottom) {
                    continue;
                }
                
                // Add 1-2 scribbles per cell
                const numInCell = 1 + Math.floor(Math.random() * 2);
                for (let i = 0; i < numInCell; i++) {
                    const size = 60 + Math.random() * 100;
                    scribblePositions.push({
                        x: cellX + Math.random() * (cellW - size * 0.5),
                        y: cellY + Math.random() * (cellH - size * 0.5),
                        size: size,
                        scribIdx: Math.floor(Math.random() * scribblePaths.length)
                    });
                }
            }
        }

        // Shuffle and use up to 35 scribbles for good coverage
        const shuffled = scribblePositions.sort(() => Math.random() - 0.5);
        const finalPositions = shuffled.slice(0, Math.min(35, shuffled.length));

        // Track usage count for each scribble input
        const usageCount: Map<number, number> = new Map();
        finalPositions.forEach(pos => {
            usageCount.set(pos.scribIdx, (usageCount.get(pos.scribIdx) || 0) + 1);
        });

        // Pre-process scribbles with split
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

        // Apply each scribble with JITTER animation
        finalPositions.forEach((pos, i) => {
            const { x, y, size, scribIdx } = pos;
            const copyIdx = nextCopy.get(scribIdx) || 0;
            nextCopy.set(scribIdx, copyIdx + 1);
            
            const streams = scribbleStreams.get(scribIdx);
            if (!streams || copyIdx >= streams.length) return;
            
            const scribSource = streams[copyIdx];
            const layerName = `scrib_layer${i}`;
            
            // Scale to desired size
            const scaledName = `scrib_scaled${i}`;
            filters.push(`[${scribSource}]scale=${Math.floor(size)}:-1[${scaledName}]`);
            
            // JITTER ANIMATION: wobble position using sine waves
            const jitterAmount = 2 + Math.random() * 2; // 2-4 pixels
            const jitterSpeed = 12 + Math.random() * 8; // Varied speed
            const phase = i * 0.7; // Different phase per scribble
            const baseX = Math.floor(Math.max(0, Math.min(width - size, x)));
            const baseY = Math.floor(Math.max(0, Math.min(height - size, y)));
            
            // Expression for animated position
            const xExpr = `${baseX}+${jitterAmount.toFixed(1)}*sin(t*${jitterSpeed.toFixed(1)}+${phase.toFixed(1)})`;
            const yExpr = `${baseY}+${jitterAmount.toFixed(1)}*cos(t*${(jitterSpeed * 1.2).toFixed(1)}+${(phase * 0.8).toFixed(1)})`;
            
            filters.push(
                `[${currentLayer}][${scaledName}]overlay=x='${xExpr}':y='${yExpr}':eof_action=repeat:format=auto[${layerName}]`
            );
            
            currentLayer = layerName;
        });
    }

    // 5. Add WHITE CORNER SEPARATOR effect
    if (cornerPath) {
        filters.push(`[${cornerInputIdx}:v]scale=${width}:${height},format=rgba[corner_scaled]`);
        filters.push(`[${currentLayer}][corner_scaled]overlay=x=0:y=0:eof_action=repeat:format=auto[with_corner]`);
        currentLayer = 'with_corner';
    }

    // 6. Final output
    filters.push(`[${currentLayer}]format=yuv420p[output]`);

    return filters.join(';');
}

/**
 * Create human outline video using AI segmentation (rembg)
 * This creates a white glow/outline around detected humans
 */
export async function createHumanOutline(
    inputPath: string,
    outputPath: string,
    strokeSize: number = 12,
    sampleRate: number = 2
): Promise<string | null> {
    const scriptPath = path.join(process.cwd(), 'scripts', 'create-human-outline.py');
    const fs = require('fs').promises;
    
    // Check if Python script exists
    try {
        await fs.access(scriptPath);
    } catch {
        console.warn('Human outline script not found, skipping outline effect');
        return null;
    }
    
    console.log('Creating human outline using AI segmentation...');
    console.log(`Input: ${inputPath}`);
    console.log(`Output: ${outputPath}`);
    
    try {
        const cmd = `python3 "${scriptPath}" "${inputPath}" "${outputPath}" --stroke ${strokeSize} --sample ${sampleRate}`;
        console.log('Running:', cmd);
        
        const { stdout, stderr } = await execAsync(cmd, { 
            timeout: 300000, // 5 minute timeout
            maxBuffer: 50 * 1024 * 1024 // 50MB buffer
        });
        
        if (stdout) console.log('Outline script output:', stdout);
        if (stderr) console.warn('Outline script stderr:', stderr);
        
        // Verify output exists
        await fs.access(outputPath);
        console.log('Human outline created successfully:', outputPath);
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
