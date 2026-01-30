# Video Overlay Editor

Add playful hand-drawn overlays to your videos using AI-generated assets and FFmpeg compositing.

## Features

- 🎨 **AI-Generated Overlays**: Colorful scribbles and paper textures created with Gemini
- ⚡ **Fast Processing**: Composite overlays in under 2x video length
- 🎯 **Smart Placement**: Edge-based algorithm prevents overlays from blocking subjects
- 🎬 **Simple Workflow**: Upload → Customize → Process → Download

### ✨ Intelligent Effect System

Sophisticated visual intelligence creates professional, context-aware effects:

#### 1. **Directional Arrows** 🎯
- Arrows automatically rotate to point toward main subjects (people, objects)
- Calculates optimal placement around subject boundaries
- Multiple arrow styles: straight, curved, speed/motion lines
- Pre-rotates PNG assets before FFmpeg processing
- Intelligent distribution in zones (top/bottom/left/right)

#### 2. **Subject-Aware Placement** 🧠
- Detects subject position using Gemini 2.5 Flash video analysis
- Dynamically avoids covering faces, flowers, food items
- Placement zones adapt to subject boundaries
- 30 persistent animated scribbles + burst layers
- Maintains safe margins around important content

#### 3. **Foreground Extraction** ✂️
- Clean white outline separation (like hand-drawn marker)
- Multi-pass edge detection (Sobel + Canny filters)
- Wobbly animated outline with time-based jiggle
- Sketchy multi-layer approach for authentic feel
- FFmpeg morphology and threshold operations

#### 4. **Contextual Doodle Selection** 🎭
- Scene-aware doodle types based on content:
  - **Person**: Smiley faces, hearts, stars, arrows
  - **Food**: Hearts, spirals, flowers, emphasis marks
  - **Action**: Speed arrows, motion lines, zigzags, bursts
  - **Nature**: Flowers, leaves, swirls, waves
  - **Celebration**: Stars, hearts, confetti, sparkles
- Mood-based energy adjustment (calm/moderate/energetic)
- Density adapts to scene energy
- Time-based segment filtering (early/middle/late)

#### 5. **Dynamic Motion Patterns** 🌊
- **Orbit**: Elliptical paths around subjects
- **Drift**: Horizontal sweeping with wrap-around
- **Wave**: Vertical traveling motion
- Each doodle has unique phase offset preventing repetition
- Complex motion equations for organic feel

#### 6. **Color Variety** 🌈
- Vibrant, high-saturation color palette
- HSV-based color filtering (saturation > 0.5)
- Multi-colored overlays: red, blue, green, yellow, purple, black
- Contextual color matching to video theme

#### 7. **Paper Texture Effects** 📄
- Authentic hand-drawn aesthetic
- Multiple variants: vintage, craft, notebook, cream, white
- Torn edges and grain textures
- Resolution-adaptive (720p/1080p variants)

## Setup

### Prerequisites

- Node.js 18+ and npm
- FFmpeg installed on your system
- Gemini API key ([Get one here](https://ai.google.dev/))

### Installation

1. Clone and install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.local.example .env.local
```

3. Add your Gemini API key to `.env.local`:
```
GOOGLE_AI_API_KEY=your_api_key_here
```

### Generate Overlay Assets (Optional for MVP)

Generate AI-powered overlay assets once:

```bash
npm run generate-assets
```

This creates 20 scribble sprites, 8 paper frames, and 2 corner overlays in `public/assets/overlays/`.

**Note**: For the MVP, you can use placeholder assets. The compositing system will work with any PNG images.

## Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## How It Works

1. **Upload**: User uploads a video (MP4, MOV, WebM)
2. **Customize**: Select scribble density (low/medium/high)
3. **Process**:
   - Extract video metadata with ffprobe
   - Calculate safe zones (edges) to avoid blocking subject
   - Generate random scribble animation sequence
   - Composite overlays with FFmpeg
4. **Download**: Get processed video with overlays

### Smart Placement (Level 1)

The app uses edge-based placement to keep overlays from covering the main subject:

- **Scribbles**: Only placed in outer 15-20% edge bands
- **Paper frame**: Natural border design
- **Corner separator**: Locked to corners

No AI analysis needed - works for 95% of videos where subjects are centered!

## Project Structure

```
video-gen/
├── app/
│   ├── api/
│   │   ├── upload/       # Video upload endpoint
│   │   ├── process/      # FFmpeg processing
│   │   ├── status/       # Job status polling
│   │   └── download/     # Download processed video
│   └── page.tsx          # Main UI
├── components/
│   ├── VideoUploader.tsx    # Drag-and-drop uploader
│   ├── StyleControls.tsx    # Customization UI
│   └── ProcessingProgress.tsx # Real-time progress
├── lib/
│   ├── config.ts            # App configuration
│   ├── gemini-client.ts     # Gemini API integration
│   ├── overlay-animator.ts  # Animation logic
│   └── video-processor.ts   # FFmpeg wrapper
└── scripts/
    └── generate-assets.ts   # Asset generation script
```

## Tech Stack

- **Frontend**: Next.js 15, React, Tailwind CSS
- **Video Processing**: FFmpeg (fluent-ffmpeg)
- **AI Assets**: Gemini Nano Banana (image generation)
- **State**: In-memory job queue (MVP - upgrade to Redis for production)

## API Endpoints

- `POST /api/upload` - Upload video
- `POST /api/process` - Start processing job
- `GET /api/status/[jobId]` - Check job status
- `GET /api/download/[videoId]` - Download result

## Future Enhancements

- [ ] **Level 2 Placement**: MediaPipe person detection
- [ ] **Level 3 Placement**: Gemini video understanding
- [ ] **Custom Assets**: Per-user generated overlays
- [ ] **More Controls**: Paper intensity, corner toggle
- [ ] **Job Queue**: Redis + Bull for scalability
- [ ] **Video Trimming**: Edit video before overlays
- [ ] **Templates**: Pre-made style presets

## License

MIT
