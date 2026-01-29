'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface VideoUploaderProps {
    onUploadComplete: (videoId: string, filename: string) => void;
}

export function VideoUploader({ onUploadComplete }: VideoUploaderProps) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<string | null>(null);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;

        setError(null);
        setUploading(true);

        // Create preview
        const previewUrl = URL.createObjectURL(file);
        setPreview(previewUrl);

        const formData = new FormData();
        formData.append('video', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }

            onUploadComplete(data.videoId, data.filename);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
            setPreview(null);
        } finally {
            setUploading(false);
        }
    }, [onUploadComplete]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'video/mp4': ['.mp4'],
            'video/quicktime': ['.mov'],
            'video/webm': ['.webm'],
        },
        maxFiles: 1,
        disabled: uploading,
    });

    return (
        <div className="w-full max-w-2xl mx-auto">
            <div
                {...getRootProps()}
                className={`
          border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
          transition-all duration-200
          ${isDragActive ? 'border-blue-500 bg-blue-50 scale-105' : 'border-gray-300 hover:border-gray-400'}
          ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
            >
                <input {...getInputProps()} />

                {preview ? (
                    <div className="space-y-4">
                        <video
                            src={preview}
                            controls
                            className="w-full max-h-64 rounded-lg mx-auto"
                        />
                        <p className="text-sm text-gray-600">✓ Video uploaded successfully</p>
                    </div>
                ) : uploading ? (
                    <div className="space-y-3">
                        <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
                        <p className="text-gray-600">Uploading...</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <svg
                            className="w-16 h-16 mx-auto text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                            />
                        </svg>
                        <div>
                            <p className="text-lg font-semibold text-gray-700">
                                {isDragActive ? 'Drop video here' : 'Upload your video'}
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                                Drag & drop or click to browse • MP4, MOV, WebM • Max 500MB
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    {error}
                </div>
            )}
        </div>
    );
}
