'use client';

import { useEffect, useState } from 'react';

interface ProcessingProgressProps {
    jobId: string;
    onComplete: (outputUrl: string) => void;
}

export function ProcessingProgress({ jobId, onComplete }: ProcessingProgressProps) {
    const [status, setStatus] = useState<string>('queued');
    const [progress, setProgress] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const response = await fetch(`/api/status/${jobId}`);
                const data = await response.json();

                setStatus(data.status);
                setProgress(data.progress || 0);

                if (data.status === 'completed' && data.outputPath) {
                    onComplete(data.outputPath);
                } else if (data.status === 'failed') {
                    setError(data.error || 'Processing failed');
                } else if (data.status !== 'completed') {
                    // Poll again
                    setTimeout(checkStatus, 1000);
                }
            } catch (err) {
                setError('Failed to check status');
            }
        };

        checkStatus();
    }, [jobId, onComplete]);

    const getStatusMessage = () => {
        switch (status) {
            case 'queued':
                return '⏳ Queued for processing...';
            case 'processing':
                return progress < 30
                    ? '🎬 Analyzing video...'
                    : progress < 50
                        ? '🎨 Generating overlays...'
                        : '✨ Compositing magic...';
            case 'completed':
                return '✓ Processing complete!';
            case 'failed':
                return '✗ Processing failed';
            default:
                return 'Processing...';
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto p-6 bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl shadow-lg">
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-800">{getStatusMessage()}</h3>
                    <span className="text-sm font-medium text-gray-600">{progress}%</span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Status Details */}
                {status === 'processing' && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                        <span>This may take a few minutes depending on video length...</span>
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
}
