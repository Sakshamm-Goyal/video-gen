'use client';

import { useState } from 'react';
import { VideoUploader } from '@/components/VideoUploader';
import { ProcessingProgress } from '@/components/ProcessingProgress';

export default function Home() {
  const [currentStep, setCurrentStep] = useState<'upload' | 'processing' | 'complete'>('upload');
  const [videoId, setVideoId] = useState<string>('');
  const [filename, setFilename] = useState<string>('');
  const [jobId, setJobId] = useState<string>('');
  const [outputUrl, setOutputUrl] = useState<string>('');

  // Auto-start processing after upload (no customize step)
  const handleUploadComplete = async (vid: string, fname: string) => {
    setVideoId(vid);
    setFilename(fname);
    setCurrentStep('processing');

    // Automatically start processing with intelligent defaults
    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: vid,
          density: 'medium', // Auto: AI will determine based on video energy
        }),
      });

      const data = await response.json();
      if (data.success) {
        setJobId(data.jobId);
      }
    } catch (error) {
      console.error('Process start error:', error);
    }
  };

  const handleProcessingComplete = (url: string) => {
    setOutputUrl(url);
    setCurrentStep('complete');
  };

  const handleReset = () => {
    setCurrentStep('upload');
    setVideoId('');
    setFilename('');
    setJobId('');
    setOutputUrl('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            ✨ Video Overlay Editor
          </h1>
          <p className="text-gray-600 mt-1">Add playful hand-drawn overlays to your videos</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Progress Steps - Simplified: Upload -> Process -> Download */}
        <div className="flex items-center justify-center mb-12 gap-4">
          {[
            { step: 'upload', label: '1. Upload', icon: '📤' },
            { step: 'processing', label: '2. Process', icon: '⚙️' },
            { step: 'complete', label: '3. Download', icon: '⬇️' },
          ].map(({ step, label, icon }) => {
            const isActive = currentStep === step;
            const isPast = ['upload', 'processing', 'complete'].indexOf(currentStep) >
              ['upload', 'processing', 'complete'].indexOf(step);

            return (
              <div
                key={step}
                className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${isActive
                    ? 'bg-blue-500 text-white scale-110'
                    : isPast
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
              >
                <span>{icon}</span>
                <span className="font-medium text-sm">{label}</span>
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="space-y-8">
          {currentStep === 'upload' && (
            <div className="animate-fadeIn">
              <VideoUploader onUploadComplete={handleUploadComplete} />
            </div>
          )}

          {currentStep === 'processing' && (
            <div className="animate-fadeIn">
              <ProcessingProgress jobId={jobId} onComplete={handleProcessingComplete} />
            </div>
          )}

          {currentStep === 'complete' && (
            <div className="animate-fadeIn text-center space-y-6">
              <div className="p-8 bg-white rounded-2xl shadow-lg max-w-2xl mx-auto">
                <div className="text-6xl mb-4">🎉</div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                  Your video is ready!
                </h2>
                <p className="text-gray-600 mb-6">
                  Download your video with beautiful hand-drawn overlays
                </p>
                <div className="flex gap-4 justify-center">
                  <a
                    href={outputUrl}
                    download
                    className="px-6 py-3 bg-green-600 text-white font-bold rounded-full hover:bg-green-700 transition-colors"
                  >
                    ⬇️ Download Video
                  </a>
                  <button
                    onClick={handleReset}
                    className="px-6 py-3 bg-gray-200 text-gray-800 font-bold rounded-full hover:bg-gray-300 transition-colors"
                  >
                    🔄 Create Another
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Example/Info Section */}
        {currentStep === 'upload' && (
          <div className="mt-16 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">
              How it works
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: '🎨', title: 'AI-Generated', desc: 'Overlays created with Gemini' },
                { icon: '⚡', title: 'Fast', desc: 'Processing in under 2x video length' },
                { icon: '🎯', title: 'Smart', desc: 'Overlays avoid blocking subjects' },
              ].map((feature, i) => (
                <div key={i} className="p-6 bg-white rounded-xl shadow text-center">
                  <div className="text-4xl mb-2">{feature.icon}</div>
                  <h3 className="font-bold text-gray-800 mb-1">{feature.title}</h3>
                  <p className="text-sm text-gray-600">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-24 py-8 text-center text-gray-500 text-sm">
        Powered by Gemini AI & FFmpeg
      </footer>
    </div>
  );
}
