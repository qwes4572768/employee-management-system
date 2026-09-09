#!/usr/bin/env python3
"""Rebuild derived Expo icons from the official source logo.

Replace assets/logo.png with the real brand PNG, then run:

    python3 scripts/sync-brand-assets.py

This script never invents a logo. It only letterboxes the source file
(contain, no stretch) onto a black canvas with padding so iOS rounded
masks and Android adaptive icons do not clip the tips.
Splash images stay logo-only: black background, centered mark, no text.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
CONFIG_PATH = ASSETS / 'brand-config.json'


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding='utf-8'))


def contain_on_black(source: Image.Image, size: int, scale: float) -> Image.Image:
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 255))
    inner = max(1, int(size * scale))
    fitted = ImageOps.contain(source.convert('RGBA'), (inner, inner))
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.alpha_composite(fitted, (x, y))
    return canvas


def to_rgb(image: Image.Image) -> Image.Image:
    background = Image.new('RGB', image.size, (0, 0, 0))
    background.paste(image, mask=image.getchannel('A') if image.mode == 'RGBA' else None)
    return background


def monochrome(source: Image.Image, size: int, scale: float) -> Image.Image:
    contained = contain_on_black(source, size, scale)
    white = Image.new('L', contained.size, 255)
    return Image.merge('RGBA', (white, white, white, contained.getchannel('A')))


def main() -> None:
    config = load_config()
    source_path = (ASSETS / config['source']).resolve()
    if not source_path.exists():
        raise SystemExit(f'Missing official logo: {source_path}')

    source = Image.open(source_path).convert('RGBA')
    background = str(config.get('background', '#000000')).lower()
    if background not in {'#000000', '#000'}:
        raise SystemExit('Brand background must stay black for this app.')

    icon_scale = float(config['iconScale'])
    adaptive_scale = float(config['adaptiveForegroundScale'])
    splash_scale = float(config['splashScale'])
    favicon_size = int(config['faviconSize'])

    icon = to_rgb(contain_on_black(source, 1024, icon_scale))
    adaptive = contain_on_black(source, 1024, adaptive_scale)
    splash = to_rgb(contain_on_black(source, 1024, splash_scale))
    favicon = to_rgb(contain_on_black(source, favicon_size, 0.86))
    bg = Image.new('RGB', (1024, 1024), (0, 0, 0))
    mono = monochrome(source, 1024, adaptive_scale)

    icon.save(ASSETS / 'icon.png', 'PNG')
    adaptive.save(ASSETS / 'adaptive-icon.png', 'PNG')
    adaptive.save(ASSETS / 'android-icon-foreground.png', 'PNG')
    bg.save(ASSETS / 'android-icon-background.png', 'PNG')
    mono.save(ASSETS / 'android-icon-monochrome.png', 'PNG')
    splash.save(ASSETS / 'splash.png', 'PNG')
    splash.save(ASSETS / 'splash-icon.png', 'PNG')
    favicon.save(ASSETS / 'favicon.png', 'PNG')
    print('Derived brand assets from', source_path.name)


if __name__ == '__main__':
    main()
