import { NextRequest, NextResponse } from 'next/server';
import { jobs } from '../../process/route';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ jobId: string }> }
) {
    const { jobId } = await params;

    const job = jobs.get(jobId);

    if (!job) {
        return NextResponse.json(
            { error: 'Job not found' },
            { status: 404 }
        );
    }

    return NextResponse.json({
        jobId,
        ...job,
    });
}
