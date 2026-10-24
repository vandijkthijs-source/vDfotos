"""Resize the approved VD Gallery artwork into Android launcher resources."""
from pathlib import Path
import json
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parents[1]
source = Image.open(root / 'assets/icon-source/vd-gallery.png').convert('RGB')
bg = source.getpixel((0, 0))
color = '#%02x%02x%02x' % bg
icon = source.resize((1024, 1024), Image.Resampling.LANCZOS)
icon.save(root / 'assets/icon.png')
# Android's adaptive layer is 108dp; keep the entire logo within its 66dp safe circle.
foreground = Image.new('RGB', (1024, 1024), bg)
art = source.resize((696, 696), Image.Resampling.LANCZOS)
foreground.paste(art, ((1024-696)//2, (1024-696)//2))
foreground.save(root / 'assets/adaptive-icon.png')
config_path = root / 'app.json'
config = json.loads(config_path.read_text())
config['expo']['icon'] = './assets/icon.png'
config['expo']['android']['adaptiveIcon'] = {'foregroundImage': './assets/adaptive-icon.png', 'backgroundColor': color}
config['expo']['version'] = '1.0.2'
config['expo']['android']['versionCode'] = 3
config_path.write_text(json.dumps(config, indent=2) + '\n')
res = root / 'android/app/src/main/res'
for density, size, adaptive in [('mdpi',48,108),('hdpi',72,162),('xhdpi',96,216),('xxhdpi',144,324),('xxxhdpi',192,432)]:
    folder = res / ('mipmap-' + density)
    folder.mkdir(parents=True, exist_ok=True)
    base = icon.resize((size,size), Image.Resampling.LANCZOS)
    base.save(folder / 'ic_launcher.webp', lossless=True)
    mask = Image.new('L', (size*4,size*4)); ImageDraw.Draw(mask).ellipse((0,0,size*4-1,size*4-1), fill=255)
    rounded = base.convert('RGBA'); rounded.putalpha(mask.resize((size,size),Image.Resampling.LANCZOS))
    rounded.save(folder / 'ic_launcher_round.webp', lossless=True)
    foreground.resize((adaptive,adaptive), Image.Resampling.LANCZOS).save(folder / 'ic_launcher_foreground.webp', lossless=True)
import re
p = res / 'values/colors.xml'
p.write_text(re.sub(r'(<color name="iconBackground">).*?(</color>)', rf'\g<1>{color}\2', p.read_text()))
p = root / 'android/app/build.gradle'
s = re.sub(r'versionCode \d+', 'versionCode 3', p.read_text())
s = re.sub(r'versionName "[^"]+"', 'versionName "1.0.2"', s);p.write_text(s)
for name in ['package.json', 'package-lock.json']:
    p=root/name; data=json.loads(p.read_text()); data['version']='1.0.2'
    if 'packages' in data: data['packages']['']['version']='1.0.2'
    p.write_text(json.dumps(data,indent=2)+'\n')
# Preview actual adaptive viewport with common launcher masks at usable sizes.
board=Image.new('RGB',(720,300),'#202124');draw=ImageDraw.Draw(board)
viewport=foreground.resize((324,324),Image.Resampling.LANCZOS).crop((60,60,264,264))
for x, shape in [(70,'Circle'),(430,'Rounded square')]:
    mask=Image.new('L',(204,204)); d=ImageDraw.Draw(mask)
    if shape=='Circle': d.ellipse((0,0,203,203),fill=255)
    else: d.rounded_rectangle((0,0,203,203),radius=45,fill=255)
    board.paste(viewport,(x,25),mask);draw.text((x,250),shape,fill='white')
board.save(root/'assets/icon-source/launcher-preview.png')
print('Packaged VD Gallery at five Android densities; version 1.0.2 (3).')
