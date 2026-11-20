# 量測：把渲染圖與參考圖在相同高度比例的輪廓寬度（佔全高）並排比較，並算深色佔比
import sys
from PIL import Image
import numpy as np
import os
def prof(path, bg_from_corner=True, thr=45):
    c=np.asarray(Image.open(path).convert('RGB')).astype(int)
    bgp=path.replace('.png','-bg.png')
    if os.path.exists(bgp):
        m=np.abs(c-np.asarray(Image.open(bgp).convert('RGB')).astype(int)).sum(2)>14
    else:
        m=np.abs(c-c[8,8]).sum(2)>thr
    m[:, :3]=False; m[:, -3:]=False
    rows=np.where(m.sum(1)>3)[0]; top,bot=rows[0],rows[-1]
    return c,m,top,bot
def segs(row):
    xs=np.where(row)[0]
    if len(xs)==0: return []
    out=[];s=p=xs[0]
    for x in xs[1:]:
        if x>p+2: out.append((s,p)); s=x
        p=x
    out.append((s,p)); return [(a,b) for a,b in out if b-a>3]
def report(path,label, crop_bottom=None):
    c,m,top,bot=prof(path)
    if crop_bottom: m[crop_bottom:]=False; rows=np.where(m.sum(1)>3)[0]; bot=rows[-1]
    H=bot-top; res={}
    for f in [0.12,0.17,0.21,0.25,0.30,0.33,0.40,0.47,0.52,0.58,0.65,0.72,0.80,0.88]:
        r=top+int(f*H); ss=segs(m[r]); res[f]=[round((b-a)/H,3) for a,b in ss]
    dark=(c.mean(2)<80)&m
    return res, dark[top:bot].sum()/max(1,m[top:bot].sum())
ref,rd=report(sys.argv[1],'ref',crop_bottom=900)
out,od=report(sys.argv[2],'robot')
print('高度    參考圖                         機器人')
for f in ref: print(f'{f:.2f}  {str(ref[f]):32s} {out[f]}')
print(f'深色佔比 參考 {rd:.3f}  機器人 {od:.3f}  比值 {od/rd:.2f}')
