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
  // Intelligent effect timing configuration
  effects: {
    paper: {
      minVisibleDuration: 1.0,    // seconds - minimum time paper is visible
      maxVisibleDuration: 4.0,    // seconds - maximum time paper is visible
      minGapDuration: 0.5,        // seconds - minimum gap between appearances
      maxGapDuration: 3.0,        // seconds - maximum gap between appearances
      appearanceChance: 0.7,      // 70% chance paper appears in each time slot
    },
    scribbles: {
      burstMinDuration: 0.3,      // seconds - minimum burst duration
      burstMaxDuration: 1.5,      // seconds - maximum burst duration
      quietMinDuration: 0.2,      // seconds - minimum quiet period
      quietMaxDuration: 1.0,      // seconds - maximum quiet period
      minDensity: 2,              // minimum scribbles per burst
      maxDensity: 18,             // maximum scribbles per burst
    }
  },
};
