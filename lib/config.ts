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
    scribbleCount: 15, // MINIMAL: FFmpeg can't handle more inputs
    paperFrameCount: 2, // MINIMAL for speed
    cornerCount: 1,
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
  // Intelligent effect timing: VERY FAST CHANGING hand-drawn doodles (frame-by-frame feel)
  effects: {
    paper: {
      minVisibleDuration: 1.0,    // seconds - minimum time paper is visible
      maxVisibleDuration: 4.0,    // seconds - maximum time paper is visible
      minGapDuration: 1.0,        // seconds - minimum gap between appearances
      maxGapDuration: 4.0,        // seconds - maximum gap between appearances
      appearanceChance: 0.25,       // REDUCED: 25% for cleaner background like reference
    },
    scribbles: {
      burstMinDuration: 0.12,     // seconds - very short bursts = doodles change every few frames
      burstMaxDuration: 0.45,     // seconds - rapid churn, never static
      quietMinDuration: 0.02,     // seconds - minimal gap = constant alive feel
      quietMaxDuration: 0.06,     // seconds
      minDensity: 20,              // MODERATE: Prevent FFmpeg overload
      maxDensity: 40,              // MODERATE: Balance performance and density
    }
  },
};
