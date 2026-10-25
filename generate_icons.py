"""
Generate stylish PWA app icons for eFootball Touch Bridge
"""
import os
from PIL import Image, ImageDraw

def create_icon(size: int, output_path: str, maskable: bool = False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background rounded rectangle or circle
    bg_color = (7, 10, 17, 255)
    border_color = (0, 242, 254, 255)

    if maskable:
        # Maskable icons fill entire canvas
        draw.rectangle([0, 0, size, size], fill=bg_color)
    else:
        # Rounded app icon
        corner = size // 5
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=corner, fill=bg_color, outline=border_color, width=max(2, size // 64))

    # Center glowing circle
    cx, cy = size // 2, size // 2
    r_outer = size // 3
    r_inner = size // 4

    # Outer decorative glow ring
    draw.ellipse([cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer], outline=(0, 242, 254, 180), width=max(2, size // 48))

    # Gamepad D-pad left accent
    dpad_w = size // 10
    dpad_h = size // 4
    dpad_x = cx - size // 4
    draw.rectangle([dpad_x - dpad_w//2, cy - dpad_h//2, dpad_x + dpad_w//2, cy + dpad_h//2], fill=(0, 242, 254, 220))
    draw.rectangle([dpad_x - dpad_h//2, cy - dpad_w//2, dpad_x + dpad_h//2, cy + dpad_w//2], fill=(0, 242, 254, 220))

    # Action buttons right accent
    btn_r = size // 22
    act_cx = cx + size // 4
    # Diamond 4 buttons
    draw.ellipse([act_cx - btn_r, cy - size//8 - btn_r, act_cx + btn_r, cy - size//8 + btn_r], fill=(255, 61, 113, 255)) # Top Shoot
    draw.ellipse([act_cx - btn_r, cy + size//8 - btn_r, act_cx + btn_r, cy + size//8 + btn_r], fill=(0, 230, 118, 255)) # Bottom Pass
    draw.ellipse([act_cx - size//8 - btn_r, cy - btn_r, act_cx - size//8 + btn_r, cy + btn_r], fill=(79, 172, 254, 255)) # Left Cross
    draw.ellipse([act_cx + size//8 - btn_r, cy - btn_r, act_cx + size//8 + btn_r, cy + btn_r], fill=(255, 145, 0, 255)) # Right Dash

    # Save
    img.save(output_path, "PNG")
    print(f"Generated {output_path} ({size}x{size})")

if __name__ == "__main__":
    web_dir = os.path.join(os.path.dirname(__file__), "web")
    create_icon(192, os.path.join(web_dir, "icon-192.png"))
    create_icon(512, os.path.join(web_dir, "icon-512.png"))
    create_icon(512, os.path.join(web_dir, "icon-maskable-512.png"), maskable=True)
