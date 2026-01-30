/**
 * SIMPLE SVG generator without template literals
 * Generates basic hand-drawn style SVG shapes
 */

export function generateSimpleScribbleSVG(
    type: string,
    color: string,
    size: number = 200
): string {
    // THICK VISIBLE STROKES: 3-6px for clear visibility like marker/crayon
    const sw = Math.max(4, size / 40);
    const seed = type.charCodeAt(0) + color.charCodeAt(1);

    // Helper to add randomness
    const r = (i: number) => Math.sin(seed * 12.9898 + i * 78.233) * 0.5 + 0.5;
    const rnd = () => (Math.random() - 0.5);

    let shape = '';

    // Generate different shapes based on type
    switch (type) {
        case 'star':
            // Simple star
            const cx = size / 2;
            const cy = size / 2;
            let starPath = 'M';
            for (let i = 0; i < 10; i++) {
                const angle = (i * Math.PI / 5) - Math.PI / 2;
                const rad = i % 2 === 0 ? size * 0.4 : size * 0.18;
                const x = cx + Math.cos(angle) * rad + rnd() * 4;
                const y = cy + Math.sin(angle) * rad + rnd() * 4;
                starPath += (i === 0 ? '' : ' L') + x.toFixed(1) + ' ' + y.toFixed(1);
            }
            starPath += ' Z';
            shape = '<path d="' + starPath + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round"/>';
            break;

        case 'circle':
            // Wobbly circle
            let circlePath = 'M';
            for (let i = 0; i <= 16; i++) {
                const angle = (i / 16) * Math.PI * 2;
                const rad = size * 0.35 + rnd() * size * 0.03;
                const x = size / 2 + Math.cos(angle) * rad;
                const y = size / 2 + Math.sin(angle) * rad;
                circlePath += (i === 0 ? '' : ' L') + x.toFixed(1) + ' ' + y.toFixed(1);
            }
            circlePath += ' Z';
            shape = '<path d="' + circlePath + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '"/>';
            break;

        case 'spiral':
            // Simple spiral
            let spiralPath = 'M' + (size / 2) + ' ' + (size / 2);
            for (let i = 0; i < 5; i++) {
                const r1 = size * 0.08 + i * size * 0.1;
                const x = size / 2 + r1 + rnd() * 5;
                const y = size / 2 + rnd() * 4;
                spiralPath += ' L' + x.toFixed(1) + ' ' + y.toFixed(1);
            }
            shape = '<path d="' + spiralPath + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round"/>';
            break;

        case 'arrow':
            // Simple straight arrow
            const arrowBody = '<line x1="' + (size * 0.15) + '" y1="' + (size / 2) + '" x2="' + (size * 0.85) + '" y2="' + (size / 2) + '" stroke="' + color + '" stroke-width="' + (sw * 1.2) + '" stroke-linecap="round"/>';
            const arrowHead = '<polyline points="' + (size * 0.65) + ',' + (size * 0.35) + ' ' + (size * 0.85) + ',' + (size / 2) + ' ' + (size * 0.65) + ',' + (size * 0.65) + '" fill="none" stroke="' + color + '" stroke-width="' + (sw * 1.2) + '" stroke-linecap="round" stroke-linejoin="round"/>';
            shape = arrowBody + arrowHead;
            break;

        case 'curvedArrow':
            // Curved arrow pointing inward
            const curvedPath = 'M' + (size * 0.15) + ' ' + (size * 0.7) + ' Q' + (size * 0.4) + ' ' + (size * 0.3) + ' ' + (size * 0.75) + ' ' + (size * 0.45);
            const curvedHead = '<polyline points="' + (size * 0.65) + ',' + (size * 0.35) + ' ' + (size * 0.75) + ',' + (size * 0.45) + ' ' + (size * 0.68) + ',' + (size * 0.55) + '" fill="none" stroke="' + color + '" stroke-width="' + (sw * 1.2) + '" stroke-linecap="round" stroke-linejoin="round"/>';
            shape = '<path d="' + curvedPath + '" fill="none" stroke="' + color + '" stroke-width="' + (sw * 1.2) + '" stroke-linecap="round"/>' + curvedHead;
            break;

        case 'motionLine':
            // Motion/speed lines
            let motionLines = '';
            for (let i = 0; i < 3; i++) {
                const yPos = size * (0.35 + i * 0.15) + rnd() * 5;
                const xStart = size * (0.2 + i * 0.05);
                const xEnd = size * (0.7 + i * 0.05);
                motionLines += '<line x1="' + xStart + '" y1="' + yPos + '" x2="' + xEnd + '" y2="' + yPos + '" stroke="' + color + '" stroke-width="' + (sw * 0.9) + '" stroke-linecap="round"/>';
            }
            shape = motionLines;
            break;

        case 'zigzag':
            // Zigzag line
            let zigzagPath = 'M' + (size * 0.1) + ' ' + (size * 0.5);
            for (let i = 1; i <= 4; i++) {
                const x = size * (0.1 + i * 0.2) + rnd() * 5;
                const y = size * (i % 2 === 0 ? 0.3 : 0.7) + rnd() * 5;
                zigzagPath += ' L' + x.toFixed(1) + ' ' + y.toFixed(1);
            }
            shape = '<path d="' + zigzagPath + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round"/>';
            break;

        case 'heart':
            // Simple heart shape
            const heartPath = 'M' + (size / 2) + ' ' + (size * 0.7) +
                ' Q' + (size * 0.15) + ' ' + (size * 0.4) + ' ' + (size / 2) + ' ' + (size * 0.25) +
                ' Q' + (size * 0.85) + ' ' + (size * 0.4) + ' ' + (size / 2) + ' ' + (size * 0.7);
            shape = '<path d="' + heartPath + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round"/>';
            break;

        case 'smiley':
            // Simple smiley
            const face = '<circle cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + (size * 0.38) + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '"/>';
            const eye1 = '<circle cx="' + (size * 0.36) + '" cy="' + (size * 0.42) + '" r="' + (size * 0.04) + '" fill="' + color + '"/>';
            const eye2 = '<circle cx="' + (size * 0.64) + '" cy="' + (size * 0.42) + '" r="' + (size * 0.04) + '" fill="' + color + '"/>';
            const smile = '<path d="M' + (size * 0.3) + ' ' + (size * 0.6) + ' Q' + (size / 2) + ' ' + (size * 0.7) + ' ' + (size * 0.7) + ' ' + (size * 0.6) + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round"/>';
            shape = face + eye1 + eye2 + smile;
            break;

        case 'crosshatch':
        case 'scribbleLine':
        case 'wave':
            // Parallel lines for hatching/scribbling
            let lines = '';
            for (let i = 0; i < 5; i++) {
                const y = size * (0.2 + i * 0.15) + rnd() * 8;
                lines += '<line x1="' + (size * 0.1 + rnd() * 5) + '" y1="' + y + '" x2="' + (size * 0.9 + rnd() * 5) + '" y2="' + (y + rnd() * 10) + '" stroke="' + color + '" stroke-width="' + (sw * 0.8) + '" stroke-linecap="round"/>';
            }
            shape = lines;
            break;

        default:
            // Default squiggle
            let squigglePath = 'M' + (size * 0.1) + ' ' + (size * 0.5);
            for (let i = 1; i <= 4; i++) {
                const x = size * (0.1 + i * 0.2) + rnd() * 10;
                const y = size * 0.5 + rnd() * 30;
                squigglePath += ' L' + x.toFixed(1) + ' ' + y.toFixed(1);
            }
            shape = '<path d="' + squigglePath + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round"/>';
    }

    // Add slight rotation for variety
    const rotation = (r(1) - 0.5) * 30;

    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg">' +
        '<g transform="rotate(' + rotation.toFixed(1) + ' ' + (size / 2) + ' ' + (size / 2) + ')">' +
        shape +
        '</g></svg>';
}

export function generateSimplePaperSVG(
    style: string,
    variant: number,
    width: number = 1280,
    height: number = 720
): string {
    // Simple beige rectangle with slight transparency
    const color = '#F5E6D3';
    return '<svg width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg">' +
        '<rect width="' + width + '" height="' + height + '" fill="' + color + '" opacity="0.15"/>' +
        '</svg>';
}
