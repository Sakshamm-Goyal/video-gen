export const config = {
  api: {
    maxVideoSizeMB: parseInt(process.env.MAX_VIDEO_SIZE_MB || '500'),
    tempUploadDir: process.env.TEMP_UPLOAD_DIR || '/tmp/video-gen/uploads',
    outputDir: process.env.OUTPUT_DIR || '/tmp/video-gen/outputs',
  },
  gemini: {
    apiKey: process.env.GOOGLE_AI_API_KEY || '',
  },
  assets: {
    scribbleCount: 20,
    paperFrameCount: 8,
    cornerCount: 2,
  },
  video: {
    defaultResolution: '1280:720', // 720p for processing
    defaultFPS: 30,
  },
  overlay: {
    // Edge-based safe zone percentages (Level 1 placement)
    safeZones: {
      leftBand: 0.15,      // 15% left edge
      rightBand: 0.85,     // 15% right edge (starts at 85%)
      topBand: 0.12,       // 12% top edge
      bottomBand: 0.88,    // 12% bottom edge (starts at 88%)
    },
  },
};
