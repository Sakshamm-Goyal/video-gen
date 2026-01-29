import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { config as appConfig } from '@/lib/config';
import { extractVideoInfo, compositeOverlays } from '@/lib/video-processor';
import { calculateSafeZones, calculateSmartSafeZones, generateScribbleSequence } from '@/lib/overlay-animator';
import { analyzeVideoForPlacement } from '@/lib/gemini-client';

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

    // Analyze video with Gemini 3 Pro for object detection
    jobs.set(jobId, { status: 'processing', progress: 25 });
    let safeZones = calculateSafeZones(videoInfo.width, videoInfo.height);
    let analysisResult;
    
    try {
        console.log('Starting video analysis with Gemini 3 Pro...');
        analysisResult = await analyzeVideoForPlacement(inputPath);
        console.log('Analysis complete:', analysisResult);
        
        // Use smart safe zones based on detected objects
        safeZones = calculateSmartSafeZones(
            videoInfo.width,
            videoInfo.height,
            analysisResult.detectedObjects || [],
            analysisResult.subjectBounds
        );
        console.log(`Using ${safeZones.length} smart safe zones based on ${analysisResult.detectedObjects?.length || 0} detected objects`);
    } catch (error) {
        console.warn('Video analysis failed, using edge-based zones:', error);
        // Fall back to edge-based zones
        safeZones = calculateSafeZones(videoInfo.width, videoInfo.height);
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

    // Use actual asset paths from public directory
    const publicDir = join(process.cwd(), 'public', 'assets', 'overlays');
    const { readdir } = require('fs/promises');

    // Get all available paper frames
    const paperFramesDir = join(publicDir, 'paper-frames');
    let paperFrameFiles: string[] = [];
    try {
        paperFrameFiles = await readdir(paperFramesDir);
    } catch (error) {
        console.warn('Paper frames directory not found, using placeholder');
    }
    const paperFramePaths = paperFrameFiles
        .filter((f: string) => f.endsWith('.png'))
        .sort()
        .map((f: string) => join(paperFramesDir, f));
    
    // Fallback to first frame if none found
    if (paperFramePaths.length === 0) {
        paperFramePaths.push(join(paperFramesDir, 'frame_01.png'));
    }

    // Get all available scribbles
    const scribblesDir = join(publicDir, 'scribbles');
    let scribbleFiles: string[] = [];
    try {
        scribbleFiles = await readdir(scribblesDir);
    } catch (error) {
        console.warn('Scribbles directory not found');
    }
    const scribblePaths = scribbleFiles
        .filter((f: string) => f.endsWith('.png'))
        .sort()
        .map((f: string) => join(scribblesDir, f));

    // Get corner separator
    const cornerPath = join(publicDir, 'corners', 'corner_white_tl.png');

    // Composite overlays
    jobs.set(jobId, { status: 'processing', progress: 40 });

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
            const totalProgress = 40 + (percent / 100) * 50; // 40-90%
            jobs.set(jobId, { status: 'processing', progress: Math.round(totalProgress) });
        }
    );

    // Complete
    jobs.set(jobId, {
        status: 'completed',
        progress: 100,
        outputPath: `/api/download/${videoId}`,
    });
}

// Export job tracking for status endpoint
export { jobs };
