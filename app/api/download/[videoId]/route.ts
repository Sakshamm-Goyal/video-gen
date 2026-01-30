import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { config as appConfig } from '@/lib/config';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ videoId: string }> }
) {
    try {
        const { videoId } = await params;
        const outputPath = join(appConfig.api.outputDir, `output-${videoId}.mp4`);

        const file = await readFile(outputPath);
        
        // Check if this is a preview request (for video element) or download request
        const searchParams = request.nextUrl.searchParams;
        const isPreview = searchParams.get('preview') === 'true';

        const headers: Record<string, string> = {
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes', // Enable range requests for video streaming
        };

        // Only add attachment header for actual downloads, not previews
        if (!isPreview) {
            headers['Content-Disposition'] = `attachment; filename="overlay-video-${videoId}.mp4"`;
        }

        return new NextResponse(file, { headers });
    } catch (error) {
        console.error('Download error:', error);
        return NextResponse.json(
            { error: 'File not found' },
            { status: 404 }
        );
    }
}