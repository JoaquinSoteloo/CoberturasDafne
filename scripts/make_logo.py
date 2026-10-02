"""Logo de Coberturas: el monograma de serpiente en amarillo flash sobre el índigo de la app.

Recolorea la imagen original (blanco sobre negro) conservando la textura de escamas:
cada píxel mezcla el índigo y el amarillo según su brillo. Genera los íconos de la app.
Uso: python scripts/make_logo.py (requiere Pillow).
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'scripts' / 'logo-original.png'
NIGHT = (34, 24, 61)       # #22183d
FLASH = (255, 212, 71)     # #ffd447


def recolor(img: Image.Image) -> Image.Image:
    gray = img.convert('L')
    channels = [gray.point([round(n + (f - n) * v / 255) for v in range(256)]) for n, f in zip(NIGHT, FLASH)]
    return Image.merge('RGB', channels)


def framed(logo: Image.Image, size: int, fill: float) -> Image.Image:
    """El dibujo centrado sobre el índigo, ocupando `fill` del lado."""
    box = logo.convert('L').point(lambda v: 255 if v > 40 else 0).getbbox()
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


logo = recolor(Image.open(SOURCE))
icons = ROOT / 'public' / 'icons'
save(framed(logo, 1024, 0.78), ROOT / 'scripts' / 'logo-coberturas.png')
save(framed(logo, 192, 0.78), icons / 'icon-192.png')
save(framed(logo, 512, 0.78), icons / 'icon-512.png')
# Android lo recorta en círculo o gota: el dibujo tiene que entrar en el 80 % central.
save(framed(logo, 512, 0.58), icons / 'icon-maskable-512.png')
save(framed(logo, 180, 0.78), ROOT / 'src' / 'app' / 'apple-icon.png')
save(framed(logo, 64, 0.86), ROOT / 'src' / 'app' / 'icon.png')
save(framed(logo, 256, 0.82), ROOT / 'public' / 'logo.png')
