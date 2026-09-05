"""Package only the validated single-page offline build, with root index.html."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, json
root=Path(__file__).resolve().parents[1]
source=root/'releases'/'xiaohongshu'
allowed={'.html','.css','.js','.svg','.png','.jpg','.jpeg','.webp','.gif','.json','.woff','.woff2'}
files=sorted(p for p in source.rglob('*') if p.is_file())
assert (source/'index.html').is_file()
assert len([p for p in files if p.suffix=='.html'])==1
assert all(p.suffix in allowed for p in files)
target=root/'releases'/'tide-lanterns-xiaohongshu-1.0.0.zip'
with ZipFile(target,'w',ZIP_DEFLATED,compresslevel=9) as archive:
 for p in files: archive.write(p,p.relative_to(source).as_posix())
size=target.stat().st_size
assert size<10*1024*1024
result={'version':'1.0.0','zip':target.name,'bytes':size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'files':[p.relative_to(source).as_posix() for p in files]}
(root/'releases'/'package-manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
