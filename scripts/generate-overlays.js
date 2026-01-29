const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SCRIBBLES_DIR = path.join(__dirname, '../public/assets/overlays/scribbles');
const FRAMES_DIR = path.join(__dirname, '../public/assets/overlays/paper-frames');
const CORNERS_DIR = path.join(__dirname, '../public/assets/overlays/corners');

// Ensure directories exist
[SCRIBBLES_DIR, FRAMES_DIR, CORNERS_DIR].forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
});

// Colors for scribbles (vibrant, marker-like colors)
const COLORS = [
    { r: 255, g: 50, b: 100 },   // Hot pink
    { r: 50, g: 150, b: 255 },   // Electric blue
    { r: 255, g: 200, b: 50 },   // Yellow
    { r: 100, g: 255, b: 100 },  // Lime green
    { r: 255, g: 100, b: 50 },   // Orange
    { r: 150, g: 50, b: 255 },   // Purple
    { r: 50, g: 255, b: 200 },   // Cyan
    { r: 255, g: 50, b: 50 },    // Red
];

/**
 * Create a scribble SVG path
 */
function createScribbleSVG(type, color, size = 200) {
    const { r, g, b } = color;
    const strokeColor = `rgb(${r},${g},${b})`;
    const strokeWidth = 8 + Math.random() * 6;
    
    let pathD = '';
    
    switch (type) {
        case 'spiral':
            // Spiral scribble
            let spiralPath = `M ${size/2} ${size/2}`;
            for (let i = 0; i < 720; i += 15) {
                const angle = (i * Math.PI) / 180;
                const radius = 10 + i / 20;
                const x = size/2 + Math.cos(angle) * radius + (Math.random() - 0.5) * 3;
                const y = size/2 + Math.sin(angle) * radius + (Math.random() - 0.5) * 3;
                spiralPath += ` L ${x} ${y}`;
            }
            pathD = spiralPath;
            break;
            
        case 'heart':
            // Heart shape with hand-drawn feel
            pathD = `M ${size/2} ${size*0.85}
                     C ${size*0.2} ${size*0.6}, ${size*0.1} ${size*0.3}, ${size/2} ${size*0.25}
                     C ${size*0.9} ${size*0.3}, ${size*0.8} ${size*0.6}, ${size/2} ${size*0.85}`;
            break;
            
        case 'star':
            // Star with wobbly edges
            const points = 5;
            const outerR = size * 0.4;
            const innerR = size * 0.2;
            let starPath = '';
            for (let i = 0; i < points * 2; i++) {
                const angle = (i * Math.PI) / points - Math.PI / 2;
                const radius = i % 2 === 0 ? outerR : innerR;
                const wobble = (Math.random() - 0.5) * 5;
                const x = size/2 + Math.cos(angle) * (radius + wobble);
                const y = size/2 + Math.sin(angle) * (radius + wobble);
                starPath += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
            }
            pathD = starPath + ' Z';
            break;
            
        case 'zigzag':
            // Zigzag line
            let zigPath = `M ${size*0.1} ${size*0.5}`;
            for (let i = 1; i <= 8; i++) {
                const x = size*0.1 + (i / 8) * size * 0.8;
                const y = i % 2 === 0 ? size*0.3 : size*0.7;
                zigPath += ` L ${x + (Math.random()-0.5)*5} ${y + (Math.random()-0.5)*5}`;
            }
            pathD = zigPath;
            break;
            
        case 'circle':
            // Wobbly circle
            let circlePath = '';
            const circleR = size * 0.35;
            for (let i = 0; i <= 360; i += 10) {
                const angle = (i * Math.PI) / 180;
                const wobble = (Math.random() - 0.5) * 8;
                const x = size/2 + Math.cos(angle) * (circleR + wobble);
                const y = size/2 + Math.sin(angle) * (circleR + wobble);
                circlePath += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
            }
            pathD = circlePath;
            break;
            
        case 'arrow':
            // Arrow pointing right
            pathD = `M ${size*0.15} ${size*0.5} 
                     L ${size*0.7} ${size*0.5}
                     M ${size*0.55} ${size*0.3} L ${size*0.75} ${size*0.5} L ${size*0.55} ${size*0.7}`;
            break;
            
        case 'swirl':
            // Decorative swirl
            let swirlPath = `M ${size*0.3} ${size*0.7}`;
            for (let i = 0; i < 540; i += 20) {
                const angle = (i * Math.PI) / 180;
                const radius = 20 + i / 15;
                const x = size*0.3 + Math.cos(angle) * radius * 0.7 + (Math.random()-0.5)*2;
                const y = size*0.7 - Math.sin(angle) * radius * 0.5 + (Math.random()-0.5)*2;
                swirlPath += ` L ${x} ${y}`;
            }
            pathD = swirlPath;
            break;
            
        case 'scribble':
        default:
            // Random scribble
            let scribPath = `M ${size*0.2} ${size*0.5}`;
            let curX = size*0.2, curY = size*0.5;
            for (let i = 0; i < 15; i++) {
                curX += (Math.random() - 0.3) * 40;
                curY += (Math.random() - 0.5) * 40;
                curX = Math.max(size*0.1, Math.min(size*0.9, curX));
                curY = Math.max(size*0.1, Math.min(size*0.9, curY));
                scribPath += ` L ${curX} ${curY}`;
            }
            pathD = scribPath;
            break;
    }
    
    return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <path d="${pathD}" 
              fill="none" 
              stroke="${strokeColor}" 
              stroke-width="${strokeWidth}"
              stroke-linecap="round"
              stroke-linejoin="round"/>
    </svg>`;
}

/**
 * Create paper frame texture SVG - more visible vintage paper look
 */
function createPaperFrameSVG(variant, width = 1280, height = 720) {
    const edgeWidth = 50 + variant * 15;
    const borderWidth = 8 + variant * 2;
    
    // Different paper tints per variant
    const tints = [
        { bg: '245,240,230', edge: '220,200,170', border: '180,160,130' },
        { bg: '250,245,235', edge: '230,210,180', border: '190,170,140' },
        { bg: '248,243,233', edge: '225,205,175', border: '185,165,135' },
        { bg: '252,248,240', edge: '235,215,185', border: '195,175,145' },
    ];
    const tint = tints[variant % tints.length];
    
    // Create visible paper frame with torn edges effect
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="paper${variant}" x="-10%" y="-10%" width="120%" height="120%">
                <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="4" result="noise"/>
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G"/>
            </filter>
            <filter id="roughEdge${variant}">
                <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="2" result="noise"/>
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="4"/>
            </filter>
        </defs>
        
        <!-- Full frame background tint -->
        <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(${tint.bg},0.12)"/>
        
        <!-- Paper border frame -->
        <rect x="${borderWidth}" y="${borderWidth}" 
              width="${width - borderWidth*2}" height="${height - borderWidth*2}" 
              fill="none" stroke="rgba(${tint.border},0.5)" stroke-width="${borderWidth}"
              filter="url(#roughEdge${variant})"/>
        
        <!-- Top edge texture -->
        <rect x="0" y="0" width="${width}" height="${edgeWidth}" 
              fill="rgba(${tint.edge},0.35)" filter="url(#paper${variant})"/>
        <!-- Bottom edge texture -->
        <rect x="0" y="${height - edgeWidth}" width="${width}" height="${edgeWidth}" 
              fill="rgba(${tint.edge},0.35)" filter="url(#paper${variant})"/>
        <!-- Left edge texture -->
        <rect x="0" y="0" width="${edgeWidth}" height="${height}" 
              fill="rgba(${tint.edge},0.35)" filter="url(#paper${variant})"/>
        <!-- Right edge texture -->
        <rect x="${width - edgeWidth}" y="0" width="${edgeWidth}" height="${height}" 
              fill="rgba(${tint.edge},0.35)" filter="url(#paper${variant})"/>
        
        <!-- Corner wear marks -->
        <ellipse cx="0" cy="0" rx="${edgeWidth*1.5}" ry="${edgeWidth*1.5}" 
                 fill="rgba(${tint.edge},0.4)" filter="url(#paper${variant})"/>
        <ellipse cx="${width}" cy="0" rx="${edgeWidth*1.5}" ry="${edgeWidth*1.5}" 
                 fill="rgba(${tint.edge},0.4)" filter="url(#paper${variant})"/>
        <ellipse cx="0" cy="${height}" rx="${edgeWidth*1.5}" ry="${edgeWidth*1.5}" 
                 fill="rgba(${tint.edge},0.4)" filter="url(#paper${variant})"/>
        <ellipse cx="${width}" cy="${height}" rx="${edgeWidth*1.5}" ry="${edgeWidth*1.5}" 
                 fill="rgba(${tint.edge},0.4)" filter="url(#paper${variant})"/>
        
        <!-- Subtle stain marks -->
        <circle cx="${width * 0.15}" cy="${height * 0.1}" r="30" fill="rgba(200,180,150,0.15)"/>
        <circle cx="${width * 0.85}" cy="${height * 0.9}" r="25" fill="rgba(200,180,150,0.12)"/>
    </svg>`;
}

/**
 * Create white corner separator SVG - strong paint splash effect
 */
function createCornerSeparatorSVG(width = 1280, height = 720) {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="cornerGrad1" x1="0%" y1="0%" x2="70%" y2="70%">
                <stop offset="0%" style="stop-color:white;stop-opacity:1"/>
                <stop offset="30%" style="stop-color:white;stop-opacity:0.85"/>
                <stop offset="60%" style="stop-color:white;stop-opacity:0.4"/>
                <stop offset="100%" style="stop-color:white;stop-opacity:0"/>
            </linearGradient>
            <filter id="blur1" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="12"/>
            </filter>
            <filter id="blur2" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="5"/>
            </filter>
        </defs>
        
        <!-- Top-left corner - strong white wash -->
        <ellipse cx="-20" cy="-20" rx="320" ry="240" fill="url(#cornerGrad1)" filter="url(#blur1)"/>
        
        <!-- Top-left - paint brush strokes -->
        <path d="M 0 0 L 250 0 Q 230 40 180 80 Q 150 65 120 120 Q 80 100 50 160 Q 25 120 0 200 Z" 
              fill="rgba(255,255,255,0.9)" filter="url(#blur2)"/>
        
        <!-- Additional brush stroke -->
        <path d="M 0 0 L 180 0 L 160 40 L 100 60 L 60 100 L 0 120 Z" 
              fill="rgba(255,255,255,0.95)"/>
    </svg>`;
}

async function generateAllAssets() {
    console.log('Generating scribble assets...');
    
    const scribbleTypes = ['spiral', 'heart', 'star', 'zigzag', 'circle', 'arrow', 'swirl', 'scribble'];
    
    // Generate scribbles
    for (let i = 0; i < scribbleTypes.length; i++) {
        const type = scribbleTypes[i];
        const color = COLORS[i % COLORS.length];
        const svg = createScribbleSVG(type, color, 200);
        
        const outputPath = path.join(SCRIBBLES_DIR, `scribble_${String(i + 1).padStart(2, '0')}.png`);
        
        await sharp(Buffer.from(svg))
            .resize(200, 200)
            .png()
            .toFile(outputPath);
        
        console.log(`Created: ${outputPath}`);
    }
    
    // Generate additional colored variants
    for (let i = 0; i < 8; i++) {
        const type = scribbleTypes[i % scribbleTypes.length];
        const color = COLORS[(i + 3) % COLORS.length]; // Different color rotation
        const svg = createScribbleSVG(type, color, 200);
        
        const outputPath = path.join(SCRIBBLES_DIR, `scribble_${String(i + 9).padStart(2, '0')}.png`);
        
        await sharp(Buffer.from(svg))
            .resize(200, 200)
            .png()
            .toFile(outputPath);
        
        console.log(`Created: ${outputPath}`);
    }
    
    console.log('\nGenerating paper frame textures...');
    
    // Generate paper frames
    for (let i = 0; i < 4; i++) {
        const svg = createPaperFrameSVG(i);
        const outputPath = path.join(FRAMES_DIR, `frame_${String(i + 1).padStart(2, '0')}.png`);
        
        await sharp(Buffer.from(svg))
            .resize(1280, 720)
            .png()
            .toFile(outputPath);
        
        console.log(`Created: ${outputPath}`);
    }
    
    console.log('\nGenerating corner separator...');
    
    // Generate corner separator
    const cornerSvg = createCornerSeparatorSVG();
    const cornerPath = path.join(CORNERS_DIR, 'corner_white_tl.png');
    
    await sharp(Buffer.from(cornerSvg))
        .resize(1280, 720)
        .png()
        .toFile(cornerPath);
    
    console.log(`Created: ${cornerPath}`);
    
    console.log('\nAll assets generated successfully!');
}

generateAllAssets().catch(console.error);
