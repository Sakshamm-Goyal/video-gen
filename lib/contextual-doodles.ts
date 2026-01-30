/**
 * Contextual doodle selection based on scene analysis
 * Chooses appropriate doodle types for different content types
 */

export type SceneContext = 'person' | 'food' | 'action' | 'object' | 'nature' | 'celebration' | 'general';

export interface DoodleRecommendation {
    types: string[];
    density: 'low' | 'medium' | 'high';
    energyLevel: 'calm' | 'moderate' | 'energetic';
}

/**
 * Map scene types to appropriate doodle styles
 */
const CONTEXTUAL_DOODLE_MAP: Record<SceneContext, string[]> = {
    person: [
        'smiley', 'heart', 'star', 'spiral', 'wave',
        'arrow', 'curvedArrow', // Arrows to point at person
        'flower', 'dots', 'circle'
    ],
    food: [
        'heart', 'star', 'spiral', 'swirl',
        'smiley', 'flower', 'circle',
        'dots', 'sparkle', 'underline' // Emphasis elements
    ],
    action: [
        'speedArrow', 'motionLine', 'lightning',
        'zigzag', 'wave', 'star',
        'spiral', 'burst', 'splash'
    ],
    object: [
        'arrow', 'curvedArrow', // Point to interesting objects
        'circle', 'underline', 'star',
        'spiral', 'dots', 'bracket'
    ],
    nature: [
        'flower', 'leaf', 'swirl', 'wave',
        'spiral', 'circle', 'star',
        'heart', 'butterfly', 'cloud'
    ],
    celebration: [
        'star', 'heart', 'burst', 'confetti',
        'balloon', 'ribbon', 'sparkle',
        'spiral', 'flower', 'smiley'
    ],
    general: [
        'star', 'circle', 'spiral', 'squiggle',
        'zigzag', 'wave', 'dots',
        'heart', 'arrow', 'smiley'
    ]
};

/**
 * Get recommended doodles based on scene analysis from Gemini
 * @param mood - Detected mood from video analysis
 * @param keywords - Keywords from Gemini analysis
 * @returns Recommended doodle types and settings
 */
export function getContextualDoodles(
    mood: string,
    keywords: string[] = []
): DoodleRecommendation {
    // Detect scene context from keywords
    const context = detectSceneContext(keywords, mood);

    // Get appropriate doodle types
    const types = CONTEXTUAL_DOODLE_MAP[context];

    // Determine density and energy based on mood
    const { density, energyLevel } = mapMoodToSettings(mood);

    return {
        types,
        density,
        energyLevel
    };
}

/**
 * Detect scene context from keywords and mood
 */
export function detectSceneContext(keywords: string[], mood: string): SceneContext {
    const keywordStr = keywords.join(' ').toLowerCase();

    // Check for specific contexts
    if (keywordStr.match(/person|people|face|human|man|woman|child|kid/i)) {
        return 'person';
    }
    if (keywordStr.match(/food|eat|drink|coffee|meal|cake|restaurant/i)) {
        return 'food';
    }
    if (keywordStr.match(/run|jump|skate|dance|sport|play|action|move/i)) {
        return 'action';
    }
    if (keywordStr.match(/flower|tree|plant|nature|outdoor|garden|sky/i)) {
        return 'nature';
    }
    if (keywordStr.match(/party|birthday|celebrate|happy|fun|joy/i)) {
        return 'celebration';
    }
    if (keywordStr.match(/product|object|item|thing|gadget/i)) {
        return 'object';
    }

    // Check mood for hints
    if (mood.match(/energetic|exciting|dynamic|active/i)) {
        return 'action';
    }
    if (mood.match(/happy|joyful|celebrat/i)) {
        return 'celebration';
    }

    return 'general';
}

/**
 * Map mood to density and energy settings
 */
function mapMoodToSettings(mood: string): {
    density: 'low' | 'medium' | 'high';
    energyLevel: 'calm' | 'moderate' | 'energetic';
} {
    const moodLower = mood.toLowerCase();

    // Energy level
    let energyLevel: 'calm' | 'moderate' | 'energetic' = 'moderate';
    if (moodLower.match(/calm|peaceful|serene|quiet|gentle/)) {
        energyLevel = 'calm';
    } else if (moodLower.match(/energetic|exciting|dynamic|intense|active|fast/)) {
        energyLevel = 'energetic';
    }

    // Density
    let density: 'low' | 'medium' | 'high' = 'medium';
    if (energyLevel === 'calm') {
        density = 'low'; // Fewer doodles for calm scenes
    } else if (energyLevel === 'energetic') {
        density = 'high'; // More doodles for energetic scenes
    }

    return { density, energyLevel };
}

/**
 * Filter doodles to emphasize specific types based on time in video
 * Early: intro doodles (arrows, attention grabbers)
 * Middle: contextual doodles (theme-appropriate)
 * Late: celebration doodles (stars, hearts)
 */
export function getDoodlesForTimeSegment(
    allDoodles: string[],
    timePosition: 'early' | 'middle' | 'late'
): string[] {
    const emphasisMap = {
        early: ['arrow', 'curvedArrow', 'speedArrow', 'star', 'burst'],
        middle: allDoodles, // Use all contextual doodles
        late: ['star', 'heart', 'sparkle', 'burst', 'confetti']
    };

    const emphasized = emphasisMap[timePosition];

    // Return emphasized types first, then fill with others
    const emphasized_set = new Set(emphasized);
    const others = allDoodles.filter(d => !emphasized_set.has(d));

    return [...emphasized, ...others];
}

/**
 * Calculate how many arrows should be used vs other doodles
 * More arrows = more directional attention to subject
 */
export function calculateArrowRatio(
    sceneContext: SceneContext,
    energyLevel: 'calm' | 'moderate' | 'energetic'
): number {
    // Arrow ratio: 0.0 = no arrows, 1.0 = all arrows
    const contextRatios: Record<SceneContext, number> = {
        person: 0.3, // 30% arrows pointing at people
        food: 0.25,
        action: 0.35, // More arrows for dynamic scenes
        object: 0.4, // Arrows to point at objects
        nature: 0.15, // Fewer arrows in nature
        celebration: 0.2,
        general: 0.25
    };

    let ratio = contextRatios[sceneContext];

    // Adjust by energy
    if (energyLevel === 'energetic') {
        ratio *= 1.2; // More arrows in energetic scenes
    } else if (energyLevel === 'calm') {
        ratio *= 0.7; // Fewer arrows in calm scenes
    }

    return Math.min(1.0, Math.max(0.1, ratio));
}

/**
 * Sort doodles by priority for a given context
 * Higher priority doodles appear more frequently
 */
export function prioritizeDoodles(
    doodles: string[],
    context: SceneContext
): string[] {
    const contextual = CONTEXTUAL_DOODLE_MAP[context];
    const contextSet = new Set(contextual);

    // Partition into contextual and non-contextual
    const priority: string[] = [];
    const secondary: string[] = [];

    doodles.forEach(doodle => {
        if (contextSet.has(doodle)) {
            priority.push(doodle);
        } else {
            secondary.push(doodle);
        }
    });

    // Return priority first, then secondary
    return [...priority, ...secondary];
}
