'use client';

interface StyleControlsProps {
    onSettingsChange: (settings: {
        density: 'low' | 'medium' | 'high';
        paperIntensity: number;
        cornerEnabled: boolean;
    }) => void;
}

export function StyleControls({ onSettingsChange }: StyleControlsProps) {
    const handleDensityChange = (density: 'low' | 'medium' | 'high') => {
        onSettingsChange({
            density,
            paperIntensity: 0.3,
            cornerEnabled: true,
        });
    };

    return (
        <div className="w-full max-w-2xl mx-auto space-y-6 p-6 bg-white rounded-2xl shadow-lg">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <span className="text-2xl">🎨</span>
                Overlay Style
            </h3>

            {/* Scribble Density */}
            <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                    Scribble Density
                </label>
                <div className="grid grid-cols-3 gap-3">
                    {(['low', 'medium', 'high'] as const).map((density) => (
                        <button
                            key={density}
                            onClick={() => handleDensityChange(density)}
                            className="px-4 py-3 rounded-lg border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all capitalize font-medium"
                        >
                            {density}
                        </button>
                    ))}
                </div>
                <p className="text-xs text-gray-500">
                    • <strong>Low:</strong> 3 scribbles • <strong>Medium:</strong> 6 scribbles • <strong>High:</strong> 10 scribbles
                </p>
            </div>

            {/* Coming Soon Features */}
            <div className="space-y-3 opacity-50">
                <label className="block text-sm font-medium text-gray-700">
                    Paper Texture Intensity
                    <span className="ml-2 text-xs bg-gray-200 px-2 py-1 rounded">Coming Soon</span>
                </label>
                <input
                    type="range"
                    min="0"
                    max="100"
                    disabled
                    className="w-full"
                />
            </div>

            <div className="flex items-center justify-between opacity-50">
                <label className="text-sm font-medium text-gray-700">
                    Corner Separator
                    <span className="ml-2 text-xs bg-gray-200 px-2 py-1 rounded">Coming Soon</span>
                </label>
                <input
                    type="checkbox"
                    disabled
                    className="w-5 h-5"
                />
            </div>
        </div>
    );
}
