import ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';
import { config } from './config';
import { ScribbleAnimation } from './overlay-animator';

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
                fps: eval(videoStream.r_frame_rate || '30/1'), // Parse fractional fps
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
    onProgress?: (percent: number) => void
): Promise<void> {
    return new Promise(async (resolve, reject) => {
        // Check which files actually exist
        const fs = require('fs').promises;
        const existingPaperFrames: string[] = [];
        const existingScribbles: string[] = [];
        let existingCorner: string | null = null;

        // Verify paper frames exist
        for (const path of paperFramePaths) {
            try {
                await fs.access(path);
                existingPaperFrames.push(path);
            } catch {
                console.warn(`Paper frame not found: ${path}`);
            }
        }

        // Verify scribbles exist
        for (const path of scribblePaths) {
            try {
                await fs.access(path);
                existingScribbles.push(path);
            } catch {
                console.warn(`Scribble not found: ${path}`);
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

        // Build filter complex with only existing assets
        const filterComplex = createAnimatedFilterComplex(
            scribbleAnimations,
            existingPaperFrames,
            existingScribbles,
            existingCorner,
            videoInfo
        );

        // Debug: Log what we're adding
        console.log('FFmpeg inputs:', {
            video: inputPath,
            paperFrames: existingPaperFrames.length,
            scribbles: existingScribbles.length,
            corner: existingCorner ? 1 : 0,
            totalInputs: 1 + existingPaperFrames.length + existingScribbles.length + (existingCorner ? 1 : 0)
        });

        const command = ffmpeg(inputPath);

        // Add only existing paper frame inputs (FFmpeg will handle static images in overlay)
        existingPaperFrames.forEach((path) => {
            command.input(path);
        });

        // Add only existing scribble inputs
        existingScribbles.forEach((path) => {
            command.input(path);
        });

        // Add corner separator if it exists
        if (existingCorner) {
            command.input(existingCorner);
        }

        command
            .complexFilter(filterComplex)
            .outputOptions([
                '-map', '[output]',
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '23',
                '-pix_fmt', 'yuv420p',
                '-shortest', // End when shortest input ends
            ])
            .output(outputPath);

        // Progress tracking
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
 * Create animated FFmpeg filter complex with:
 * - Paper frames that crossfade over time
 * - Scribbles that appear/disappear dynamically
 * - White corner separator
 * 
 * Uses overlay with eof_action=repeat for static images
 */
export function createAnimatedFilterComplex(
    scribbleAnimations: ScribbleAnimation[],
    paperFramePaths: string[],
    scribblePaths: string[],
    cornerPath: string | null,
    videoInfo: VideoInfo
): string {
    const filters: string[] = [];
    const width = 1280;
    const height = 720;
    const fps = videoInfo.fps;
    const duration = videoInfo.duration;

    // 1. Scale base video
    filters.push(`[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[base]`);

    // Input indices: 0=base video, 1-N=paper frames, N+1-M=scribbles, M+1=corner
    const paperInputStart = 1;
    const scribbleInputStart = paperInputStart + paperFramePaths.length;
    const cornerInputIdx = scribbleInputStart + scribblePaths.length;
    
    // Validate we have at least some assets
    if (paperFramePaths.length === 0 && scribblePaths.length === 0 && !cornerPath) {
        // No overlays - just return base video
        filters.push(`[base]format=yuv420p[output]`);
        return filters.join(';');
    }

    // 2. Create paper frame overlay
    // Scale static images and use overlay with eof_action=repeat to loop them
    if (paperFramePaths.length > 0) {
        // Scale first paper frame
        filters.push(`[${paperInputStart}:v]scale=${width}:${height},format=rgba[paper0_raw]`);
        // Overlay paper frame on base with blend effect using colorchannelmixer for opacity
        filters.push(`[paper0_raw]colorchannelmixer=aa=0.35[paper0]`);
        // Use overlay with eof_action=repeat to loop the static image
        filters.push(`[base][paper0]overlay=x=0:y=0:eof_action=repeat:shortest=1[paper_bg]`);
    } else {
        // No paper frames - just copy base
        filters.push(`[base]copy[paper_bg]`);
    }

    // 3. Prepare scribble inputs with varied sizes
    // Scale static images (they will be used with eof_action=repeat in overlay)
    const scribbleScaled: string[] = [];
    scribblePaths.forEach((_, i) => {
        const inputIdx = scribbleInputStart + i;
        const scale = 100 + (i % 5) * 30; // Vary sizes: 100, 130, 160, 190, 220
        const name = `scrib${i}`;
        filters.push(`[${inputIdx}:v]scale=${scale}:${scale},format=rgba[${name}]`);
        scribbleScaled.push(name);
    });

    // 4. Apply scribbles in layers
    let currentLayer = 'paper_bg';
    const centerX = width / 2;
    const centerY = height / 2;
    const centerRadius = 180;

    // Create scribble overlay by sampling animations at regular intervals
    const timeWindows = Math.ceil(duration / 0.3);
    let layerCount = 0;
    const maxLayers = 20; // Limit to avoid FFmpeg complexity

    // Only add scribbles if we have any
    if (scribbleScaled.length > 0) {
        for (let window = 0; window < Math.min(timeWindows, maxLayers); window++) {
            const t = window * 0.3;
            const tEnd = t + 0.5;
            
            // Find scribbles active in this window
            const activeScribbles = scribbleAnimations.filter(anim => {
                const startTime = anim.startFrame / fps;
                const endTime = anim.endFrame / fps;
                return startTime < tEnd && endTime > t;
            });

            if (activeScribbles.length > 0) {
                const anim = activeScribbles[Math.floor(Math.random() * activeScribbles.length)];
                const scribbleIdx = anim.assetIndex % scribbleScaled.length;
                const scribbleName = scribbleScaled[scribbleIdx];
                
                // Calculate position (avoid center)
                let x = anim.x;
                let y = anim.y;
                const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                if (dist < centerRadius) {
                    const angle = Math.atan2(y - centerY, x - centerX);
                    x = centerX + Math.cos(angle) * (centerRadius + 20);
                    y = centerY + Math.sin(angle) * (centerRadius + 20);
                }
                
                // Clamp to bounds
                x = Math.max(0, Math.min(width - 100, x));
                y = Math.max(0, Math.min(height - 100, y));

                const layerName = `layer${layerCount}`;
                const enableExpr = `between(t,${t.toFixed(2)},${tEnd.toFixed(2)})`;
                
                // Use eof_action=repeat for static image overlay
                filters.push(
                    `[${currentLayer}][${scribbleName}]overlay=x=${Math.floor(x)}:y=${Math.floor(y)}:enable='${enableExpr}':eof_action=repeat:shortest=1[${layerName}]`
                );
                
                currentLayer = layerName;
                layerCount++;
            }
        }
    }

    // 5. Add white corner separator
    if (cornerPath) {
        filters.push(`[${cornerInputIdx}:v]scale=${width}:${height},format=rgba[corner_scaled]`);
        filters.push(`[${currentLayer}][corner_scaled]overlay=x=0:y=0:eof_action=repeat:shortest=1[with_corner]`);
        currentLayer = 'with_corner';
    }

    // 6. Final output
    filters.push(`[${currentLayer}]format=yuv420p[output]`);

    return filters.join(';');
}

/**
 * Helper to create temporary directories
 */
export async function ensureTempDirectories(): Promise<void> {
    const fs = require('fs').promises;
    await fs.mkdir(config.api.tempUploadDir, { recursive: true });
    await fs.mkdir(config.api.outputDir, { recursive: true });
}
