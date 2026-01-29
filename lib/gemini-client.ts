import { config } from './config';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Call Gemini image generation API directly
 */
async function generateImage(
    model: string,
    prompt: string,
    aspectRatio: string = '1:1',
    imageSize?: string
): Promise<Blob> {
    const url = `${GEMINI_API_BASE}/models/${model}:generateContent`;
    
    const body: any = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        generationConfig: {
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

    const part = candidate.content?.parts?.[0];
    if (!part) {
        throw new Error('No parts in response');
    }

    // Check for inlineData (base64 image)
    if (part.inlineData) {
        const base64Data = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || 'image/png';
        const buffer = Buffer.from(base64Data, 'base64');
        return new Blob([buffer], { type: mimeType });
    }

    // Fallback: try fileData
    if (part.fileData) {
        const base64Data = part.fileData.data;
        const mimeType = part.fileData.mimeType || 'image/png';
        const buffer = Buffer.from(base64Data, 'base64');
        return new Blob([buffer], { type: mimeType });
    }

    throw new Error('No image data found in response');
}

/**
 * Generate scribble sprite assets using Nano Banana (gemini-2.5-flash-image)
 */
export async function generateScribbleAsset(index: number): Promise<Blob> {
    const colors = ['neon pink', 'electric blue', 'lime green', 'bright yellow', 'vibrant purple', 'hot orange', 'cyan', 'magenta'];
    const shapes = ['stars', 'swirls', 'zigzags', 'spirals', 'doodles', 'squiggles', 'arrows', 'hearts', 'circles', 'waves'];

    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const randomShape = shapes[Math.floor(Math.random() * shapes.length)];

    const prompt = `Create a transparent-background sticker sprite of messy hand-drawn ${randomShape}, ${randomColor} color, playful marker texture, no text, thick strokes, high contrast, centered, digital art style, vibrant colors`;

    try {
        return await generateImage('gemini-2.5-flash-image', prompt, '1:1');
    } catch (error) {
        console.error('Error generating scribble:', error);
        throw error;
    }
}

/**
 * Generate paper frame texture using Nano Banana Pro (gemini-3-pro-image-preview)
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
        return await generateImage('gemini-3-pro-image-preview', prompt, '16:9', '2K');
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
        return await generateImage('gemini-2.5-flash-image', prompt, '16:9');
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
 * Analyze video for smart overlay placement using Gemini 3 Pro
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
        while (!fileReady && attempts < 60) { // Wait up to 60 seconds
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
                console.log(`File processing... (${state}, attempt ${attempts + 1}/60)`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                attempts++;
            }
        }

        if (!fileReady) {
            throw new Error('File processing timeout - file may be too large or format unsupported');
        }

        // Analyze video with Gemini 3 Pro
        console.log('Analyzing video with Gemini 3 Pro...');
        const analyzeUrl = `${GEMINI_API_BASE}/models/gemini-3-pro-preview:generateContent`;
        
        const prompt = `Analyze this video and provide detailed information about:
1. Main subjects (people, objects, animals) and their positions throughout the video
2. Faces and their locations
3. Safe zones where overlays can be placed without blocking important content
4. Subject movement patterns

Return a JSON object with this structure:
{
  "subjectBounds": {
    "x": 0.0-1.0 (normalized left position),
    "y": 0.0-1.0 (normalized top position),
    "width": 0.0-1.0 (normalized width),
    "height": 0.0-1.0 (normalized height)
  },
  "safeRegions": [
    {
      "timeStart": seconds,
      "timeEnd": seconds,
      "zones": ["left-edge", "top-edge", "right-edge", "bottom-edge", "corners"]
    }
  ],
  "detectedObjects": [
    {
      "name": "object name",
      "confidence": 0.0-1.0,
      "bounds": {
        "x": 0.0-1.0,
        "y": 0.0-1.0,
        "width": 0.0-1.0,
        "height": 0.0-1.0
      }
    }
  ]
}

Be very precise about subject locations. If subjects move, provide multiple time segments.`;

        const response = await fetch(analyzeUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': config.gemini.apiKey
            },
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
                        properties: {
                            subjectBounds: {
                                type: 'object',
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

    } catch (error) {
        console.error('Video analysis error:', error);
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
