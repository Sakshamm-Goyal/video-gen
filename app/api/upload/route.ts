import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { config as appConfig } from '@/lib/config';
import { ensureTempDirectories } from '@/lib/video-processor';

export async function POST(request: NextRequest) {
    try {
        // Ensure temp directories exist
        await ensureTempDirectories();

        const formData = await request.formData();
        const file = formData.get('video') as File;

        if (!file) {
            return NextResponse.json(
                { error: 'No video file provided' },
                { status: 400 }
            );
        }

        // Validate file size
        const maxSize = appConfig.api.maxVideoSizeMB * 1024 * 1024;
        if (file.size > maxSize) {
            return NextResponse.json(
                { error: `File size exceeds ${appConfig.api.maxVideoSizeMB}MB limit` },
                { status: 400 }
            );
        }

        // Validate file type
        const validTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
        if (!validTypes.includes(file.type)) {
            return NextResponse.json(
                { error: 'Invalid file type. Please upload MP4, MOV, or WebM' },
                { status: 400 }
            );
        }

        // Generate unique filename
        const videoId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const extension = file.name.split('.').pop();
        const filename = `${videoId}.${extension}`;
        const filepath = join(appConfig.api.tempUploadDir, filename);

        // Save file
        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(filepath, buffer);

        return NextResponse.json({
            success: true,
            videoId,
            filename,
            size: file.size,
            type: file.type,
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: 'Failed to upload video' },
            { status: 500 }
        );
    }
}
