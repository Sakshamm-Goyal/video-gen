import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { config as appConfig } from '@/lib/config';
import { extractVideoInfo, compositeOverlays, extractForegroundAndOutline } from '@/lib/video-processor';
import { calculateSafeZones, calculateSmartSafeZones, generateScribbleSequence } from '@/lib/overlay-animator';
import { analyzeVideoForPlacement, analyzeVideoTheme, generateThemedScribbleSVG, generateThemedPaperSVG } from '@/lib/gemini-client';
import { generateEffectTimeline, EffectTimeline } from '@/lib/effect-scheduler';
import { getContextualDoodles, prioritizeDoodles } from '@/lib/contextual-doodles';
import { prepareDirectionalArrows } from '@/lib/arrow-rotator';
import sharp from 'sharp';

// In-memory job tracking (for MVP - use Redis/database in production)
const jobs = new Map<string, { status: string; progress: number; error?: string; outputPath?: string }>();

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { videoId, density = 'medium' } = body;

        if (!videoId) {
            return NextResponse.json(
                { error: 'Video ID required' },
                { status: 400 }
            );
        }

        // Generate job ID
        const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        // Initialize job
        jobs.set(jobId, { status: 'queued', progress: 0 });

        // Start processing asynchronously
        processVideo(jobId, videoId, density as 'low' | 'medium' | 'high').catch((error) => {
            console.error('Processing error:', error);
            jobs.set(jobId, { status: 'failed', progress: 0, error: error.message });
        });

        return NextResponse.json({
            success: true,
            jobId,
        });
    } catch (error) {
        console.error('Process request error:', error);
        return NextResponse.json(
            { error: 'Failed to start processing' },
            { status: 500 }
        );
    }
}

async function processVideo(jobId: string, videoId: string, density: 'low' | 'medium' | 'high') {
    console.log(`[${jobId}] Starting video processing for ${videoId}`);

    // Update status
    jobs.set(jobId, { status: 'processing', progress: 10 });

    // Find video file
    const fs = require('fs').promises;
    let files: string[];

    try {
        files = await fs.readdir(appConfig.api.tempUploadDir);
    } catch (error) {
        throw new Error(`Failed to read upload directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const videoFile = files.find((f: string) => f.startsWith(videoId));

    if (!videoFile) {
        throw new Error(`Video file not found. Video ID: ${videoId}. Available files: ${files.length}`);
    }

    const inputPath = join(appConfig.api.tempUploadDir, videoFile);
    const outputPath = join(appConfig.api.outputDir, `output-${videoId}.mp4`);

    console.log(`[${jobId}] Input: ${inputPath}`);

    // Extract video info
    jobs.set(jobId, { status: 'processing', progress: 20 });
    const videoInfo = await extractVideoInfo(inputPath);

    if (!videoInfo.duration || videoInfo.duration <= 0) {
        throw new Error('Video has no duration or could not be read. Check that the file is a valid video.');
    }
    if (!videoInfo.fps || videoInfo.fps <= 0) {
        throw new Error('Video has no frame rate. Check that the file is a valid video.');
    }

    // Analyze video with Gemini 2.5 Flash for object detection AND theme
    jobs.set(jobId, { status: 'processing', progress: 25 });
    let safeZones = calculateSafeZones(videoInfo.width, videoInfo.height);
    let analysisResult;
    let themeResult;

    try {
        console.log('Starting video analysis with Gemini 2.5 Flash...');

        // Run both analyses in parallel for speed
        const [placementAnalysis, themeAnalysis] = await Promise.all([
            analyzeVideoForPlacement(inputPath),
            analyzeVideoTheme(inputPath)
        ]);

        analysisResult = placementAnalysis;
        themeResult = themeAnalysis;

        console.log('Placement analysis complete:', analysisResult);
        console.log('Theme analysis complete:', themeResult);

        // Use smart safe zones based on detected objects
        safeZones = calculateSmartSafeZones(
            videoInfo.width,
            videoInfo.height,
            analysisResult.detectedObjects || [],
            analysisResult.subjectBounds
        );
        console.log(`Using ${safeZones.length} smart safe zones based on ${analysisResult.detectedObjects?.length || 0} detected objects`);
        console.log(`Video mood: ${themeResult.mood}, energy: ${themeResult.energyLevel}, colors: ${themeResult.colorPalette.join(', ')}`);
    } catch (error) {
        console.warn('Video analysis failed, using defaults:', error);
        // Fall back to edge-based zones and VIBRANT default theme
        safeZones = calculateSafeZones(videoInfo.width, videoInfo.height);
        themeResult = {
            mood: 'playful',
            colorPalette: ['#FF1744', '#2979FF', '#FFD600', '#00E676', '#D500F9'], // Super vibrant colors
            suggestedScribbles: ['spiral', 'squiggle', 'scribbleLine', 'wave', 'brushStroke', 'heart', 'star', 'smiley', 'zigzag', 'arrow', 'speedArrow', 'curvedArrow', 'lightning', 'dots', 'splatter', 'doubleScribble', 'circle', 'flower'],
            paperStyle: 'warm-beige',
            energyLevel: 'moderate' as const
        };
    }

    // Generate scribble animation sequence
    jobs.set(jobId, { status: 'processing', progress: 30 });
    const totalFrames = Math.ceil(videoInfo.duration * videoInfo.fps);
    const scribbleAnimations = generateScribbleSequence(
        totalFrames,
        appConfig.assets.scribbleCount,
        safeZones,
        density
    );

    // Generate AI-themed assets based on video analysis
    const tempAssetsDir = join(appConfig.api.outputDir, `assets-${videoId}`);
    const { mkdir, writeFile, readdir } = require('fs/promises');
    await mkdir(tempAssetsDir, { recursive: true });

    // Filter colors: ensure VIBRANT, SATURATED colors only (match reference images)
    const isVibrant = (hex: string): boolean => {
        const h = hex.replace(/^#/, '');
        if (h.length !== 6 && h.length !== 3) return false;
        const r = parseInt(h.length === 6 ? h.slice(0, 2) : h[0] + h[0], 16) / 255;
        const g = parseInt(h.length === 6 ? h.slice(2, 4) : h[1] + h[1], 16) / 255;
        const b = parseInt(h.length === 6 ? h.slice(4, 6) : h[2] + h[2], 16) / 255;

        // Calculate HSV saturation
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        // Reject if too light (luminance > 0.85), too dark (max < 0.3), or not saturated enough (< 0.5)
        return luminance < 0.85 && max > 0.3 && saturation > 0.5;
    };
    const vividPalette = themeResult.colorPalette.filter(c => isVibrant(c));
    // Fallback to SUPER VIBRANT colors if AI gives us weak palette
    const colorPalette = vividPalette.length >= 4 ? vividPalette : [
        '#FF1744', '#2979FF', '#FFD600', '#00E676', '#D500F9', // Red, Blue, Yellow, Green, Purple
        '#FF6D00', '#00BFA5', '#FF4081', '#FFEA00', '#651FFF'  // Orange, Teal, Pink, Lemon, Indigo
    ];
    console.log('Generating scribbles with VIBRANT colors (high saturation):', colorPalette);

    // INTELLIGENT: Use contextual doodle selection based on scene analysis
    const contextualRecommendation = getContextualDoodles(themeResult.mood, []);
    const prioritizedTypes = prioritizeDoodles(
        [...themeResult.suggestedScribbles, ...contextualRecommendation.types],
        'general' // Will be refined with video keywords
    );

    console.log('Contextual doodle recommendation:', {
        mood: themeResult.mood,
        types: contextualRecommendation.types.slice(0, 5),
        density: contextualRecommendation.density,
        energy: contextualRecommendation.energyLevel
    });

    // Generate themed scribbles using AI-suggested + contextual types
    // OPTIMIZATION: Parallelize all SVG->PNG conversions
    const scribblePaths: string[] = [];
    const scribbleTypes: string[] = [];
    const scribbleTypes_raw = prioritizedTypes; // Use intelligently prioritized types
    const totalScribbles = 12; // MINIMAL: FFmpeg crashes with more inputs

    // Prepare all scribble generation tasks
    const scribbleGenerationTasks = [];

    // Generate scribbles with contextually prioritized types
    for (let i = 0; i < totalScribbles; i++) {
        const type = scribbleTypes_raw[i % scribbleTypes_raw.length];
        scribbleTypes.push(type); // Track types for arrow rotation
        const colorOffset = Math.floor(i / scribbleTypes_raw.length);
        const color = colorPalette[(i + colorOffset) % colorPalette.length];
        const pngPath = join(tempAssetsDir, `scribble_${i + 1}.png`);
        // LARGER: Increased sizes for better visibility (150-250px)
        const baseSize = 150 + (i % 5) * 20;

        scribbleGenerationTasks.push(
            (async () => {
                const svg = generateThemedScribbleSVG(type, color, baseSize);
                await sharp(Buffer.from(svg)).png().toFile(pngPath);
                return { path: pngPath, type };
            })()
        );
    }

    // Execute all scribble generation in parallel (FAST!)
    const generatedScribbles = await Promise.all(scribbleGenerationTasks);
    generatedScribbles.forEach(s => scribblePaths.push(s.path));

    console.log(`Generated ${scribblePaths.length} contextually intelligent scribbles (parallel processing)`);
    console.log('Scribble types:', scribbleTypes.slice(0, 6).join(', ') + '...');

    // Generate themed paper frames
    // OPTIMIZATION: Parallelize paper frame generation
    console.log('Generating PROFESSIONAL full-screen paper backgrounds with style:', themeResult.paperStyle);

    // OPTIMIZED: Generate 4 variants for balance of variety and speed
    const paperGenerationTasks = Array.from({ length: 4 }, (_, variant) => {
        const pngPath = join(tempAssetsDir, `frame_${variant + 1}.png`);
        return (async () => {
            const svg = generateThemedPaperSVG(themeResult.paperStyle, variant);
            await sharp(Buffer.from(svg)).png().toFile(pngPath);
            return pngPath;
        })();
    });

    const paperFramePaths = await Promise.all(paperGenerationTasks);

    console.log(`Generated ${paperFramePaths.length} professional paper backgrounds (parallel processing)`);

    // Generate INTELLIGENT effect timeline based on video duration and energy
    console.log('Generating intelligent effect timeline...');
    const effectTimeline = generateEffectTimeline(
        videoInfo.duration,
        themeResult.energyLevel,
        scribblePaths.length,
        paperFramePaths.length,
        appConfig.effects || {
            paper: {
                minVisibleDuration: 1.0,
                maxVisibleDuration: 4.0,
                minGapDuration: 0.5,
                maxGapDuration: 3.0,
                appearanceChance: 0.7,
            },
            scribbles: {
                burstMinDuration: 0.12,
                burstMaxDuration: 0.45,
                quietMinDuration: 0.02,
                quietMaxDuration: 0.06,
                minDensity: 18,
                maxDensity: 50,
            }
        }
    );

    console.log(`Effect timeline generated:`);
    console.log(`  - ${effectTimeline.scribbleBursts.length} scribble bursts (varying density, with quiet periods)`);
    console.log(`  - ${effectTimeline.paperAppearances.length} paper appearances (not always visible, with fade)`);
    console.log(`  - Energy level: ${effectTimeline.energyLevel}`);

    // INTELLIGENT ARROWS: Pre-rotate arrows to point toward subject
    jobs.set(jobId, { status: 'processing', progress: 33 });
    if (analysisResult?.subjectBounds) {
        try {
            console.log('Applying intelligent arrow rotation toward subject...');
            const subjectBounds = {
                centerX: analysisResult.subjectBounds.x + (analysisResult.subjectBounds.width || videoInfo.width / 2) / 2,
                centerY: analysisResult.subjectBounds.y + (analysisResult.subjectBounds.height || videoInfo.height / 2) / 2,
                width: analysisResult.subjectBounds.width || videoInfo.width / 2,
                height: analysisResult.subjectBounds.height || videoInfo.height / 2
            };

            const rotatedArrows = await prepareDirectionalArrows(
                scribblePaths,
                scribbleTypes,
                subjectBounds,
                videoInfo.width,
                videoInfo.height,
                tempAssetsDir
            );

            // Replace arrow scribbles with rotated versions
            rotatedArrows.forEach((rotatedData, originalPath) => {
                const index = scribblePaths.indexOf(originalPath);
                if (index !== -1) {
                    scribblePaths[index] = rotatedData.path;
                    console.log(`  Rotated arrow ${index + 1} by ${Math.round(rotatedData.rotation)}° to point at subject`);
                }
            });

            if (rotatedArrows.size > 0) {
                console.log(`Applied intelligent rotation to ${rotatedArrows.size} directional arrows`);
            }
        } catch (error) {
            console.warn('Failed to rotate arrows, using original positions:', error);
        }
    }

    // Use static corner from public directory
    const publicDir = join(process.cwd(), 'public', 'assets', 'overlays');
    const cornerPath = join(publicDir, 'corners', 'corner_white_tl.png');

    // Extract foreground (subject with alpha), outline (with drips + wobble), and shadow
    // This allows scribbles to appear BEHIND the subject with proper depth
    jobs.set(jobId, { status: 'processing', progress: 35 });
    const foregroundPath = join(appConfig.api.outputDir, `foreground-${videoId}.mov`);
    const outlinePath = join(appConfig.api.outputDir, `outline-${videoId}.mov`);
    let extractedForeground: string | null = null;
    let extractedOutline: string | null = null;
    let extractedShadow: string | null = null;

    try {
        console.log('Extracting foreground, outline, and shadow (ULTRA FAST MODE)...');
        const extraction = await extractForegroundAndOutline(
            inputPath,
            foregroundPath,
            outlinePath,
            18, // THICKER: Increased stroke size for more prominent outline (was 14)
            6   // ULTRA FAST: sample every 6th frame for speed (was 4)
        );
        extractedForeground = extraction.foreground;
        extractedOutline = extraction.outline;
        extractedShadow = extraction.shadow;

        if (extractedForeground) {
            console.log('Foreground extracted:', extractedForeground);
        }
        if (extractedOutline) {
            console.log('Outline with drips created:', extractedOutline);
        }
        if (extractedShadow) {
            console.log('Shadow created:', extractedShadow);
        }
    } catch (error) {
        console.warn('Failed to extract foreground, scribbles will overlap subject:', error);
    }

    // Ensure output directory exists before FFmpeg write
    await mkdir(appConfig.api.outputDir, { recursive: true });

    // Composite overlays with full effect stack
    jobs.set(jobId, { status: 'processing', progress: 50 });

    try {
        await compositeOverlays(
            inputPath,
            outputPath,
            scribbleAnimations,
            paperFramePaths,
            scribblePaths,
            cornerPath,
            videoInfo,
            (percent) => {
                // Update progress
                const totalProgress = 50 + (percent / 100) * 40; // 50-90%
                jobs.set(jobId, { status: 'processing', progress: Math.round(totalProgress) });
            },
            analysisResult?.subjectBounds,
            extractedOutline,
            themeResult.energyLevel,
            extractedForeground, // Pass foreground so scribbles appear BEHIND subject
            extractedShadow,     // Pass shadow for depth effect
            effectTimeline       // Pass intelligent effect timeline for organic behavior
        );

        // ENHANCED: Validate output file was created and is valid
        try {
            const { stat } = require('fs/promises');
            const outputStats = await stat(outputPath);

            if (outputStats.size === 0) {
                throw new Error('Output video file is empty');
            }

            console.log(`Output video created successfully: ${(outputStats.size / 1024 / 1024).toFixed(2)} MB`);
        } catch (validateError) {
            throw new Error(`Failed to validate output video: ${validateError}`);
        }
    } catch (compositeError) {
        console.error('FFmpeg composite error:', compositeError);
        throw new Error(`Video composition failed: ${compositeError instanceof Error ? compositeError.message : 'Unknown error'}`);
    }

    // Clean up temp assets and intermediate files
    try {
        const { rm, unlink } = require('fs/promises');
        await rm(tempAssetsDir, { recursive: true, force: true });

        // Clean up foreground, outline, and shadow videos
        if (extractedForeground) {
            try { await unlink(extractedForeground); } catch { }
        }
        if (extractedOutline) {
            try { await unlink(extractedOutline); } catch { }
        }
        if (extractedShadow) {
            try { await unlink(extractedShadow); } catch { }
        }

        console.log('Cleaned up temp files');
    } catch (e) {
        console.warn('Failed to clean up temp assets:', e);
    }

    // Complete
    jobs.set(jobId, {
        status: 'completed',
        progress: 100,
        outputPath: `/api/download/${videoId}`,
    });
}

// Export job tracking for status endpoint
export { jobs };
