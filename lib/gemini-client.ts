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
    const shapes = ['stars', 'swirls', 'zigzags', 'spirals', 'doodles', 'squiggles', 'arrows', 'hearts', 'circles', 'waves'];

    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const randomShape = shapes[Math.floor(Math.random() * shapes.length)];

    const prompt = `Create a transparent-background sticker sprite of messy hand-drawn ${randomShape}, ${randomColor} color, playful marker texture, no text, thick strokes, high contrast, centered, digital art style, vibrant colors`;

    try {
        return await generateImage('imagen-3.0-generate-002', prompt, '1:1');
    } catch (error) {
        console.error('Error generating scribble:', error);
        throw error;
    }
}

/**
 * Generate paper frame texture using Imagen 3
 */
export async function generatePaperFrame(index: number): Promise<Blob> {
    const variations = [
        'worn notebook paper edges, subtle creases',
        'rough torn paper border, handmade texture',
        'vintage paper frame, slight yellowing',
        'craft paper edges, natural fiber texture',
        'distressed paper border, coffee stains',
        'recycled paper frame, rough edges',
        'watercolor paper texture, organic border',
        'canvas paper edges, artistic feel'
    ];

    const variation = variations[index % variations.length];

    const prompt = `Create a paper frame border texture: ${variation}, slight stains, handmade cutout look, empty transparent center, 1920x1080, no text, photograph style, realistic paper texture`;

    try {
        return await generateImage('imagen-3.0-generate-002', prompt, '16:9');
    } catch (error) {
        console.error('Error generating paper frame:', error);
        throw error;
    }
}

/**
 * Generate white corner separator element
 */
export async function generateCornerSeparator(position: 'tl' | 'tr'): Promise<Blob> {
    const positionText = position === 'tl' ? 'top-left' : 'top-right';
    const prompt = `Create a white painted foreground corner smear, soft feathered edge, like a white brush stroke overlay in the ${positionText} corner, 1920x1080, no text, artistic paint texture, translucent white paint effect`;

    try {
        return await generateImage('imagen-3.0-generate-002', prompt, '16:9');
    } catch (error) {
        console.error('Error generating corner separator:', error);
        throw error;
    }
}

/**
 * Upload video file to Gemini File API using resumable upload protocol
 */
async function uploadVideoFile(videoPath: string): Promise<string> {
    const fs = require('fs');
    const fileBuffer = fs.readFileSync(videoPath);
    const fileName = videoPath.split('/').pop() || 'video.mp4';
    const fileSize = fileBuffer.length;
    
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
        console.log('Analyzing video with Gemini 2.5 Flash...');
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
 * Analyze video to suggest creative theme, mood, and scribble styles
 * Uses Gemini 2.5 Flash for fast creative analysis
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

        // Analyze with Gemini
        const analyzeUrl = `${GEMINI_API_BASE}/models/gemini-2.5-flash:generateContent`;
        
        const prompt = `Analyze this video's visual style, mood, and energy to suggest creative handdrawn style doodle only overlay decorations best way properly.

Return JSON with:
{
  "mood": "playful/energetic/calm/romantic/edgy/vintage/modern",
  "colorPalette": ["#color1", "#color2", "#color3", "#color4", "#color5"],
  "suggestedScribbles": ["heart", "star", "squiggle", "smiley", "wave", "lightning", "flower", "brushStroke", "spiral", "splatter", "crown", "moon"],
  "paperStyle": "warm-beige/cool-blue/pink-salmon/mint-green/vintage-sepia/clean-white",
  "energyLevel": "calm/moderate/energetic"
}

- colorPalette: 5 vivid hex colors that complement and contrast with the video
- suggestedScribbles: pick 10-15 DIVERSE hand-drawn scribble types for variety (from: heart, star, spiral, smiley, zigzag, arrow, circle, xmark, sun, squiggle, scribbleLine, wave, underline, doubleScribble, dots, lightning, exclaim, question, crosshatch, flower, curvedArrow, brushStroke, splatter, stickFigure) - prefer messy organic types like squiggle, scribbleLine, wave, brushStroke, underline for hand-drawn feel
- paperStyle: what paper/border style fits best
- energyLevel: calm/moderate/energetic based on video pace and action`;

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
            throw new Error(`Theme analysis failed: ${response.status}`);
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
            const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                theme = JSON.parse(jsonMatch[1]);
            } else {
                throw new Error('Could not parse theme result');
            }
        }

        console.log('Video theme analysis complete:', theme);
        return theme;

    } catch (error) {
        console.error('Theme analysis error:', error);
        // Return diverse default theme
        return {
            mood: 'playful',
            colorPalette: ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181'],
            suggestedScribbles: ['squiggle', 'scribbleLine', 'wave', 'brushStroke', 'underline', 'heart', 'star', 'smiley', 'spiral', 'dots', 'splatter', 'zigzag', 'curvedArrow', 'doubleScribble', 'crosshatch'],
            paperStyle: 'warm-beige',
            energyLevel: 'moderate'
        };
    }
}

/**





* Add hand-drawn wobble to a path by adding noise to control points
 * This makes shapes look like they were drawn with a shaky hand
 */
function addWobble(value: number, intensity: number = 3, seed: number = 0): number {
    const noise = Math.sin(seed * 12.9898 + value * 78.233) * intensity;
    return value + noise;
}

/**
 * Generate a wobbly path string for hand-drawn effect
 */
function wobblePath(points: Array<{x: number, y: number}>, seed: number = 0): string {
    if (points.length < 2) return '';
    
    const wobbleIntensity = 2.5;
    let d = `M${addWobble(points[0].x, wobbleIntensity, seed)} ${addWobble(points[0].y, wobbleIntensity, seed + 1)}`;
    
    for (let i = 1; i < points.length; i++) {
        const p = points[i];
        const wobbleX = addWobble(p.x, wobbleIntensity, seed + i * 2);
        const wobbleY = addWobble(p.y, wobbleIntensity, seed + i * 2 + 1);
        
        // Use quadratic curves for smoother hand-drawn look
        if (i < points.length - 1) {
            const next = points[i + 1];
            const cpX = wobbleX + (Math.random() - 0.5) * 4;
            const cpY = wobbleY + (Math.random() - 0.5) * 4;
            d += ` Q${cpX.toFixed(1)} ${cpY.toFixed(1)} ${addWobble(next.x, wobbleIntensity, seed + i * 3).toFixed(1)} ${addWobble(next.y, wobbleIntensity, seed + i * 3 + 1).toFixed(1)}`;
            i++; // Skip next point as we used it
        } else {
            d += ` L${wobbleX.toFixed(1)} ${wobbleY.toFixed(1)}`;
        }
    }
    
    return d;
}

/**
 * Generate HAND-DRAWN style scribble SVGs
 * Features: wobbly lines, rough strokes, marker texture, imperfect shapes
 */
export function generateThemedScribbleSVG(
    type: string,
    color: string,
    size: number = 200
): string {
    // THICK strokes for bold marker look
    const sw = Math.max(6, size / 14);
    const seed = type.charCodeAt(0) + color.charCodeAt(1);
    
    // Roughness filter for hand-drawn texture
    const roughFilter = `
        <filter id="rough${seed}" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise"/>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
    `;
    
    // Generate wobbly hand-drawn shapes
    const generateWobblyCircle = (cx: number, cy: number, r: number, s: number) => {
        const points: Array<{x: number, y: number}> = [];
        const segments = 12;
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const wobbleR = r + (Math.sin(s + i * 2.5) * r * 0.08);
            points.push({
                x: cx + Math.cos(angle) * wobbleR,
                y: cy + Math.sin(angle) * wobbleR
            });
        }
        return wobblePath(points, s) + 'Z';
    };
    
    const scribbleShapes: Record<string, string> = {
        // MESSY hand-drawn heart
        heart: `<path d="${(() => {
            const pts = [];
            for (let t = 0; t <= 1; t += 0.05) {
                const angle = t * Math.PI * 2;
                const x = size/2 + (16 * Math.pow(Math.sin(angle), 3)) * (size/50) + (Math.random()-0.5)*3;
                const y = size/2 - (13 * Math.cos(angle) - 5 * Math.cos(2*angle) - 2 * Math.cos(3*angle) - Math.cos(4*angle)) * (size/50) + (Math.random()-0.5)*3;
                pts.push({x, y});
            }
            return wobblePath(pts, seed) + 'Z';
        })()}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" filter="url(#rough${seed})"/>`,
        
        // WOBBLY star (hand-drawn style)
        star: `<path d="${(() => {
            const pts = [];
            const cx = size/2, cy = size/2;
            for (let i = 0; i < 10; i++) {
                const angle = (i * Math.PI / 5) - Math.PI / 2;
                const r = i % 2 === 0 ? size * 0.4 : size * 0.18;
                pts.push({
                    x: cx + Math.cos(angle) * r + (Math.random()-0.5)*4,
                    y: cy + Math.sin(angle) * r + (Math.random()-0.5)*4
                });
            }
            pts.push(pts[0]); // Close
            return wobblePath(pts, seed);
        })()}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" filter="url(#rough${seed})"/>`,
        
        // MESSY spiral scribble
        spiral: `<path d="M${size/2} ${size/2} ${(() => {
            let d = '';
            for (let i = 0; i < 3; i++) {
                const r1 = size * 0.08 + i * size * 0.12;
                const r2 = r1 + size * 0.12;
                d += ` Q${size/2 + r1 + (Math.random()-0.5)*5} ${size/2 - r1/2 + (Math.random()-0.5)*4} ${size/2 + r2} ${size/2 + (Math.random()-0.5)*4}`;
                d += ` Q${size/2 + r2 + (Math.random()-0.5)*5} ${size/2 + r2/2 + (Math.random()-0.5)*4} ${size/2} ${size/2 + r2 + (Math.random()-0.5)*4}`;
                d += ` Q${size/2 - r2/2 + (Math.random()-0.5)*5} ${size/2 + r2 + (Math.random()-0.5)*4} ${size/2 - r2} ${size/2 + (Math.random()-0.5)*4}`;
            }
            return d;
        })()}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" filter="url(#rough${seed})"/>`,
        
        // WOBBLY smiley face
        smiley: `<path d="${generateWobblyCircle(size/2, size/2, size*0.38, seed)}" fill="none" stroke="${color}" stroke-width="${sw}" filter="url(#rough${seed})"/>
            <ellipse cx="${size*0.36}" cy="${size*0.42}" rx="${size*0.055}" ry="${size*0.07}" fill="${color}" transform="rotate(${-5 + Math.random()*10} ${size*0.36} ${size*0.42})"/>
            <ellipse cx="${size*0.64}" cy="${size*0.42}" rx="${size*0.055}" ry="${size*0.07}" fill="${color}" transform="rotate(${-5 + Math.random()*10} ${size*0.64} ${size*0.42})"/>
            <path d="M${size*0.3} ${size*0.58} Q${size*0.38 + (Math.random()-0.5)*5} ${size*0.72 + (Math.random()-0.5)*4} ${size/2} ${size*0.72} Q${size*0.62 + (Math.random()-0.5)*5} ${size*0.72 + (Math.random()-0.5)*4} ${size*0.7} ${size*0.58}" fill="none" stroke="${color}" stroke-width="${sw*0.9}" stroke-linecap="round" filter="url(#rough${seed})"/>`,
        
        // MESSY zigzag
        zigzag: `<path d="M${size*0.08 + (Math.random()-0.5)*4} ${size*0.35} L${size*0.28 + (Math.random()-0.5)*5} ${size*0.7 + (Math.random()-0.5)*4} L${size*0.48 + (Math.random()-0.5)*5} ${size*0.3 + (Math.random()-0.5)*4} L${size*0.68 + (Math.random()-0.5)*5} ${size*0.7 + (Math.random()-0.5)*4} L${size*0.92 + (Math.random()-0.5)*4} ${size*0.35}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" filter="url(#rough${seed})"/>`,
        
        // HAND-DRAWN arrow
        arrow: `<path d="M${size*0.15 + (Math.random()-0.5)*3} ${size*0.5 + (Math.random()-0.5)*4} L${size*0.82 + (Math.random()-0.5)*3} ${size*0.5 + (Math.random()-0.5)*4}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" filter="url(#rough${seed})"/>
            <path d="M${size*0.62 + (Math.random()-0.5)*3} ${size*0.32} L${size*0.85} ${size*0.5} L${size*0.62 + (Math.random()-0.5)*3} ${size*0.68}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" filter="url(#rough${seed})"/>`,
        
        // WOBBLY circle (imperfect)
        circle: `<path d="${generateWobblyCircle(size/2, size/2, size*0.36, seed)}" fill="none" stroke="${color}" stroke-width="${sw}" filter="url(#rough${seed})"/>`,
        
        // MESSY X mark
        xmark: `<path d="M${size*0.22 + (Math.random()-0.5)*4} ${size*0.22 + (Math.random()-0.5)*4} L${size*0.78 + (Math.random()-0.5)*4} ${size*0.78 + (Math.random()-0.5)*4}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" filter="url(#rough${seed})"/>
            <path d="M${size*0.78 + (Math.random()-0.5)*4} ${size*0.22 + (Math.random()-0.5)*4} L${size*0.22 + (Math.random()-0.5)*4} ${size*0.78 + (Math.random()-0.5)*4}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" filter="url(#rough${seed})"/>`,
        
        // HAND-DRAWN sun with wobbly rays
        sun: `<path d="${generateWobblyCircle(size/2, size/2, size*0.14, seed)}" fill="none" stroke="${color}" stroke-width="${sw}" filter="url(#rough${seed})"/>
            ${[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
                const rad = (angle * Math.PI) / 180;
                const x1 = size/2 + Math.cos(rad) * size * 0.22 + (Math.random()-0.5)*3;
                const y1 = size/2 + Math.sin(rad) * size * 0.22 + (Math.random()-0.5)*3;
                const x2 = size/2 + Math.cos(rad) * size * 0.4 + (Math.random()-0.5)*4;
                const y2 = size/2 + Math.sin(rad) * size * 0.4 + (Math.random()-0.5)*4;
                return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw*0.8}" stroke-linecap="round" filter="url(#rough${seed})"/>`;
            }).join('')}`,
        
        // MESSY squiggle line
        squiggle: `<path d="M${size*0.1} ${size*0.5} C${size*0.2 + (Math.random()-0.5)*8} ${size*0.2 + (Math.random()-0.5)*10} ${size*0.35 + (Math.random()-0.5)*8} ${size*0.8 + (Math.random()-0.5)*10} ${size*0.5} ${size*0.45} C${size*0.65 + (Math.random()-0.5)*8} ${size*0.1 + (Math.random()-0.5)*10} ${size*0.75 + (Math.random()-0.5)*8} ${size*0.85 + (Math.random()-0.5)*10} ${size*0.9} ${size*0.55}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" filter="url(#rough${seed})"/>`,
        
        // RANDOM scribble lines (very hand-drawn)
        scribbleLine: `<path d="M${size*0.1} ${size*0.4 + (Math.random()-0.5)*15} Q${size*0.3} ${size*0.2 + (Math.random()-0.5)*20} ${size*0.45} ${size*0.55 + (Math.random()-0.5)*15} T${size*0.7} ${size*0.35 + (Math.random()-0.5)*20} T${size*0.9} ${size*0.6 + (Math.random()-0.5)*15}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" filter="url(#rough${seed})"/>`,
        
        // WOBBLY wave
        wave: `<path d="M${size*0.05} ${size*0.5} Q${size*0.18 + (Math.random()-0.5)*5} ${size*0.25 + (Math.random()-0.5)*8} ${size*0.35} ${size*0.5 + (Math.random()-0.5)*5} T${size*0.65} ${size*0.5 + (Math.random()-0.5)*5} T${size*0.95} ${size*0.5 + (Math.random()-0.5)*5}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" filter="url(#rough${seed})"/>`,
        
        // MESSY underline (like highlighting)
        underline: `<path d="M${size*0.08} ${size*0.6} Q${size*0.25 + (Math.random()-0.5)*10} ${size*0.55 + (Math.random()-0.5)*8} ${size*0.5} ${size*0.62 + (Math.random()-0.5)*6} T${size*0.92} ${size*0.58 + (Math.random()-0.5)*8}" fill="none" stroke="${color}" stroke-width="${sw*1.5}" stroke-linecap="round" filter="url(#rough${seed})"/>`,
        
        // DOUBLE scribble line
        doubleScribble: `<path d="M${size*0.08} ${size*0.38} Q${size*0.5} ${size*0.25 + (Math.random()-0.5)*15} ${size*0.92} ${size*0.42 + (Math.random()-0.5)*10}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" filter="url(#rough${seed})"/>
            <path d="M${size*0.08} ${size*0.62} Q${size*0.5} ${size*0.75 + (Math.random()-0.5)*15} ${size*0.92} ${size*0.58 + (Math.random()-0.5)*10}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" filter="url(#rough${seed})"/>`,
        
        // RANDOM dots cluster
        dots: `${Array.from({length: 6 + Math.floor(Math.random()*4)}, (_, i) => {
            const x = size * (0.2 + Math.random() * 0.6);
            const y = size * (0.2 + Math.random() * 0.6);
            const r = size * (0.03 + Math.random() * 0.05);
            return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" filter="url(#rough${seed})"/>`;
        }).join('')}`,
        
        // WOBBLY lightning bolt
        lightning: `<path d="M${size*0.55 + (Math.random()-0.5)*5} ${size*0.08} L${size*0.32 + (Math.random()-0.5)*5} ${size*0.45 + (Math.random()-0.5)*5} L${size*0.52 + (Math.random()-0.5)*4} ${size*0.48} L${size*0.38 + (Math.random()-0.5)*5} ${size*0.92}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" filter="url(#rough${seed})"/>`,
        
        // HAND-DRAWN exclamation
        exclaim: `<path d="M${size*0.5 + (Math.random()-0.5)*4} ${size*0.12} L${size*0.5 + (Math.random()-0.5)*6} ${size*0.58}" stroke="${color}" stroke-width="${sw*1.8}" stroke-linecap="round" filter="url(#rough${seed})"/>
            <ellipse cx="${size*0.5}" cy="${size*0.78}" rx="${size*0.06}" ry="${size*0.065}" fill="${color}" transform="rotate(${(Math.random()-0.5)*15} ${size*0.5} ${size*0.78})" filter="url(#rough${seed})"/>`,
        
        // MESSY question mark
        question: `<path d="M${size*0.32 + (Math.random()-0.5)*4} ${size*0.28} Q${size*0.32} ${size*0.12 + (Math.random()-0.5)*4} ${size*0.5} ${size*0.12 + (Math.random()-0.5)*3} Q${size*0.72 + (Math.random()-0.5)*4} ${size*0.12} ${size*0.72 + (Math.random()-0.5)*4} ${size*0.32} Q${size*0.72} ${size*0.48 + (Math.random()-0.5)*4} ${size*0.5 + (Math.random()-0.5)*3} ${size*0.55} L${size*0.5 + (Math.random()-0.5)*4} ${size*0.65}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" filter="url(#rough${seed})"/>
            <ellipse cx="${size*0.5}" cy="${size*0.8}" rx="${size*0.05}" ry="${size*0.055}" fill="${color}" filter="url(#rough${seed})"/>`,
        
        // CROSSHATCH scribble
        crosshatch: `${Array.from({length: 4}, (_, i) => {
            const y = size * (0.25 + i * 0.15) + (Math.random()-0.5)*8;
            return `<line x1="${size*0.15 + (Math.random()-0.5)*5}" y1="${y}" x2="${size*0.85 + (Math.random()-0.5)*5}" y2="${y + (Math.random()-0.5)*10}" stroke="${color}" stroke-width="${sw*0.7}" stroke-linecap="round" filter="url(#rough${seed})"/>`;
        }).join('')}
        ${Array.from({length: 4}, (_, i) => {
            const x = size * (0.25 + i * 0.15) + (Math.random()-0.5)*8;
            return `<line x1="${x}" y1="${size*0.15 + (Math.random()-0.5)*5}" x2="${x + (Math.random()-0.5)*10}" y2="${size*0.85 + (Math.random()-0.5)*5}" stroke="${color}" stroke-width="${sw*0.7}" stroke-linecap="round" filter="url(#rough${seed})"/>`;
        }).join('')}`,
        
        // WOBBLY flower
        flower: `<circle cx="${size/2}" cy="${size/2}" r="${size*0.08}" fill="${color}" filter="url(#rough${seed})"/>
            ${[0, 60, 120, 180, 240, 300].map((angle, i) => {
                const rad = (angle * Math.PI) / 180;
                const px = size/2 + Math.cos(rad) * size * 0.22;
                const py = size/2 + Math.sin(rad) * size * 0.22;
                return `<ellipse cx="${px}" cy="${py}" rx="${size*0.08}" ry="${size*0.14}" fill="none" stroke="${color}" stroke-width="${sw*0.8}" transform="rotate(${angle + 90 + (Math.random()-0.5)*10} ${px} ${py})" filter="url(#rough${seed})"/>`;
            }).join('')}`,
        
        // MESSY curved arrow
        curvedArrow: `<path d="M${size*0.18 + (Math.random()-0.5)*4} ${size*0.72} Q${size*0.18} ${size*0.28 + (Math.random()-0.5)*8} ${size*0.5 + (Math.random()-0.5)*5} ${size*0.28} T${size*0.82} ${size*0.52 + (Math.random()-0.5)*5}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" filter="url(#rough${seed})"/>
            <path d="M${size*0.68 + (Math.random()-0.5)*3} ${size*0.38} L${size*0.82} ${size*0.52} L${size*0.68 + (Math.random()-0.5)*3} ${size*0.66}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" filter="url(#rough${seed})"/>`,
        
        // BRUSH stroke (thick messy)
        brushStroke: `<path d="M${size*0.08} ${size*0.55 + (Math.random()-0.5)*15} Q${size*0.35} ${size*0.35 + (Math.random()-0.5)*20} ${size*0.55} ${size*0.52 + (Math.random()-0.5)*15} T${size*0.92} ${size*0.45 + (Math.random()-0.5)*20}" fill="none" stroke="${color}" stroke-width="${sw*2.5}" stroke-linecap="round" opacity="0.85" filter="url(#rough${seed})"/>`,
        
        // PAINT splatter
        splatter: `<circle cx="${size/2}" cy="${size/2}" r="${size*0.14}" fill="${color}" filter="url(#rough${seed})"/>
            ${Array.from({length: 8}, () => {
                const angle = Math.random() * Math.PI * 2;
                const dist = size * (0.18 + Math.random() * 0.25);
                const x = size/2 + Math.cos(angle) * dist;
                const y = size/2 + Math.sin(angle) * dist;
                const r = size * (0.02 + Math.random() * 0.04);
                return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" filter="url(#rough${seed})"/>`;
            }).join('')}`,
        
        // SIMPLE stick figure
        stickFigure: `<circle cx="${size/2}" cy="${size*0.18}" r="${size*0.1}" fill="none" stroke="${color}" stroke-width="${sw}" filter="url(#rough${seed})"/>
            <line x1="${size/2 + (Math.random()-0.5)*3}" y1="${size*0.28}" x2="${size/2 + (Math.random()-0.5)*4}" y2="${size*0.58}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" filter="url(#rough${seed})"/>
            <line x1="${size*0.28 + (Math.random()-0.5)*4}" y1="${size*0.42 + (Math.random()-0.5)*4}" x2="${size*0.72 + (Math.random()-0.5)*4}" y2="${size*0.42 + (Math.random()-0.5)*4}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" filter="url(#rough${seed})"/>
            <line x1="${size/2}" y1="${size*0.58}" x2="${size*0.32 + (Math.random()-0.5)*4}" y2="${size*0.88}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" filter="url(#rough${seed})"/>
            <line x1="${size/2}" y1="${size*0.58}" x2="${size*0.68 + (Math.random()-0.5)*4}" y2="${size*0.88}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" filter="url(#rough${seed})"/>`,
    };
    
    const shape = scribbleShapes[type] || scribbleShapes.squiggle;
    
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>${roughFilter}</defs>
        ${shape}
    </svg>`;
}

/**
 * Generate BEAUTIFUL scrapbook paper border - torn paper edges creating a frame
 * The paper pieces frame the edges while keeping center clear for the subject
 */
export function generateThemedPaperSVG(
    style: string,
    variant: number,
    width: number = 1280,
    height: number = 720
): string {
    // Warm, craft paper color palettes
    const colorPalettes: Record<string, string[]> = {
        'warm-beige': ['#F5E6D3', '#EAD9C4', '#DFC9AE', '#D4B998', '#F0DCC5', '#E5D0B5'],
        'cool-blue': ['#E8F0F5', '#D4E4ED', '#C0D8E5', '#ACCBDD', '#98BFD5', '#B8D4E8'],
        'pink-salmon': ['#F5E8E6', '#EDD4D0', '#E5C0BA', '#DDACA4', '#D5988E', '#EACAC4'],
        'mint-green': ['#E8F5EE', '#D4EDE2', '#C0E5D6', '#ACDDCA', '#98D5BE', '#C8EAD8'],
        'vintage-sepia': ['#EAE0D0', '#DDD0BB', '#D0C0A6', '#C3B091', '#B6A07C', '#E0D4C0'],
        'clean-white': ['#FAF8F5', '#F5F2ED', '#F0ECE5', '#EBE6DD', '#E6E0D5', '#FFFFFF']
    };
    
    const colors = colorPalettes[style] || colorPalettes['warm-beige'];
    
    // Paper frame configurations - CORNER FOCUSED for clean center
    // Each config creates a beautiful torn paper border
    const configs = [
        // Variant 0: Corner pieces - classic scrapbook look
        [
            { x: -30, y: -25, w: 220, h: 200, rot: -5 },      // Top-left
            { x: width - 200, y: -30, w: 240, h: 190, rot: 6 }, // Top-right
            { x: -35, y: height - 180, w: 230, h: 220, rot: 8 }, // Bottom-left
            { x: width - 210, y: height - 190, w: 250, h: 230, rot: -7 }, // Bottom-right
        ],
        // Variant 1: Offset corners with overlap
        [
            { x: -40, y: -20, w: 250, h: 180, rot: -3 },
            { x: width - 180, y: -35, w: 220, h: 200, rot: 4 },
            { x: -25, y: height - 200, w: 200, h: 240, rot: 6 },
            { x: width - 230, y: height - 170, w: 270, h: 210, rot: -5 },
        ],
        // Variant 2: Larger corner pieces
        [
            { x: -50, y: -40, w: 280, h: 240, rot: -6 },
            { x: width - 250, y: -45, w: 300, h: 260, rot: 8 },
            { x: -45, y: height - 230, w: 290, h: 270, rot: 10 },
            { x: width - 270, y: height - 220, w: 320, h: 260, rot: -8 },
        ],
        // Variant 3: Asymmetric artistic
        [
            { x: -35, y: -30, w: 200, h: 220, rot: -4 },
            { x: width - 220, y: -25, w: 260, h: 180, rot: 5 },
            { x: -30, y: height - 220, w: 240, h: 260, rot: 7 },
            { x: width - 200, y: height - 200, w: 240, h: 240, rot: -6 },
        ],
    ];
    
    const pieces = configs[variant % configs.length];
    
    let svgPieces = '';
    pieces.forEach((piece, i) => {
        const color = colors[i % colors.length];
        const darkerColor = colors[(i + 3) % colors.length];
        
        // Create torn paper path with irregular edges
        const tornPath = createTornPaperPath(piece.w, piece.h, i + variant);
        
        svgPieces += `
            <g transform="translate(${piece.x}, ${piece.y}) rotate(${piece.rot})">
                <!-- Soft shadow -->
                <path d="${tornPath}" fill="rgba(0,0,0,0.12)" transform="translate(6, 6)" filter="url(#paperBlur${variant})"/>
                <!-- Main paper piece with texture -->
                <path d="${tornPath}" fill="${color}" filter="url(#paperTexture${variant})"/>
                <!-- Inner edge shadow for depth -->
                <path d="${tornPath}" fill="none" stroke="${darkerColor}" stroke-width="1.5" opacity="0.25"/>
            </g>
        `;
    });
    
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="paperBlur${variant}">
                <feGaussianBlur in="SourceGraphic" stdDeviation="5"/>
            </filter>
            <filter id="paperTexture${variant}">
                <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="5" result="noise"/>
                <feDiffuseLighting in="noise" lighting-color="#FFF8F0" surfaceScale="0.8" result="light">
                    <feDistantLight azimuth="45" elevation="55"/>
                </feDiffuseLighting>
                <feComposite in="SourceGraphic" in2="light" operator="arithmetic" k1="0.9" k2="0.1" k3="0" k4="0"/>
            </filter>
        </defs>
        ${svgPieces}
    </svg>`;
}

/**
 * Create a torn paper path with irregular edges
 */
function createTornPaperPath(w: number, h: number, seed: number): string {
    const points: Array<{x: number, y: number}> = [];
    const segments = 20;
    const tearAmount = 15;
    
    // Random but seeded variations
    const rand = (i: number) => Math.sin(seed * 12.9898 + i * 78.233) * 0.5 + 0.5;
    
    // Top edge (left to right)
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        points.push({
            x: t * w,
            y: rand(i) * tearAmount - tearAmount/2
        });
    }
    
    // Right edge (top to bottom)
    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        points.push({
            x: w + rand(i + segments) * tearAmount - tearAmount/2,
            y: t * h
        });
    }
    
    // Bottom edge (right to left)
    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        points.push({
            x: w - t * w,
            y: h + rand(i + segments*2) * tearAmount - tearAmount/2
        });
    }
    
    // Left edge (bottom to top)
    for (let i = 1; i < segments; i++) {
        const t = i / segments;
        points.push({
            x: rand(i + segments*3) * tearAmount - tearAmount/2,
            y: h - t * h
        });
    }
    
    // Create path
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        path += ` L ${points[i].x} ${points[i].y}`;
    }
    path += ' Z';
    
    return path;
}
