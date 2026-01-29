#!/usr/bin/env python3
"""
Creates a white outline/stroke effect around human subjects in video frames.
Uses rembg for AI-based subject segmentation.
"""

import sys
import os
import cv2
import numpy as np
from PIL import Image
from rembg import remove, new_session
import argparse
from pathlib import Path

def create_outline_from_mask(mask, stroke_size=12):
    """
    Create a bright white outline/glow from a binary mask using dilation.
    
    Args:
        mask: Binary mask (255 = subject, 0 = background)
        stroke_size: Thickness of the outline in pixels
    
    Returns:
        outline: White outline image (grayscale alpha)
    """
    # Ensure mask is binary
    _, binary_mask = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)
    
    # Create multiple dilated versions for layered glow effect
    # Inner stroke (bright, sharp)
    kernel_inner = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (stroke_size + 1, stroke_size + 1))
    dilated_inner = cv2.dilate(binary_mask, kernel_inner, iterations=1)
    inner_outline = cv2.subtract(dilated_inner, binary_mask)
    
    # Outer glow (softer, larger)
    kernel_outer = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (stroke_size * 3 + 1, stroke_size * 3 + 1))
    dilated_outer = cv2.dilate(binary_mask, kernel_outer, iterations=1)
    outer_glow = cv2.subtract(dilated_outer, binary_mask)
    
    # Blur the outer glow for soft effect
    outer_glow = cv2.GaussianBlur(outer_glow, (stroke_size * 4 + 1, stroke_size * 4 + 1), 0)
    outer_glow = (outer_glow * 0.6).astype(np.uint8)
    
    # Combine: outer glow + inner sharp stroke
    combined = cv2.add(outer_glow, inner_outline)
    combined = np.clip(combined, 0, 255).astype(np.uint8)
    
    return combined

def process_video(input_path, output_path, stroke_size=10, sample_rate=1):
    """
    Process video to create white outline overlay.
    
    Args:
        input_path: Path to input video
        output_path: Path to output video (transparent outline)
        stroke_size: Thickness of the white outline
        sample_rate: Process every Nth frame (1 = all frames)
    """
    print(f"Processing video: {input_path}")
    print(f"Output: {output_path}")
    print(f"Stroke size: {stroke_size}px")
    
    # Initialize rembg session - use isnet-general-use for ALL objects (not just humans)
    # This model detects general foreground objects including people, flowers, objects, etc.
    session = new_session("isnet-general-use")
    
    # Open input video
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(f"Error: Could not open video {input_path}")
        sys.exit(1)
    
    # Get video properties
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    print(f"Video: {width}x{height} @ {fps}fps, {total_frames} frames")
    
    # Create output directory
    output_dir = Path(output_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # For video output with alpha, we'll use PNG sequence
    # FFmpeg can then use this as an overlay
    frames_dir = Path(output_path).parent / "outline_frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    
    frame_count = 0
    processed_count = 0
    last_outline = None
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        frame_count += 1
        
        # Process every Nth frame for speed, interpolate others
        if frame_count % sample_rate == 0 or last_outline is None:
            # Convert BGR to RGB for rembg
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(rgb_frame)
            
            # Remove background - returns RGBA with transparent background
            result = remove(pil_image, session=session, only_mask=True)
            
            # Convert mask to numpy
            mask = np.array(result)
            
            # Create white outline from mask
            outline = create_outline_from_mask(mask, stroke_size)
            last_outline = outline
            processed_count += 1
            
            if processed_count % 10 == 0:
                print(f"Processed {processed_count} frames ({frame_count}/{total_frames})")
        else:
            outline = last_outline
        
        # Create BGRA image with white outline
        outline_bgra = np.zeros((height, width, 4), dtype=np.uint8)
        outline_bgra[:, :, 0] = 255  # B
        outline_bgra[:, :, 1] = 255  # G
        outline_bgra[:, :, 2] = 255  # R
        outline_bgra[:, :, 3] = outline  # A (outline as alpha)
        
        # Save frame as PNG with transparency
        frame_path = frames_dir / f"frame_{frame_count:05d}.png"
        cv2.imwrite(str(frame_path), outline_bgra)
    
    cap.release()
    
    print(f"Processed {processed_count} unique frames, {frame_count} total frames")
    print(f"Frames saved to: {frames_dir}")
    
    # Create video from PNG sequence using FFmpeg with proper alpha channel
    output_video = output_path
    # Use qtrle codec which preserves alpha channel properly in MOV container
    ffmpeg_cmd = f'ffmpeg -y -framerate {fps} -i "{frames_dir}/frame_%05d.png" -c:v qtrle -pix_fmt argb "{output_video}" 2>/dev/null'
    
    print(f"Creating outline video with alpha channel...")
    os.system(ffmpeg_cmd)
    
    # Clean up frames
    for f in frames_dir.glob("*.png"):
        f.unlink()
    frames_dir.rmdir()
    
    print(f"Outline video created: {output_video}")
    return output_video

def main():
    parser = argparse.ArgumentParser(description='Create white outline around human subjects in video')
    parser.add_argument('input', help='Input video path')
    parser.add_argument('output', help='Output video path (with transparent outline)')
    parser.add_argument('--stroke', type=int, default=10, help='Outline stroke size in pixels (default: 10)')
    parser.add_argument('--sample', type=int, default=2, help='Process every Nth frame (default: 2)')
    
    args = parser.parse_args()
    
    process_video(args.input, args.output, args.stroke, args.sample)

if __name__ == "__main__":
    main()
