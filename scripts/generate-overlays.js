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

// Vibrant marker colors
const COLORS = [
    { r: 255, g: 50, b: 100, name: 'pink' },
    { r: 50, g: 100, b: 255, name: 'blue' },
    { r: 255, g: 200, b: 50, name: 'yellow' },
    { r: 50, g: 200, b: 100, name: 'green' },
    { r: 255, g: 100, b: 50, name: 'orange' },
    { r: 150, g: 50, b: 255, name: 'purple' },
    { r: 50, g: 200, b: 200, name: 'cyan' },
    { r: 255, g: 50, b: 50, name: 'red' },
];

/**
 * Create varied scribble SVG designs
 */
function createScribbleSVG(type, color, size = 200) {
    const { r, g, b } = color;
    const stroke = `rgb(${r},${g},${b})`;
    const sw = 6 + Math.random() * 4; // stroke width
    
    const designs = {
        // Heart shape
        heart: `<path d="M ${size/2} ${size*0.8} C ${size*0.15} ${size*0.55}, ${size*0.1} ${size*0.25}, ${size/2} ${size*0.2} C ${size*0.9} ${size*0.25}, ${size*0.85} ${size*0.55}, ${size/2} ${size*0.8}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`,
        
        // Star
        star: (() => {
            let d = '';
            for (let i = 0; i < 10; i++) {
                const angle = (i * Math.PI / 5) - Math.PI/2;
                const rad = i % 2 === 0 ? size*0.4 : size*0.18;
                const x = size/2 + Math.cos(angle) * rad;
                const y = size/2 + Math.sin(angle) * rad;
                d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
            }
            return `<path d="${d} Z" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
        })(),
        
        // Spiral
        spiral: (() => {
            let d = `M ${size/2} ${size/2}`;
            for (let i = 0; i < 540; i += 20) {
                const angle = (i * Math.PI) / 180;
                const rad = 8 + i / 18;
                d += ` L ${size/2 + Math.cos(angle)*rad} ${size/2 + Math.sin(angle)*rad}`;
            }
            return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
        })(),
        
        // Smiley face
        smiley: `<circle cx="${size/2}" cy="${size/2}" r="${size*0.35}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>
                 <circle cx="${size*0.35}" cy="${size*0.4}" r="${size*0.06}" fill="${stroke}"/>
                 <circle cx="${size*0.65}" cy="${size*0.4}" r="${size*0.06}" fill="${stroke}"/>
                 <path d="M ${size*0.3} ${size*0.6} Q ${size/2} ${size*0.8}, ${size*0.7} ${size*0.6}" fill="none" stroke="${stroke}" stroke-width="${sw*0.7}" stroke-linecap="round"/>`,
        
        // Stick figure
        stickFigure: `<circle cx="${size/2}" cy="${size*0.2}" r="${size*0.12}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>
                      <line x1="${size/2}" y1="${size*0.32}" x2="${size/2}" y2="${size*0.6}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>
                      <line x1="${size*0.25}" y1="${size*0.45}" x2="${size*0.75}" y2="${size*0.45}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>
                      <line x1="${size/2}" y1="${size*0.6}" x2="${size*0.3}" y2="${size*0.9}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>
                      <line x1="${size/2}" y1="${size*0.6}" x2="${size*0.7}" y2="${size*0.9}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`,
        
        // Zigzag
        zigzag: (() => {
            let d = `M ${size*0.1} ${size*0.5}`;
            for (let i = 1; i <= 6; i++) {
                d += ` L ${size*0.1 + (i/6)*size*0.8} ${i%2===0 ? size*0.3 : size*0.7}`;
            }
            return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
        })(),
        
        // Scribble lines
        scribble: (() => {
            let d = `M ${size*0.15} ${size*0.3}`;
            for (let i = 0; i < 5; i++) {
                d += ` Q ${size*(0.3+i*0.15)} ${size*(0.2+Math.random()*0.6)}, ${size*(0.2+i*0.15)} ${size*(0.4+Math.random()*0.3)}`;
            }
            return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
        })(),
        
        // Arrow
        arrow: `<line x1="${size*0.2}" y1="${size/2}" x2="${size*0.8}" y2="${size/2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>
                <line x1="${size*0.6}" y1="${size*0.3}" x2="${size*0.8}" y2="${size/2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>
                <line x1="${size*0.6}" y1="${size*0.7}" x2="${size*0.8}" y2="${size/2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`,
        
        // Circle
        circle: `<circle cx="${size/2}" cy="${size/2}" r="${size*0.35}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`,
        
        // X mark
        xmark: `<line x1="${size*0.25}" y1="${size*0.25}" x2="${size*0.75}" y2="${size*0.75}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>
                <line x1="${size*0.75}" y1="${size*0.25}" x2="${size*0.25}" y2="${size*0.75}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`,
        
        // Sun/burst
        sun: (() => {
            let svg = `<circle cx="${size/2}" cy="${size/2}" r="${size*0.15}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
            for (let i = 0; i < 8; i++) {
                const angle = (i * Math.PI / 4);
                const x1 = size/2 + Math.cos(angle) * size*0.2;
                const y1 = size/2 + Math.sin(angle) * size*0.2;
                const x2 = size/2 + Math.cos(angle) * size*0.4;
                const y2 = size/2 + Math.sin(angle) * size*0.4;
                svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw*0.6}" stroke-linecap="round"/>`;
            }
            return svg;
        })(),
        
        // Cloud/squiggle
        cloud: `<path d="M ${size*0.2} ${size*0.6} Q ${size*0.1} ${size*0.4}, ${size*0.3} ${size*0.35} Q ${size*0.35} ${size*0.2}, ${size*0.5} ${size*0.3} Q ${size*0.65} ${size*0.2}, ${size*0.7} ${size*0.35} Q ${size*0.9} ${size*0.4}, ${size*0.8} ${size*0.6} Z" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`,
        
        // Flower
        flower: (() => {
            let svg = `<circle cx="${size/2}" cy="${size/2}" r="${size*0.08}" fill="${stroke}"/>`;
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI / 3);
                const cx = size/2 + Math.cos(angle) * size*0.2;
                const cy = size/2 + Math.sin(angle) * size*0.2;
                svg += `<ellipse cx="${cx}" cy="${cy}" rx="${size*0.12}" ry="${size*0.08}" transform="rotate(${i*60} ${cx} ${cy})" fill="none" stroke="${stroke}" stroke-width="${sw*0.7}"/>`;
            }
            return svg;
        })(),
        
        // Lightning bolt
        lightning: `<path d="M ${size*0.55} ${size*0.1} L ${size*0.35} ${size*0.45} L ${size*0.5} ${size*0.45} L ${size*0.4} ${size*0.9} L ${size*0.65} ${size*0.5} L ${size*0.5} ${size*0.5} Z" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`,
        
        // Music note
        musicNote: `<ellipse cx="${size*0.35}" cy="${size*0.7}" rx="${size*0.12}" ry="${size*0.08}" fill="${stroke}" transform="rotate(-20 ${size*0.35} ${size*0.7})"/>
                    <line x1="${size*0.45}" y1="${size*0.68}" x2="${size*0.45}" y2="${size*0.2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>
                    <path d="M ${size*0.45} ${size*0.2} Q ${size*0.7} ${size*0.25}, ${size*0.65} ${size*0.4}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`,
        
        // Exclamation
        exclaim: `<line x1="${size/2}" y1="${size*0.15}" x2="${size/2}" y2="${size*0.6}" stroke="${stroke}" stroke-width="${sw*1.5}" stroke-linecap="round"/>
                  <circle cx="${size/2}" cy="${size*0.8}" r="${size*0.06}" fill="${stroke}"/>`,
    };
    
    return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${designs[type] || designs.scribble}</svg>`;
}

/**
 * Create visible paper/vintage frame effect with different colors per variant
 */
function createPaperCollageSVG(variant, width = 1280, height = 720) {
    const borderSize = 90 + variant * 20;
    
    // Different color schemes for each variant (more visible, different tints)
    const colorSchemes = [
        // Warm beige/tan
        { edge: 'rgba(230, 200, 160, 0.65)', corner: 'rgba(200, 170, 130, 0.7)', border: 'rgba(170, 140, 100, 0.6)', accent: 'rgba(255, 220, 180, 0.4)' },
        // Cool blue-grey
        { edge: 'rgba(180, 195, 210, 0.65)', corner: 'rgba(150, 170, 190, 0.7)', border: 'rgba(120, 140, 165, 0.6)', accent: 'rgba(200, 220, 240, 0.4)' },
        // Warm pink/salmon
        { edge: 'rgba(235, 195, 185, 0.65)', corner: 'rgba(210, 170, 160, 0.7)', border: 'rgba(185, 145, 135, 0.6)', accent: 'rgba(255, 210, 200, 0.4)' },
        // Mint/sage green
        { edge: 'rgba(185, 215, 195, 0.65)', corner: 'rgba(160, 190, 170, 0.7)', border: 'rgba(135, 165, 145, 0.6)', accent: 'rgba(210, 240, 220, 0.4)' },
    ];
    const tint = colorSchemes[variant % colorSchemes.length];
    
    // Different decorative elements per variant
    const decorations = [
        // Variant 0: Diagonal stripes
        `<line x1="0" y1="${height}" x2="${borderSize*3}" y2="${height-borderSize*3}" stroke="${tint.accent}" stroke-width="20" opacity="0.6"/>
         <line x1="${width}" y1="0" x2="${width-borderSize*3}" y2="${borderSize*3}" stroke="${tint.accent}" stroke-width="20" opacity="0.6"/>`,
        // Variant 1: Corner circles
        `<circle cx="${borderSize}" cy="${borderSize}" r="${borderSize*0.8}" fill="none" stroke="${tint.accent}" stroke-width="8" opacity="0.5"/>
         <circle cx="${width-borderSize}" cy="${height-borderSize}" r="${borderSize*0.8}" fill="none" stroke="${tint.accent}" stroke-width="8" opacity="0.5"/>`,
        // Variant 2: Cross hatching in corners
        `<path d="M 0 0 L ${borderSize*2} ${borderSize*2} M ${borderSize} 0 L 0 ${borderSize}" stroke="${tint.accent}" stroke-width="6" opacity="0.5"/>
         <path d="M ${width} ${height} L ${width-borderSize*2} ${height-borderSize*2} M ${width-borderSize} ${height} L ${width} ${height-borderSize}" stroke="${tint.accent}" stroke-width="6" opacity="0.5"/>`,
        // Variant 3: Wavy border
        `<path d="M ${borderSize} 0 Q ${borderSize*1.5} ${borderSize*0.5} ${borderSize} ${borderSize} Q ${borderSize*0.5} ${borderSize*1.5} ${borderSize} ${borderSize*2}" stroke="${tint.accent}" stroke-width="10" fill="none" opacity="0.5"/>`,
    ];
    
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="paperNoise${variant}">
                <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="4" result="noise"/>
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="6"/>
            </filter>
            <filter id="tornEdge${variant}">
                <feTurbulence type="turbulence" baseFrequency="0.035" numOctaves="3" result="noise"/>
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="10"/>
            </filter>
            <linearGradient id="edgeFadeT${variant}" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:${tint.edge}"/>
                <stop offset="100%" style="stop-color:rgba(0,0,0,0)"/>
            </linearGradient>
            <linearGradient id="edgeFadeB${variant}" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" style="stop-color:${tint.edge}"/>
                <stop offset="100%" style="stop-color:rgba(0,0,0,0)"/>
            </linearGradient>
            <linearGradient id="edgeFadeL${variant}" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:${tint.edge}"/>
                <stop offset="100%" style="stop-color:rgba(0,0,0,0)"/>
            </linearGradient>
            <linearGradient id="edgeFadeR${variant}" x1="100%" y1="0%" x2="0%" y2="0%">
                <stop offset="0%" style="stop-color:${tint.edge}"/>
                <stop offset="100%" style="stop-color:rgba(0,0,0,0)"/>
            </linearGradient>
        </defs>
        
        <!-- Visible edge borders with torn paper look -->
        <rect x="0" y="0" width="${width}" height="${borderSize}" fill="url(#edgeFadeT${variant})" filter="url(#tornEdge${variant})"/>
        <rect x="0" y="${height-borderSize}" width="${width}" height="${borderSize}" fill="url(#edgeFadeB${variant})" filter="url(#tornEdge${variant})"/>
        <rect x="0" y="0" width="${borderSize}" height="${height}" fill="url(#edgeFadeL${variant})" filter="url(#tornEdge${variant})"/>
        <rect x="${width-borderSize}" y="0" width="${borderSize}" height="${height}" fill="url(#edgeFadeR${variant})" filter="url(#tornEdge${variant})"/>
        
        <!-- Prominent corner wear with different colors -->
        <ellipse cx="0" cy="0" rx="${borderSize*2.5}" ry="${borderSize*2.5}" fill="${tint.corner}" filter="url(#paperNoise${variant})"/>
        <ellipse cx="${width}" cy="0" rx="${borderSize*2.5}" ry="${borderSize*2.5}" fill="${tint.corner}" filter="url(#paperNoise${variant})"/>
        <ellipse cx="0" cy="${height}" rx="${borderSize*2.5}" ry="${borderSize*2.5}" fill="${tint.corner}" filter="url(#paperNoise${variant})"/>
        <ellipse cx="${width}" cy="${height}" rx="${borderSize*2.5}" ry="${borderSize*2.5}" fill="${tint.corner}" filter="url(#paperNoise${variant})"/>
        
        <!-- Decorative elements unique to each variant -->
        ${decorations[variant % decorations.length]}
        
        <!-- Visible border frame -->
        <rect x="${borderSize*0.35}" y="${borderSize*0.35}" width="${width-borderSize*0.7}" height="${height-borderSize*0.7}" 
              fill="none" stroke="${tint.border}" stroke-width="5" filter="url(#tornEdge${variant})"/>
    </svg>`;
}

/**
 * Create more visible white corner/edge effect with paint strokes
 */
function createCornerSVG(width = 1280, height = 720) {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="cornerG" x1="0%" y1="0%" x2="50%" y2="50%">
                <stop offset="0%" style="stop-color:white;stop-opacity:1"/>
                <stop offset="30%" style="stop-color:white;stop-opacity:0.8"/>
                <stop offset="60%" style="stop-color:white;stop-opacity:0.4"/>
                <stop offset="100%" style="stop-color:white;stop-opacity:0"/>
            </linearGradient>
            <linearGradient id="edgeG" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:white;stop-opacity:0.7"/>
                <stop offset="50%" style="stop-color:white;stop-opacity:0.2"/>
                <stop offset="100%" style="stop-color:white;stop-opacity:0"/>
            </linearGradient>
            <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="6"/>
            </filter>
            <filter id="paintTexture">
                <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise"/>
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="6"/>
            </filter>
        </defs>
        
        <!-- Top-left corner - main white wash -->
        <ellipse cx="-30" cy="-30" rx="300" ry="250" fill="url(#cornerG)" filter="url(#blur)"/>
        
        <!-- Paint brush strokes -->
        <path d="M 0 0 L 220 0 Q 200 35 160 70 Q 130 55 100 100 Q 70 80 40 140 Q 20 110 0 180 Z" 
              fill="rgba(255,255,255,0.95)" filter="url(#paintTexture)"/>
        <path d="M 0 0 L 150 0 L 130 30 L 80 50 L 45 85 L 0 110 Z" 
              fill="rgba(255,255,255,1)"/>
        
        <!-- Left edge with paint drip effect -->
        <rect x="0" y="0" width="50" height="${height}" fill="url(#edgeG)" filter="url(#blur)"/>
        <ellipse cx="5" cy="250" rx="15" ry="40" fill="rgba(255,255,255,0.6)"/>
        <ellipse cx="8" cy="450" rx="12" ry="35" fill="rgba(255,255,255,0.5)"/>
        
        <!-- Top edge brush stroke -->
        <rect x="0" y="0" width="${width}" height="35" fill="url(#edgeG)" filter="url(#blur)" transform="rotate(0)"/>
        <path d="M 180 0 Q 250 15 350 5 Q 450 18 550 8" stroke="rgba(255,255,255,0.5)" stroke-width="8" fill="none" filter="url(#paintTexture)"/>
    </svg>`;
}

async function generateAll() {
    console.log('Generating scribble assets (24 designs)...');
    
    const scribbleTypes = ['heart', 'star', 'spiral', 'smiley', 'stickFigure', 'zigzag', 'scribble', 'arrow', 
                           'circle', 'xmark', 'sun', 'cloud', 'flower', 'lightning', 'musicNote', 'exclaim'];
    
    let idx = 1;
    for (const type of scribbleTypes) {
        // Each type in 1-2 random colors
        const numColors = type === 'stickFigure' || type === 'smiley' ? 2 : 1;
        for (let c = 0; c < numColors; c++) {
            const color = COLORS[Math.floor(Math.random() * COLORS.length)];
            const svg = createScribbleSVG(type, color, 200);
            const outPath = path.join(SCRIBBLES_DIR, `scribble_${String(idx).padStart(2, '0')}.png`);
            
            await sharp(Buffer.from(svg)).png().toFile(outPath);
            console.log(`Created: ${outPath} (${type})`);
            idx++;
        }
    }
    
    console.log('\nGenerating paper collage backgrounds...');
    for (let i = 0; i < 4; i++) {
        const svg = createPaperCollageSVG(i);
        const outPath = path.join(FRAMES_DIR, `frame_${String(i+1).padStart(2, '0')}.png`);
        await sharp(Buffer.from(svg)).png().toFile(outPath);
        console.log(`Created: ${outPath}`);
    }
    
    console.log('\nGenerating corner effect...');
    const cornerSvg = createCornerSVG();
    const cornerPath = path.join(CORNERS_DIR, 'corner_white_tl.png');
    await sharp(Buffer.from(cornerSvg)).png().toFile(cornerPath);
    console.log(`Created: ${cornerPath}`);
    
    console.log('\nAll assets generated!');
}

generateAll().catch(console.error);
