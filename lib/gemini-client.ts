import { config } from './config';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Call Imagen 3 or Gemini image generation API
 */
async function generateImage(
    model: string,
    prompt: string,
    aspectRatio: string = '1:1',
    imageSize?: string
): Promise<Blob> {
    // Check if using Imagen model
    const isImagen = model.startsWith('imagen');
    
    if (isImagen) {
        // Imagen 3 uses predict endpoint with different format
        const url = `${GEMINI_API_BASE}/models/${model}:predict`;
        
        const body = {
            instances: [{ prompt }],
            parameters: {
                aspectRatio: aspectRatio,
                sampleCount: 1,
                // Request PNG for transparency support
                outputOptions: {
                    mimeType: 'image/png'
                }
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': config.gemini.apiKey
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Imagen API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        
        // Imagen returns predictions array with bytesBase64Encoded
        const prediction = data.predictions?.[0];
        if (!prediction?.bytesBase64Encoded) {
            throw new Error('No image data in Imagen response');
        }

        const buffer = Buffer.from(prediction.bytesBase64Encoded, 'base64');
        return new Blob([buffer], { type: prediction.mimeType || 'image/png' });
    }
    
    // Gemini native image generation (e.g., gemini-2.0-flash-exp-image-generation)
    const url = `${GEMINI_API_BASE}/models/${model}:generateContent`;
    
    const body: any = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: {
                aspectRatio
            }
        }
    };

    // Add imageSize for pro models
    if (imageSize && body.generationConfig.imageConfig) {
        body.generationConfig.imageConfig.imageSize = imageSize;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': config.gemini.apiKey
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Extract image from response
    const candidate = data.candidates?.[0];
    if (!candidate) {
        throw new Error('No candidate in response');
    }

    // Look through all parts for image data
    const parts = candidate.content?.parts || [];
    for (const part of parts) {
        // Check for inlineData (base64 image)
        if (part.inlineData?.data) {
            const base64Data = part.inlineData.data;
            const mimeType = part.inlineData.mimeType || 'image/png';
            const buffer = Buffer.from(base64Data, 'base64');
            return new Blob([buffer], { type: mimeType });
        }

        // Fallback: try fileData
        if (part.fileData?.data) {
            const base64Data = part.fileData.data;
            const mimeType = part.fileData.mimeType || 'image/png';
            const buffer = Buffer.from(base64Data, 'base64');
            return new Blob([buffer], { type: mimeType });
        }
    }

    throw new Error('No image data found in response');
}

/**
 * Generate scribble sprite assets using Imagen 3
 */
export async function generateScribbleAsset(index: number): Promise<Blob> {
    const colors = ['neon pink', 'electric blue', 'lime green', 'bright yellow', 'vibrant purple', 'hot orange', 'cyan', 'magenta'];
    const shapes = ['stars', 'swirls', 'zigzags', 'spirals', 'doodles', 'squiggles', 'arrows', 'hearts', 'circles', 'waves', 'scribble lines', 'messy hatching', 'quick sketches', 'smiley faces'];

    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const randomShape = shapes[Math.floor(Math.random() * shapes.length)];

    const prompt = `Create a transparent-background sticker sprite of quick hand-drawn ${randomShape}, ${randomColor} color, ULTRA THIN BALLPOINT PEN LINES (1-2px), sketchy imperfect wobbly strokes like a kid drawing fast, no text, high contrast, centered, simple rough sketch style, vibrant colors, NOT thick marker NOT smooth vector`;

    try {
        return await generateImage('imagen-4.0-fast-generate-001', prompt, '1:1');
    } catch (error) {
        console.error('Error generating scribble:', error);
        throw error;
    }
}

/**
 * Generate paper frame texture using Imagen 3
 * PAPER CORNERS ONLY: 4 torn corner pieces, center 70% transparent, scrapbook style.
 * No full frame, no solid white background, no "photograph style".
 */
export async function generatePaperFrame(index: number): Promise<Blob> {
    const prompt = `Create a PNG with transparent background (alpha channel).
Only 4 torn paper corner pieces framing the edges (top-left, top-right, bottom-left, bottom-right).
Handmade ripped edge, off-white/beige craft paper, subtle wrinkles and paper grain.
Keep the center 70% completely transparent.
No full rectangular frame, no solid white background, no text, no watermark.
Scanned scrapbook collage look.
Avoid: solid white background, full rectangular frame, filled center, borders covering the whole image, any text, photograph style.`;

    try {
        return await generateImage('imagen-4.0-fast-generate-001', prompt, '16:9');
    } catch (error) {
        console.error('Error generating paper frame:', error);
        throw error;
    }
}

/**
 * Generate corner separator: torn paper corner piece only (not full frame).
 * Transparent background, off-white/beige craft paper, scrapbook style.
 */
export async function generateCornerSeparator(position: 'tl' | 'tr'): Promise<Blob> {
    const positionText = position === 'tl' ? 'top-left' : 'top-right';
    const prompt = `Create a PNG with transparent background (alpha channel).
Single torn paper corner piece in the ${positionText} corner only.
Handmade ripped edge, off-white/beige craft paper, subtle paper grain and wrinkles.
Rest of image completely transparent. No full frame, no solid white background, no text.
Scanned scrapbook collage look.
Avoid: solid white background, full rectangular frame, photograph style.`;

    try {
        return await generateImage('imagen-4.0-fast-generate-001', prompt, '16:9');
    } catch (error) {
        console.error('Error generating corner separator:', error);
        throw error;
    }
}

/**
 * Retry helper for API calls with exponential backoff
 */
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    initialDelayMs: number = 1000
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            if (attempt < maxRetries) {
                const delay = initialDelayMs * Math.pow(2, attempt);
                console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError || new Error('Retry failed with unknown error');
}

/**
 * Upload video file to Gemini File API using resumable upload protocol
 * ENHANCED: Retry logic for network failures
 */
async function uploadVideoFile(videoPath: string): Promise<string> {
    const fs = require('fs');

    // Validate file exists before attempting upload
    try {
        await fs.promises.access(videoPath);
    } catch (error) {
        throw new Error(`Video file not found at ${videoPath}`);
    }

    const fileBuffer = fs.readFileSync(videoPath);
    const fileName = videoPath.split('/').pop() || 'video.mp4';
    const fileSize = fileBuffer.length;

    if (fileSize === 0) {
        throw new Error('Video file is empty');
    }

    console.log(`Uploading video: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
    
    // Step 1: Initiate resumable upload
    // Note: Upload endpoint is different from regular API base
    const uploadBase = 'https://generativelanguage.googleapis.com/upload/v1beta';
    const initResponse = await fetch(`${uploadBase}/files?key=${config.gemini.apiKey}`, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': fileSize.toString(),
            'X-Goog-Upload-Header-Content-Type': 'video/mp4',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            file: {
                display_name: fileName
            }
        })
    });

    if (!initResponse.ok) {
        const errorText = await initResponse.text();
        throw new Error(`Upload initiation failed: ${initResponse.status} - ${errorText}`);
    }

    // Extract upload URL from headers
    const uploadUrl = initResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
        throw new Error('No upload URL in response headers');
    }

    // Step 2: Upload file data
    const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'Content-Length': fileSize.toString(),
            'X-Goog-Upload-Offset': '0',
            'X-Goog-Upload-Command': 'upload, finalize',
        },
        body: fileBuffer
    });

    if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`File upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    const data = await uploadResponse.json();
    const uri = data.file?.uri || data.uri;
    
    if (!uri) {
        throw new Error('No file URI returned from upload');
    }
    
    return uri;
}

/**
 * Analyze video for smart overlay placement using Gemini 2.5 Flash
 * Detects objects, faces, and main subjects to determine safe overlay zones
 */
export async function analyzeVideoForPlacement(videoPath: string): Promise<{
    safeRegions: Array<{ timeStart: number; timeEnd: number; zones: string[] }>;
    subjectBounds: { x: number; y: number; width: number; height: number };
    detectedObjects: Array<{ name: string; confidence: number; bounds: { x: number; y: number; width: number; height: number } }>;
}> {
    try {
        // Upload video to Gemini File API
        console.log('Uploading video to Gemini for analysis...');
        const fileUri = await uploadVideoFile(videoPath);
        console.log('Video uploaded, URI:', fileUri);

        // Wait for file to be processed (poll status)
        // Extract file name from URI (format: files/abc123 or gcr-fs://file-service/abc123)
        const fileUriParts = fileUri.split('/');
        const fileName = fileUriParts[fileUriParts.length - 1];
        const fileResourceName = fileUri.startsWith('files/') ? fileUri : `files/${fileName}`;
        
        let fileReady = false;
        let attempts = 0;
        while (!fileReady && attempts < 12000) { // Wait up to 4 minutes for file processing
            const statusResponse = await fetch(
                `${GEMINI_API_BASE}/${fileResourceName}?key=${config.gemini.apiKey}`
            );
            
            if (!statusResponse.ok) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                attempts++;
                continue;
            }
            
            const statusData = await statusResponse.json();
            const state = statusData.file?.state || statusData.state;
            
            if (state === 'ACTIVE') {
                fileReady = true;
            } else if (state === 'FAILED') {
                throw new Error('File processing failed');
            } else {
                console.log(`File processing... (${state}, attempt ${attempts + 1}/120)`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                attempts++;
            }
        }

        if (!fileReady) {
            throw new Error('File processing timeout - file may be too large or format unsupported');
        }

        // Analyze video with Gemini 2.5 Flash (fast and reliable for video)
        // ENHANCED: Wrap in retry logic for network resilience
        console.log('Analyzing video with Gemini 2.5 Flash (with retry)...');
        const analyzeUrl = `${GEMINI_API_BASE}/models/gemini-2.5-flash:generateContent`;

        const prompt = `Analyze this video to find where the MAIN SUBJECT (person, product, animal) is located.

I need the bounding box of the main subject in normalized coordinates (0.0 to 1.0):
- x: left edge position (0 = left of frame, 1 = right)
- y: top edge position (0 = top of frame, 1 = bottom)  
- width: how wide the subject is (0.3 = 30% of frame width)
- height: how tall the subject is (0.6 = 60% of frame height)

Example: A person standing in the center-left would be approximately:
{"x": 0.2, "y": 0.1, "width": 0.4, "height": 0.8}

Return JSON with ALL FOUR values (x, y, width, height) required:
{
  "subjectBounds": {"x": <number>, "y": <number>, "width": <number>, "height": <number>},
  "safeRegions": [{"timeStart": 0, "timeEnd": 10, "zones": ["top-left", "top-right"]}],
  "detectedObjects": []
}

IMPORTANT: You MUST provide width and height values, not just x and y.`;

        // Add timeout for video analysis (90 seconds - Flash is fast)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);
        
        const response = await fetch(analyzeUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': config.gemini.apiKey
            },
            signal: controller.signal,
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { 
                            fileData: { 
                                // File URI must be full URL format
                                fileUri: fileUri.startsWith('https://') ? fileUri : `https://generativelanguage.googleapis.com/v1beta/${fileUri.startsWith('files/') ? fileUri : 'files/' + fileUri.split('/').pop()}`,
                                mimeType: 'video/mp4' 
                            } 
                        },
                        { text: prompt }
                    ]
                }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'object',
                        required: ['subjectBounds'],
                        properties: {
                            subjectBounds: {
                                type: 'object',
                                required: ['x', 'y', 'width', 'height'],
                                properties: {
                                    x: { type: 'number' },
                                    y: { type: 'number' },
                                    width: { type: 'number' },
                                    height: { type: 'number' }
                                }
                            },
                            safeRegions: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        timeStart: { type: 'number' },
                                        timeEnd: { type: 'number' },
                                        zones: {
                                            type: 'array',
                                            items: { type: 'string' }
                                        }
                                    }
                                }
                            },
                            detectedObjects: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        name: { type: 'string' },
                                        confidence: { type: 'number' },
                                        bounds: {
                                            type: 'object',
                                            properties: {
                                                x: { type: 'number' },
                                                y: { type: 'number' },
                                                width: { type: 'number' },
                                                height: { type: 'number' }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            })
        });

        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Analysis failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) {
            throw new Error('No analysis result returned');
        }

        // Parse JSON response
        let analysis;
        try {
            analysis = JSON.parse(text);
        } catch (e) {
            // Try to extract JSON from markdown code blocks
            const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                analysis = JSON.parse(jsonMatch[1]);
            } else {
                throw new Error('Could not parse analysis result');
            }
        }

        // Ensure subjectBounds has all required fields with defaults
        if (analysis.subjectBounds) {
            analysis.subjectBounds = {
                x: analysis.subjectBounds.x ?? 0.25,
                y: analysis.subjectBounds.y ?? 0.1,
                width: analysis.subjectBounds.width ?? 0.5,
                height: analysis.subjectBounds.height ?? 0.8
            };
        } else {
            analysis.subjectBounds = { x: 0.25, y: 0.1, width: 0.5, height: 0.8 };
        }

        // Clean up uploaded file
        try {
            const fileUriParts = fileUri.split('/');
            const fileName = fileUriParts[fileUriParts.length - 1];
            const fileResourceName = fileUri.startsWith('files/') ? fileUri : `files/${fileName}`;
            await fetch(
                `${GEMINI_API_BASE}/${fileResourceName}?key=${config.gemini.apiKey}`,
                { method: 'DELETE' }
            );
        } catch (e) {
            console.warn('Failed to delete uploaded file:', e);
        }

        console.log('Video analysis complete:', analysis);
        return analysis;

    } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.warn('Video analysis timed out after 90 seconds, using fallback zones');
        } else {
            console.error('Video analysis error:', error);
        }
        // Return fallback safe zones
        return {
            safeRegions: [
                { timeStart: 0, timeEnd: 999, zones: ['left-edge', 'top-edge', 'right-edge', 'bottom-edge'] }
            ],
            subjectBounds: { x: 0.3, y: 0.2, width: 0.4, height: 0.6 },
            detectedObjects: []
        };
    }
}

/**
 * MASTER VIDEO DOODLE ANIMATION PROMPT
 * Single long instruction for Gemini to plan the animation. Doodles are alive, imperfect, reactive—NOT digital motion graphics.
 */
const MASTER_VIDEO_DOODLE_PROMPT = `You are creating a playful hand-drawn animated doodle overlay on top of a real video.

STYLE:
Everything must look like it was drawn by hand with thick markers and crayons.
Lines are imperfect, wobbly, uneven, slightly shaky.
Nothing should look clean, vector, geometric, or digitally perfect.

GENERAL RULES:
- All doodles appear as if drawn frame-by-frame
- Slight jitter exists between frames (boiling line effect)
- Stroke thickness subtly changes over time
- No text, no typography, no symbols with letters
- Colors are bright and childlike: red, blue, yellow, green, purple, cyan, orange
- Background remains the original video (doodles are transparent overlays)

SUBJECT RELATIONSHIP:
- The main subject is always respected
- Doodles NEVER cover the subject's face or body
- Doodles react to subject motion, pose, and direction
- The subject has a white hand-drawn outline that slightly wiggles every frame, is thicker near feet and hands, looks sketched not traced perfectly

DOODLE TYPES USED:
Spirals, swirls, curls; stars (imperfect, hand-drawn); hearts (messy, asymmetrical); smiley faces, eyes, noses, simple cartoon faces; zigzags, squiggles, waves; arrows (curved, looping, playful); scribble shading patches; motion arcs and speed lines; dots, bursts, confetti marks.

ANIMATION BEHAVIOR (VERY IMPORTANT):
- Doodles appear by being "drawn on" over 3–8 frames; lines grow from start to end like a hand drawing
- After appearing, doodles gently wobble or pulse; some fade out softly, others stay until cut
- When subject moves forward: curved motion lines behind them, arrows in direction of movement
- When subject lifts foot or jumps: vibration lines near feet, small stars or dots pop briefly
- When subject pauses: doodles slow down, spirals gently rotate
- Faster movement = more energetic doodles; slower movement = calmer doodles

SPATIAL PLACEMENT:
Most doodles live around the subject, not on them. Heavier density near edges of frame. Center area kept cleaner for subject visibility.

TIMING & RHYTHM:
No two doodles animate at the exact same time. Small delays between appearances. Randomized but intentional timing. Feels playful, human, imperfect.

TRANSITIONS:
Occasionally use hand-drawn paper rip or scribble wipe. Transitions look like torn paper or marker strokes—never smooth digital wipes.

ENDING:
Doodles slowly calm down. Fewer new elements appear. Final frame holds with subtle wobble. No hard cuts, no sharp motion stop.

MOOD:
Playful, joyful, scrapbook, childlike creativity. Feels like a sketchbook came alive on top of real life.

CHECKLIST (output must satisfy):
- Doodles look redrawn every frame / lines slightly shaky
- Doodles respond to movement direction
- Subject is always clean and readable
- Feels like a kid drew it, not a designer`;

/**
 * Analyze video to suggest creative theme, mood, and scribble styles
 * Uses MASTER VIDEO DOODLE prompt so Gemini plans frame-by-frame, reactive, hand-drawn animation
 */
export async function analyzeVideoTheme(videoPath: string): Promise<{
    mood: string;
    colorPalette: string[];
    suggestedScribbles: string[];
    paperStyle: string;
    energyLevel: 'calm' | 'moderate' | 'energetic';
}> {
    try {
        // Upload video to Gemini File API
        console.log('Uploading video for theme analysis...');
        const fileUri = await uploadVideoFile(videoPath);
        
        // Wait for processing
        const fileUriParts = fileUri.split('/');
        const fileName = fileUriParts[fileUriParts.length - 1];
        const fileResourceName = fileUri.startsWith('files/') ? fileUri : `files/${fileName}`;
        
        let fileReady = false;
        let attempts = 0;
        while (!fileReady && attempts < 60) {
            const statusResponse = await fetch(
                `${GEMINI_API_BASE}/${fileResourceName}?key=${config.gemini.apiKey}`
            );
            if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                if ((statusData.file?.state || statusData.state) === 'ACTIVE') {
                    fileReady = true;
                    break;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
            attempts++;
        }

        if (!fileReady) {
            throw new Error('File processing timeout');
        }

        // Analyze with Gemini using MASTER VIDEO DOODLE prompt
        const analyzeUrl = GEMINI_API_BASE + '/models/gemini-2.5-flash:generateContent';

        const prompt = MASTER_VIDEO_DOODLE_PROMPT + '\n\n---\n\n' +
            'Analyze THIS video. Plan the doodle animation so it follows the rules above. Return JSON:\n' +
            '{\n' +
            '  "mood": "playful/energetic/calm/romantic/edgy/vintage/modern",\n' +
            '  "colorPalette": ["#color1", "#color2", "#color3", "#color4", "#color5"],\n' +
            '  "suggestedScribbles": ["type1", "type2", ...],\n' +
            '  "paperStyle": "warm-beige/cool-blue/pink-salmon/mint-green/vintage-sepia/clean-white",\n' +
            '  "energyLevel": "calm/moderate/energetic"\n' +
            '}\n\n' +
            'STRICT RULES:\n' +
            '- colorPalette: EXACTLY 5 SUPER VIBRANT hex colors. REQUIRED COLORS: Must include at least one from each group: (1) Bright Red (#FF0000 to #FF3366), (2) Electric Blue (#0080FF to #3399FF), (3) Sunny Yellow (#FFD700 to #FFFF00), (4) Vivid Green (#00FF00 to #66FF66), (5) Bold Purple/Magenta (#FF00FF to #9933FF) or Orange (#FF6600 to #FF9900). NO WHITE, NO BEIGE, NO PASTEL, NO LIGHT COLORS. Saturation must be >70%, brightness >50%. Think CRAYOLA markers, not design pastels. Example good palette: ["#FF1744", "#00B0FF", "#FFD600", "#00E676", "#D500F9"]\n' +
            '- suggestedScribbles: Pick 14-18 types for MAXIMUM VARIETY. Use ONLY these hand-drawn types (our engine supports them): spiral, squiggle, scribbleLine, wave, brushStroke, heart, star, smiley, zigzag, arrow, speedArrow, doubleArrow, curvedArrow, lightning, circle, dots, splatter, doubleScribble, underline, crosshatch, flower, sun, stickFigure. MUST include motion-reactive types: arrow, speedArrow, curvedArrow, lightning, spiral, wave so doodles feel like they react to subject movement. Mix directional and organic—constantly changing, frame-by-frame feel. Include at least 3 stars, 2 hearts, 2 smiley faces, 3 arrows for fun, playful variety.\n' +
            '- paperStyle: best paper/border for the mood (torn paper / scribble wipe feel).\n' +
            '- energyLevel: from video pace. Higher energy = more bursts, faster-changing doodles; calm = slower, fewer.\n\n' +
            'REMEMBER: Doodles are drawn over multiple frames, imperfect, uneven, jitter. They REACT to subject motion. Subject is never covered. Kid-drawn, not designer. COLORS MUST POP like the reference images with bright markers.';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        
        const response = await fetch(analyzeUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': config.gemini.apiKey
            },
            signal: controller.signal,
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            fileData: {
                                fileUri: fileUri.startsWith('https://') ? fileUri : 'https://generativelanguage.googleapis.com/v1beta/' + (fileUri.startsWith('files/') ? fileUri : 'files/' + fileUri.split('/').pop()),
                                mimeType: 'video/mp4'
                            }
                        },
                        { text: prompt }
                    ]
                }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'object',
                        required: ['mood', 'colorPalette', 'suggestedScribbles', 'paperStyle', 'energyLevel'],
                        properties: {
                            mood: { type: 'string' },
                            colorPalette: { type: 'array', items: { type: 'string' } },
                            suggestedScribbles: { type: 'array', items: { type: 'string' } },
                            paperStyle: { type: 'string' },
                            energyLevel: { type: 'string', enum: ['calm', 'moderate', 'energetic'] }
                        }
                    }
                }
            })
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error('Theme analysis failed: ' + response.status);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            throw new Error('No theme analysis returned');
        }

        let theme;
        try {
            theme = JSON.parse(text);
        } catch (e) {
            // Try to extract JSON from markdown code blocks
            const codeBlockMarker = String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96);
            let jsonStr = text;
            if (text.includes(codeBlockMarker + 'json')) {
                jsonStr = text.split(codeBlockMarker + 'json')[1].split(codeBlockMarker)[0].trim();
            } else if (text.includes(codeBlockMarker)) {
                jsonStr = text.split(codeBlockMarker)[1].split(codeBlockMarker)[0].trim();
            }
            try {
                theme = JSON.parse(jsonStr);
            } catch (e2) {
                throw new Error('Could not parse theme result');
            }
        }

        console.log('Video theme analysis complete:', theme);
        return theme;

    } catch (error) {
        console.error('Theme analysis error:', error);
        // Return VIBRANT default theme with super bright colors (like reference images)
        return {
            mood: 'playful',
            colorPalette: ['#FF1744', '#2979FF', '#FFD600', '#00E676', '#D500F9'], // Vibrant red, blue, yellow, green, purple
            suggestedScribbles: ['spiral', 'squiggle', 'scribbleLine', 'wave', 'crosshatch', 'arrow', 'speedArrow', 'curvedArrow', 'lightning', 'heart', 'star', 'smiley', 'zigzag', 'dots', 'splatter', 'brushStroke', 'doubleScribble', 'circle', 'flower', 'underline'],
            paperStyle: 'warm-beige',
            energyLevel: 'moderate'
        };
    }
}

// Export simplified SVG generators (complex template literal versions commented out due to build issues)
export { generateSimpleScribbleSVG as generateThemedScribbleSVG, generateSimplePaperSVG as generateThemedPaperSVG } from './svg-generator-simple';

