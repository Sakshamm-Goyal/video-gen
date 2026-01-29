import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { config as appConfig } from '@/lib/config';
import { extractVideoInfo, compositeOverlays, extractForegroundAndOutline } from '@/lib/video-processor';
import { calculateSafeZones, calculateSmartSafeZones, generateScribbleSequence } from '@/lib/overlay-animator';
import { analyzeVideoForPlacement, analyzeVideoTheme, generateThemedScribbleSVG, generateThemedPaperSVG } from '@/lib/gemini-client';
import { generateEffectTimeline, EffectTimeline } from '@/lib/effect-scheduler';
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
    // Update status
    jobs.set(jobId, { status: 'processing', progress: 10 });

    // Find video file
    const fs = require('fs').promises;
    const files = await fs.readdir(appConfig.api.tempUploadDir);
    const videoFile = files.find((f: string) => f.startsWith(videoId));

    if (!videoFile) {
        throw new Error('Video file not found');
    }

    const inputPath = join(appConfig.api.tempUploadDir, videoFile);
    const outputPath = join(appConfig.api.outputDir, `output-${videoId}.mp4`);

    // Extract video info
    jobs.set(jobId, { status: 'processing', progress: 20 });
    const videoInfo = await extractVideoInfo(inputPath);

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
        // Fall back to edge-based zones and default theme
        safeZones = calculateSafeZones(videoInfo.width, videoInfo.height);
        themeResult = {
            mood: 'playful',
            colorPalette: ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181'],
            suggestedScribbles: ['squiggle', 'scribbleLine', 'wave', 'brushStroke', 'underline', 'heart', 'star', 'smiley', 'spiral', 'dots', 'splatter', 'zigzag', 'curvedArrow', 'doubleScribble'],
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
    
    console.log('Generating AI-themed scribbles with colors:', themeResult.colorPalette);
    
    // Generate themed scribbles using AI-suggested types and colors
    const scribblePaths: string[] = [];
    const scribbleTypes = themeResult.suggestedScribbles.slice(0, 15); // Use up to 15 suggested types for variety
    
    // Generate first set with all unique types
    for (let i = 0; i < scribbleTypes.length; i++) {
        const type = scribbleTypes[i];
        // Cycle through the AI-suggested color palette
        const color = themeResult.colorPalette[i % themeResult.colorPalette.length];
        const svg = generateThemedScribbleSVG(type, color, 200);
        const pngPath = join(tempAssetsDir, `scribble_${i + 1}.png`);
        
        await sharp(Buffer.from(svg))
            .png()
            .toFile(pngPath);
        
        scribblePaths.push(pngPath);
    }
    
    // Generate additional scribbles with color variants for rich variety
    const totalScribbles = 25; // Good balance of variety and speed
    for (let i = scribbleTypes.length; i < totalScribbles; i++) {
        const type = scribbleTypes[i % scribbleTypes.length];
        // Use different color for each variant of the same type
        const colorOffset = Math.floor(i / scribbleTypes.length);
        const color = themeResult.colorPalette[(i + colorOffset) % themeResult.colorPalette.length];
        const svg = generateThemedScribbleSVG(type, color, 200);
        const pngPath = join(tempAssetsDir, `scribble_${i + 1}.png`);
        
        await sharp(Buffer.from(svg))
            .png()
            .toFile(pngPath);
        
        scribblePaths.push(pngPath);
    }
    
    console.log(`Generated ${scribblePaths.length} AI-themed scribbles with diverse types`);
    
    // Generate themed paper frames
    console.log('Generating AI-themed paper frames with style:', themeResult.paperStyle);
    const paperFramePaths: string[] = [];
    
    for (let variant = 0; variant < 4; variant++) {
        const svg = generateThemedPaperSVG(themeResult.paperStyle, variant);
        const pngPath = join(tempAssetsDir, `frame_${variant + 1}.png`);
        
        await sharp(Buffer.from(svg))
            .png()
            .toFile(pngPath);
        
        paperFramePaths.push(pngPath);
    }
    
    console.log(`Generated ${paperFramePaths.length} AI-themed paper frames`);

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
                burstMinDuration: 0.3,
                burstMaxDuration: 1.5,
                quietMinDuration: 0.2,
                quietMaxDuration: 1.0,
                minDensity: 2,
                maxDensity: 18,
            }
        }
    );
    
    console.log(`Effect timeline generated:`);
    console.log(`  - ${effectTimeline.scribbleBursts.length} scribble bursts (varying density, with quiet periods)`);
    console.log(`  - ${effectTimeline.paperAppearances.length} paper appearances (not always visible, with fade)`);
    console.log(`  - Energy level: ${effectTimeline.energyLevel}`);

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
        console.log('Extracting foreground, outline, and shadow (FAST MODE)...');
        const extraction = await extractForegroundAndOutline(
            inputPath,
            foregroundPath,
            outlinePath,
            14, // Stroke size for clean outline
            4   // FAST: sample every 4th frame (was 2)
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

    // Composite overlays with full effect stack
    jobs.set(jobId, { status: 'processing', progress: 50 });

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

    // Clean up temp assets and intermediate files
    try {
        const { rm, unlink } = require('fs/promises');
        await rm(tempAssetsDir, { recursive: true, force: true });
        
        // Clean up foreground, outline, and shadow videos
        if (extractedForeground) {
            try { await unlink(extractedForeground); } catch {}
        }
        if (extractedOutline) {
            try { await unlink(extractedOutline); } catch {}
        }
        if (extractedShadow) {
            try { await unlink(extractedShadow); } catch {}
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
