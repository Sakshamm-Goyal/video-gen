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

        return new NextResponse(file, {
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Disposition': `attachment; filename="overlay-video-${videoId}.mp4"`,
            },
        });
    } catch (error) {
        console.error('Download error:', error);
        return NextResponse.json(
            { error: 'File not found' },
            { status: 404 }
        );
    }
}