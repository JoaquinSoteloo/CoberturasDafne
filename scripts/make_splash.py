"""Pantallas de arranque del iPhone (las que muestra al abrir la app desde el ícono): el logo sobre la noche,
del tamaño y en el lugar exactos de BootScreen (src/components/boot-screen.tsx), así entre una y otra no hay
blanco ni salto. iPhone necesita una imagen por tamaño de pantalla.
Uso: python scripts/make_splash.py (requiere Pillow). Escribe public/splash/*.png y src/lib/splash-screens.ts."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
NIGHT = (34, 24, 61)   # #22183d, el fondo del logo y de BootScreen
LOGO, RADIUS = 112, 26  # como .boot-logo (px de CSS), con el borde de 1px por fuera (box-shadow)
S = 4                   # supermuestreo para bordes suaves

# Pantallas en vertical: ancho y alto en puntos, y densidad. Los modelos son de referencia.
SCREENS = [
    (440, 956, 3),  # 16 Pro Max, 17 Pro Max
    (420, 912, 3),  # Air
    (402, 874, 3),  # 16 Pro, 17, 17 Pro
    (430, 932, 3),  # 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
    (393, 852, 3),  # 14 Pro, 15, 15 Pro, 16
    (428, 926, 3),  # 12 Pro Max, 13 Pro Max, 14 Plus
    (390, 844, 3),  # 12, 12 Pro, 13, 13 Pro, 14, 16e
    (375, 812, 3),  # X, XS, 11 Pro, 12 mini, 13 mini
    (360, 780, 3),  # 12 mini, 13 mini (según cómo los informe iOS)
    (414, 896, 3),  # XS Max, 11 Pro Max
    (414, 896, 2),  # XR, 11
    (414, 736, 3),  # 6s Plus, 7 Plus, 8 Plus
    (375, 667, 2),  # SE (2.ª y 3.ª), 6s, 7, 8
]


def splash(logo, w, h, dpr):
    W, H = w * dpr, h * dpr
    big = Image.new('RGB', (W * S, H * S), NIGHT)
    side = LOGO * dpr * S
    x, y = (W * S - side) // 2, (H * S - side) // 2
    ring = dpr * S  # el borde finito de .boot-logo: blanco al 12 % por fuera del logo
    rim = Image.new('L', big.size, 0)
    ImageDraw.Draw(rim).rounded_rectangle((x - ring, y - ring, x + side + ring - 1, y + side + ring - 1), (RADIUS + 1) * dpr * S, fill=31)
    big.paste((255, 255, 255), (0, 0), rim)
    mask = Image.new('L', (side, side), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, side - 1, side - 1), RADIUS * dpr * S, fill=255)
    big.paste(logo.resize((side, side), Image.LANCZOS), (x, y), mask)
    return big.resize((W, H), Image.LANCZOS)


logo = Image.open(ROOT / 'public' / 'icons' / 'icon-512.png').convert('RGB')
out = ROOT / 'public' / 'splash'
out.mkdir(parents=True, exist_ok=True)
lines = []
for w, h, dpr in SCREENS:
    name = f'splash-{w * dpr}x{h * dpr}.png'
    splash(logo, w, h, dpr).save(out / name, optimize=True)
    media = f'(device-width: {w}px) and (device-height: {h}px) and (-webkit-device-pixel-ratio: {dpr}) and (orientation: portrait)'
    lines.append(f"  {{ url: '/splash/{name}', media: '{media}' }},")
    print(name)

(ROOT / 'src' / 'lib' / 'splash-screens.ts').write_text(
    '// Generado por scripts/make_splash.py: no editar a mano.\n'
    '/** Pantallas de arranque del iPhone, una por tamaño de pantalla (ver BootScreen). */\n'
    'export const SPLASH_SCREENS = [\n' + '\n'.join(lines) + '\n];\n', encoding='utf-8')
print('src/lib/splash-screens.ts')
