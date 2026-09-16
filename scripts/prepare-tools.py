from pathlib import Path
import urllib.request, zipfile
root=Path(__file__).resolve().parent.parent
folder=root/'tools'
folder.mkdir(exist_ok=True)
target=folder/'blender-4.5.0-windows-x64'
if not (target/'blender.exe').exists():
    archive=folder/'blender.zip'
    if not archive.exists():
        print('Downloading portable Blender from blender.org',flush=True)
        urllib.request.urlretrieve('https://mirror.blender.org/release/Blender4.5/blender-4.5.0-windows-x64.zip',archive)
    print('Extracting portable Blender',flush=True)
    with zipfile.ZipFile(archive) as z:z.extractall(folder)
print(target/'blender.exe',flush=True)
