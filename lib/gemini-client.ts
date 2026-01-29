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
