/**
 * Intelligent arrow placement system
 * Calculates positions and rotations for arrows that point toward subjects
 */

export interface ArrowPlacement {
    x: number;
    y: number;
    rotation: number; // degrees, 0 = pointing right
    scale: number;
    type: 'arrow' | 'curvedArrow' | 'motionLine';
}

export interface SubjectBounds {
    centerX: number;
    centerY: number;
    width: number;
    height: number;
}

/**
 * Generate intelligent arrow placements that point toward the subject
 * @param subjectBounds - The subject's position and size
 * @param frameWidth - Video frame width
 * @param frameHeight - Video frame height
 * @param count - Number of arrows to generate
 * @returns Array of arrow placements
 */
export function generateDirectionalArrows(
    subjectBounds: SubjectBounds,
    frameWidth: number,
    frameHeight: number,
    count: number = 8
): ArrowPlacement[] {
    const placements: ArrowPlacement[] = [];
    const { centerX, centerY, width: subjectWidth, height: subjectHeight } = subjectBounds;

    // Define safe zones around edges where arrows can be placed
    const edgeMargin = 100;
    const subjectMargin = Math.max(subjectWidth, subjectHeight) * 0.6;

    // Generate arrows from various positions pointing toward subject center
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2; // Distribute around circle
        const distanceFromSubject = subjectMargin + 150 + Math.random() * 200;

        // Calculate arrow base position (outside subject area)
        const baseX = centerX + Math.cos(angle) * distanceFromSubject;
        const baseY = centerY + Math.sin(angle) * distanceFromSubject;

        // Ensure arrow is within frame bounds
        const x = Math.max(edgeMargin, Math.min(frameWidth - edgeMargin, baseX));
        const y = Math.max(edgeMargin, Math.min(frameHeight - edgeMargin, baseY));

        // Calculate rotation to point toward subject center
        const dx = centerX - x;
        const dy = centerY - y;
        const rotation = Math.atan2(dy, dx) * (180 / Math.PI);

        // Vary arrow types for visual interest
        const typeChoice = i % 5;
        const type: 'arrow' | 'curvedArrow' | 'motionLine' =
            typeChoice === 0 ? 'curvedArrow' :
            typeChoice === 1 ? 'motionLine' :
            'arrow';

        placements.push({
            x,
            y,
            rotation,
            scale: 0.8 + Math.random() * 0.5, // Vary size
            type
        });
    }

    return placements;
}

/**
 * Calculate FFmpeg overlay expression for an arrow that points toward subject
 * @param arrow - Arrow placement configuration
 * @param enableExpr - When the arrow should be visible (FFmpeg expression)
 * @returns FFmpeg overlay filter expression with rotation
 */
export function createArrowOverlayExpression(
    arrow: ArrowPlacement,
    enableExpr: string = '1'
): string {
    // FFmpeg overlay with rotation using scale and rotate filters
    // Note: Rotation in FFmpeg requires preprocessing the arrow image
    return {
        x: Math.round(arrow.x),
        y: Math.round(arrow.y),
        rotation: arrow.rotation,
        scale: arrow.scale,
        enable: enableExpr
    };
}

/**
 * Group arrows into zones based on their position relative to subject
 * Useful for timing different arrow groups to appear at different times
 */
export function groupArrowsByZone(
    arrows: ArrowPlacement[],
    subjectBounds: SubjectBounds
): { top: ArrowPlacement[]; bottom: ArrowPlacement[]; left: ArrowPlacement[]; right: ArrowPlacement[] } {
    const { centerX, centerY } = subjectBounds;
    const groups = { top: [], bottom: [], left: [], right: [] } as {
        top: ArrowPlacement[];
        bottom: ArrowPlacement[];
        left: ArrowPlacement[];
        right: ArrowPlacement[];
    };

    arrows.forEach(arrow => {
        const dx = arrow.x - centerX;
        const dy = arrow.y - centerY;

        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal zones
            if (dx > 0) groups.right.push(arrow);
            else groups.left.push(arrow);
        } else {
            // Vertical zones
            if (dy > 0) groups.bottom.push(arrow);
            else groups.top.push(arrow);
        }
    });

    return groups;
}
