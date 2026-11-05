import sys
from PIL import Image, ImageDraw, ImageFont
import numpy as np
FOND=(30,140,140,255)
def tile(path, box, pas, scale=1.0, titre=''):
    im=Image.open(path).convert('RGBA'); x0,y0,x1,y1=box
    x0=max(0,x0);y0=max(0,y0);x1=min(im.width,x1);y1=min(im.height,y1)
    cr=im.crop((x0,y0,x1,y1)); bg=Image.new('RGBA',cr.size,FOND); bg.alpha_composite(cr)
    bg=bg.resize((int(cr.width*scale),int(cr.height*scale)),Image.LANCZOS); d=ImageDraw.Draw(bg)
    f=ImageFont.load_default()
    for x in range((x0//pas+1)*pas,x1,pas):
        X=(x-x0)*scale; d.line([(X,0),(X,bg.height)],fill=(255,255,0,110)); d.text((X+2,1),str(x),fill=(255,255,0,255),font=f)
    for y in range((y0//pas+1)*pas,y1,pas):
        Y=(y-y0)*scale; d.line([(0,Y),(bg.width,Y)],fill=(255,255,0,110)); d.text((1,Y+1),str(y),fill=(255,255,0,255),font=f)
    d.rectangle([0,bg.height-14,70,bg.height],fill=(0,0,0,255)); d.text((3,bg.height-13),titre,fill=(255,255,255,255),font=f)
    return bg.convert('RGB')
def bbox(path):
    a=np.array(Image.open(path).convert('RGBA'))[:,:,3]>40; ys=np.where(a.any(1))[0]; xs=np.where(a.any(0))[0]; return xs[0],ys[0],xs[-1],ys[-1]
def sheet(tiles,cols,out):
    w=max(t.width for t in tiles);h=max(t.height for t in tiles);rows=(len(tiles)+cols-1)//cols
    S=Image.new('RGB',(cols*(w+6),rows*(h+6)),(0,0,0))
    for i,t in enumerate(tiles): S.paste(t,((i%cols)*(w+6),(i//cols)*(h+6)))
    S.save(out); print(out,S.size)
if __name__=='__main__':
    for k,lab in (('b','dos'),('a','face')):
        ts=[]
        for i in range(1,8):
            p=f'full/{k}{i}.png'
            # le col : on cherche la colonne médiane du vêtement sur la bande basse de la silhouette
            x0,y0,x1,y1=bbox(p); cx=(x0+x1)//2
            print(lab,i,'bbox',x0,y0,x1,y1)
            ts.append(tile(p,(cx-300,y0,cx+300,y0+500),50,0.82,f'{k}{i}'))
        sheet(ts,4,f'cols_{lab}.png')
