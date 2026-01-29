#!/usr/bin/env python3
"""
ULTRA-FAST Foreground Extraction with Premium Visual Effects

Speed optimizations:
1. NO alpha_matting (10x faster segmentation)
2. Higher sample rate (process fewer frames)
3. u2net model (faster than isnet)
4. Simple but beautiful effects

Visual Effects:
1. Clean foreground with soft edges
2. Thick white outline with glow
3. Soft drop shadow for depth
"""

import sys
import os
import cv2
import numpy as np
from PIL import Image
from rembg import remove, new_session
import argparse
from pathlib import Path
import subprocess

def get_fast_session():
    """Create fast rembg session."""
    try:
        import platform
        providers = []
        
        # Apple Silicon
        if platform.system() == 'Darwin' and platform.machine() == 'arm64':
            providers.append('CoreMLExecutionProvider')
        
        # CUDA
        try:
            import onnxruntime as ort
            if 'CUDAExecutionProvider' in ort.get_available_providers():
                providers.append('CUDAExecutionProvider')
        except:
            pass
        
        providers.append('CPUExecutionProvider')
        print(f"Providers: {providers}")
        
        # u2net is faster than isnet-general-use
        return new_session("u2net", providers=providers)
    except Exception as e:
        print(f"Session warning: {e}")
        return new_session("u2net")

def create_outline(alpha, stroke_size=12):
    """Create clean white outline with glow."""
    _, binary = cv2.threshold(alpha, 127, 255, cv2.THRESH_BINARY)
    
    # Clean edges
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, 
                              cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    
    # Inner stroke (solid white)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (stroke_size, stroke_size))
    dilated = cv2.dilate(binary, kernel, iterations=1)
    inner = cv2.subtract(dilated, binary)
    
    # Outer glow
    kernel2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (stroke_size * 2, stroke_size * 2))
    dilated2 = cv2.dilate(binary, kernel2, iterations=1)
    outer = cv2.subtract(dilated2, dilated)
    outer = cv2.GaussianBlur(outer, (stroke_size | 1, stroke_size | 1), 0)
    outer = (outer * 0.5).astype(np.uint8)
    
    return np.clip(cv2.add(outer, inner), 0, 255).astype(np.uint8)

def create_shadow(alpha, offset_x=10, offset_y=12, blur=25, opacity=0.35):
    """Create soft drop shadow."""
    _, binary = cv2.threshold(alpha, 100, 255, cv2.THRESH_BINARY)
    
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    shadow = cv2.dilate(binary, kernel, iterations=1)
    shadow = cv2.GaussianBlur(shadow, (blur | 1, blur | 1), 0)
    shadow = (shadow * opacity).astype(np.uint8)
    
    # Offset
    h, w = shadow.shape
    result = np.zeros_like(shadow)
    if offset_y >= 0 and offset_x >= 0:
        result[offset_y:, offset_x:] = shadow[:h-offset_y, :w-offset_x]
    
    return result

def process_video_fast(input_path, fg_output, outline_output, stroke_size=12, sample_rate=4):
    """ULTRA-FAST video processing."""
    print(f"[FAST MODE] Processing: {input_path}")
    print(f"Sample rate: {sample_rate}")
    
    shadow_output = str(Path(outline_output).parent / f"shadow-{Path(outline_output).stem.replace('outline-', '')}.mov")
    
    session = get_fast_session()
    
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(f"Error: Cannot open {input_path}")
        sys.exit(1)
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    print(f"Video: {width}x{height} @ {fps}fps, {total_frames} frames")
    
    # Temp directories
    temp_dir = Path(fg_output).parent / "temp_fast"
    fg_dir = temp_dir / "fg"
    outline_dir = temp_dir / "outline"
    shadow_dir = temp_dir / "shadow"
    
    for d in [fg_dir, outline_dir, shadow_dir]:
        d.mkdir(parents=True, exist_ok=True)
    
    frame_idx = 0
    processed = 0
    last_fg = None
    last_outline = None
    last_shadow = None
    
    print("Processing frames...")
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_idx % sample_rate == 0:
            # Remove background (NO alpha matting = fast)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(rgb)
            result = remove(pil_img, session=session, alpha_matting=False)
            result_np = np.array(result)
            
            # Get alpha and foreground
            if result_np.shape[2] == 4:
                alpha = result_np[:, :, 3]
                fg_rgba = cv2.cvtColor(result_np, cv2.COLOR_RGBA2BGRA)
            else:
                alpha = np.ones((height, width), dtype=np.uint8) * 255
                fg_rgba = cv2.cvtColor(result_np, cv2.COLOR_RGB2BGRA)
                fg_rgba[:, :, 3] = alpha
            
            # Soften edges
            alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
            fg_rgba[:, :, 3] = alpha
            
            last_fg = fg_rgba
            
            # Create outline
            outline_alpha = create_outline(alpha, stroke_size)
            outline_rgba = np.zeros((height, width, 4), dtype=np.uint8)
            outline_rgba[:, :, :3] = 255
            outline_rgba[:, :, 3] = outline_alpha
            last_outline = outline_rgba
            
            # Create shadow
            shadow_alpha = create_shadow(alpha)
            shadow_rgba = np.zeros((height, width, 4), dtype=np.uint8)
            shadow_rgba[:, :, 3] = shadow_alpha
            last_shadow = shadow_rgba
            
            processed += 1
            if processed % 5 == 0:
                print(f"  Processed {processed} frames ({frame_idx}/{total_frames})")
        
        # Write frames
        if last_fg is not None:
            cv2.imwrite(str(fg_dir / f"f{frame_idx:06d}.png"), last_fg)
            cv2.imwrite(str(outline_dir / f"f{frame_idx:06d}.png"), last_outline)
            cv2.imwrite(str(shadow_dir / f"f{frame_idx:06d}.png"), last_shadow)
        
        frame_idx += 1
    
    cap.release()
    print(f"Processed {processed} unique frames, {frame_idx} total")
    
    # Encode videos
    print("Encoding videos...")
    
    def encode(pattern, output):
        cmd = ['ffmpeg', '-y', '-framerate', str(fps), '-i', pattern,
               '-c:v', 'qtrle', '-pix_fmt', 'argb', output]
        subprocess.run(cmd, capture_output=True, check=True)
    
    encode(str(fg_dir / 'f%06d.png'), fg_output)
    encode(str(outline_dir / 'f%06d.png'), outline_output)
    encode(str(shadow_dir / 'f%06d.png'), shadow_output)
    
    # Cleanup
    import shutil
    shutil.rmtree(temp_dir)
    
    print(f"Done!")
    print(f"  Foreground: {fg_output}")
    print(f"  Outline: {outline_output}")
    print(f"  Shadow: {shadow_output}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("foreground_output")
    parser.add_argument("outline_output")
    parser.add_argument("--stroke", type=int, default=12)
    parser.add_argument("--sample", type=int, default=4)
    
    args = parser.parse_args()
    process_video_fast(args.input, args.foreground_output, args.outline_output, 
                       args.stroke, args.sample)
