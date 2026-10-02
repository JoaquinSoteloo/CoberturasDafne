"""Logo de Coberturas: el monograma de serpientes en amarillo sobre el índigo de la app.

Toma el logo original (scripts/logo-original.jpg, ya en colores), recorta el dibujo,
lo centra sobre el índigo de la app y genera los íconos y public/logo.png.
Uso: python scripts/make_logo.py (requiere Pillow).
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'scripts' / 'logo-original.jpg'
NIGHT = (34, 24, 61)       # #22183d, el fondo de la app (el del original es casi igual)


def framed(logo: Image.Image, size: int, fill: float) -> Image.Image:
    """El dibujo centrado sobre el índigo, ocupando `fill` del lado."""
    box = logo.convert('L').point(lambda v: 255 if v > 70 else 0).getbbox()
    art = logo.crop(box)
    scale = size * fill / max(art.size)
    art = art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)
    canvas = Image.new('RGB', (size, size), NIGHT)
    canvas.paste(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas


def save(img: Image.Image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    print(path.relative_to(ROOT), img.size[0])


logo = Image.open(SOURCE).convert('RGB')
icons = ROOT / 'public' / 'icons'
save(framed(logo, 1024, 0.80), ROOT / 'scripts' / 'logo-coberturas.png')
save(framed(logo, 192, 0.80), icons / 'icon-192.png')
save(framed(logo, 512, 0.80), icons / 'icon-512.png')
# Android lo recorta en círculo o gota: el dibujo tiene que entrar en el 80 % central.
save(framed(logo, 512, 0.60), icons / 'icon-maskable-512.png')
save(framed(logo, 180, 0.80), ROOT / 'src' / 'app' / 'apple-icon.png')
save(framed(logo, 64, 0.88), ROOT / 'src' / 'app' / 'icon.png')
save(framed(logo, 256, 0.84), ROOT / 'public' / 'logo.png')
