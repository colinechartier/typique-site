import numpy as np, os
from PIL import Image, ImageDraw
from scipy.interpolate import PchipInterpolator, RBFInterpolator
from scipy import ndimage as ndi
CW,CH,AX,AY=840,950,420,112
TOP={
'n5b':[(0,250),(352,400),(380,431),(402,446),(425,455),(472,460),(520,455),(540,446),(561,431),(590,400),(930,250)],
'n5a':[(0,250),(352,400),(380,431),(390,452),(405,452),(470,455),(535,452),(550,452),(562,431),(590,400),(930,250)],
'n6b':[(0,250),(290,420),(310,400),(331,384),(352,382),(400,398),(431,406),(458,410),(510,414),(530,418),(540,420),(558,412),(581,399),(616,396),(642,404),(650,423),(670,450),(930,560)],
'n6a':[(0,250),(300,425),(320,400),(337,387),(361,387),(392,396),(405,418),(440,412),(480,412),(520,412),(550,420),(566,404),(590,397),(616,395),(637,402),(645,422),(670,450),(930,560)],
'b1':[(0,300),(330,500),(358,540),(385,553),(420,563),(460,567),(500,564),(535,553),(563,539),(590,500),(930,300)],
'b2':[(0,300),(332,500),(360,540),(385,553),(420,563),(460,568),(500,565),(535,553),(565,537),(592,500),(930,300)],
'b3':[(0,100),(420,240),(447,268),(470,279),(510,289),(550,293),(590,289),(620,279),(640,265),(668,235),(1112,100)],
'b4':[(0,100),(415,245),(442,278),(470,292),(505,298),(540,299),(575,296),(610,288),(640,275),(668,240),(1112,100)],
'b5':[(0,200),(350,400),(378,438),(403,455),(421,465),(440,471),(477,474),(514,467),(536,454),(543,450),(570,420),(930,250)],
'b6':[(0,200),(345,365),(372,352),(393,347),(420,352),(450,362),(482,373),(515,383),(540,391),(556,373),(587,360),(614,360),(640,361),(652,375),(700,420),(930,500)],
'b7':[(0,200),(300,425),(338,382),(372,375),(412,386),(459,394),(501,401),(527,407),(550,410),(575,410),(601,402),(627,399),(650,402),(690,450),(930,500)],
'a1':[(0,300),(335,495),(360,530),(367,541),(380,547),(420,554),(464,559),(505,556),(542,547),(570,533),(595,495),(930,300)],
'a2':[(0,300),(338,500),(362,539),(369,558),(390,561),(420,565),(464,569),(510,566),(550,560),(566,556),(573,539),(598,500),(930,300)],
'a3':[(0,100),(415,280),(441,306),(462,322),(490,326),(541,330),(590,326),(615,322),(638,303),(665,270),(1112,100)],
'a4':[(0,100),(415,290),(441,316),(460,328),(490,333),(545,338),(590,335),(612,328),(625,319),(650,285),(1112,100)],
'a5':[(0,200),(352,405),(380,441),(398,458),(430,472),(470,478),(505,477),(528,468),(547,454),(575,420),(930,250)],
'a6':[(0,200),(300,430),(323,432),(350,428),(390,430),(414,436),(444,455),(475,458),(502,455),(523,436),(560,432),(608,436),(630,440),(700,470),(930,600)],
'a7':[(0,200),(300,425),(318,402),(337,385),(360,394),(382,391),(400,402),(421,414),(450,417),(476,418),(525,419),(550,425),(562,428),(572,405),(579,397),(603,404),(640,401),(690,450),(930,520)],
}
FILL={'n5b':(380,561),'n5a':(380,562),'n6b':(431,558),'n6a':(405,566),'b1':(358,563),'b2':(360,565),'b3':(447,640),'b4':(442,640),'b5':(378,543),'b6':(450,640),'b7':(412,601),'a1':(360,570),'a2':(362,573),'a3':(441,638),'a4':(441,625),'a5':(380,547),'a6':(414,523),'a7':(400,572)}
def residu(n,r,g,b):
    lum=.3*r+.59*g+.11*b
    if n in('a1','a2','b1','b2','a5','b5','n5a','n5b'): return lum<120
    if n in('a4','b4'): return (lum<120)|((r-b)>45)
    if n in('a3','b3'): return (r>95)&((r-b)>45)
    if n=='b7': return lum<55
    if n=='a7': return lum<40
    return np.zeros_like(r,bool)
BAS={'b5':[(0,1260),(280,1246),(487,1246),(693,1258),(930,1258)],'b6':[(0,1215),(290,1205),(521,1210),(745,1219),(823,1228),(930,1228)],
     'a5':[(0,1240),(297,1252),(495,1252),(685,1262),(930,1262)],'a6':[(0,1265),(305,1262),(495,1270),(702,1270),(930,1270)]}
PROF={'n6b':18,'b7':10}
def courbe(pts,w):
    xs,ys=zip(*pts); f=PchipInterpolator(xs,ys,extrapolate=True); return f(np.arange(w))
def bleed(rgb,ok):
    idx=ndi.distance_transform_edt(~ok,return_distances=False,return_indices=True)
    return rgb[idx[0],idx[1]]
def affine_alpha(a):
    a=ndi.gaussian_filter(a.astype(float),1.1); return np.clip((a-.45*255)/(.40*255),0,1)*255
def nettoie(n):
    im=np.array(Image.open(f'full/{n}.png').convert('RGBA')).astype(float); h,w=im.shape[:2]
    Y=courbe(TOP[n],w); yy,xx=np.mgrid[0:h,0:w]
    a=im[...,3].copy(); rgb=im[...,:3].copy()
    a[yy<Y[xx]]=0
    if n in BAS: a[yy>courbe(BAS[n],w)[xx]]=0
    xa,xb=FILL[n]
    # restes de cintre juste sous le col
    zone=(xx>=xa-8)&(xx<=xb+8)&(yy>=Y[xx])&(yy<=Y[xx]+34)
    res=zone&residu(n,rgb[...,0],rgb[...,1],rgb[...,2])
    if res.any():
        res=ndi.binary_dilation(res,iterations=2)&zone
        rgb=bleed(rgb,(a>200)&~res)*res[...,None]+rgb*(~res[...,None])
    # bord du col : net et plein, couleur reprise juste dessous
    for x in range(xa,xb+1):
        y0=int(np.ceil(Y[x]));d=PROF.get(n,7)
        if y0+d+1<h:
            for j in range(d): rgb[y0+j,x]=rgb[min(h-1,y0+2*d+1-j),x]   # le vrai tissu en miroir, pas une couleur répétée
            a[y0:y0+d,x]=255
            a[y0+d:y0+d+24,x]=np.maximum(a[y0+d:y0+d+24,x],255)
    # seul le plus grand bloc reste, trous bouchés
    lab,nb=ndi.label(a>128); tailles=ndi.sum(a>128,lab,range(1,nb+1)); keep=lab==(1+int(np.argmax(tailles)))
    keep=ndi.binary_fill_holes(keep); a=a*ndi.binary_dilation(keep,iterations=3); a[keep&(a<255)&ndi.binary_erosion(keep,iterations=3)]=255
    return np.dstack([rgb,a])
def warp(src,sp,dp,forme):
    h,w=forme; pas=6
    gy,gx=np.mgrid[0:h+pas:pas,0:w+pas:pas]; G=np.c_[gx.ravel(),gy.ravel()].astype(float)
    M=RBFInterpolator(np.array(dp,float),np.array(sp,float),kernel='thin_plate_spline',smoothing=2.0)(G)
    mx=ndi.zoom(M[:,0].reshape(gx.shape),pas,order=1)[:h,:w]; my=ndi.zoom(M[:,1].reshape(gx.shape),pas,order=1)[:h,:w]
    ok=src[...,3]>200; rgb=bleed(src[...,:3],ok)
    out=np.zeros((h,w,4))
    for c in range(3): out[...,c]=ndi.map_coordinates(rgb[...,c],[my,mx],order=3,mode='nearest')
    out[...,3]=ndi.map_coordinates(src[...,3],[my,mx],order=1,mode='constant')
    return np.clip(out,0,255)
# --- le bord intérieur du col, côté face : au-dessus, on voit l'intérieur du vêtement
FRONT={'a1':[(360,530),(379,560),(415,588),(464,600),(512,591),(548,564),(570,535)],
'a2':[(362,539),(385,583),(422,610),(464,619),(513,610),(549,583),(573,539)],
'a3':[(441,306),(456,340),(492,362),(541,368),(589,362),(622,338),(638,303)],
'a4':[(441,316),(461,349),(497,374),(545,380),(594,367),(621,337),(625,319)],
'a7':[(400,402),(434,468),(470,532),(518,480),(565,425),(572,405)],
'n5a':[(380,431),(394,463),(415,484),(470,495),(525,484),(549,461),(562,431)],
'n6a':[(401,416),(434,464),(465,505),(519,464),(568,406)]}
# --- le cintre : large et plein, ses bras entrent dans le vêtement, il n'y a plus de vide sous lui
def cintre():
    S=3; h=220
    def bez(p0,p1,p2,p3,n=60):
        t=np.linspace(0,1,n)[:,None]; P=[np.array(q,float) for q in (p0,p1,p2,p3)]
        return (1-t)**3*P[0]+3*(1-t)**2*t*P[1]+3*(1-t)*t**2*P[2]+t**3*P[3]
    g=np.vstack([bez((0,106),(-30,106),(-60,114),(-92,130)),bez((-92,130),(-105,137),(-118,146),(-126,156)),bez((-126,156),(-131,164),(-124,172),(-116,168)),bez((-116,168),(-85,150),(-45,142),(0,142))])
    d_=g[::-1].copy(); d_[:,0]*=-1
    poly=[((x+AX)*S,y*S) for x,y in np.vstack([g,d_])]
    m=Image.new('L',(CW*S,h*S),0); ImageDraw.Draw(m).polygon(poly,fill=255); M=np.array(m)>0
    r=np.random.RandomState(7); H_,W_=M.shape
    n=ndi.gaussian_filter(r.rand(H_,W_),(1.2*S,30*S)); n=(n-n.mean())/n.std()
    yy,xx=np.mgrid[0:H_,0:W_]
    grain=np.sin((yy+n*14*S)/(2.3*S))*.5
    bord=ndi.distance_transform_edt(M)/S
    relief=.70+.30*np.clip(bord/7,0,1)
    haut=np.clip(1.10-(yy/S-104)/120,.78,1.1)
    col=np.array([150,96,54],float)[None,None,:]*(relief*haut*(1+.055*grain))[...,None]
    B=Image.fromarray(np.dstack([col.clip(0,255),(M*255).astype(float)]).round().astype('uint8'))
    cro=Image.new('RGBA',(CW*S,h*S),(0,0,0,0)); d=ImageDraw.Draw(cro)
    c=np.vstack([np.c_[np.full(70,420.),np.linspace(110,44,70)],bez((420,44),(420,34),(437,34),(437,20)),bez((437,20),(437,5),(411,2),(406,16))])
    for rayon,coul,dx in ((3.7,(112,110,105,255),0),(2.7,(170,168,162,255),-.5),(1.1,(238,236,232,255),-1.1)):
        for x,y in c: d.ellipse([(x+dx-rayon)*S,(y-rayon)*S,(x+dx+rayon)*S,(y+rayon)*S],fill=coul)
    T=Image.new('RGBA',(CW*S,h*S),(0,0,0,0)); T.alpha_composite(B); T.alpha_composite(cro)
    bague=ImageDraw.Draw(T)
    for rayon,coul,dx in ((6.2,(120,118,112,255),0),(4.8,(182,180,174,255),-.6),(1.7,(238,236,232,255),-1.6)):
        bague.rounded_rectangle([(420+dx-rayon)*S,101*S,(420+dx+rayon)*S,112*S],radius=2*S,fill=coul)
    T=T.resize((CW,h),Image.LANCZOS)
    H=Image.new('RGBA',(CW,CH),(0,0,0,0)); H.alpha_composite(T)
    return H
CINTRE=cintre()
HA=np.array(CINTRE)[...,3]/255.
def pose(arr,ax,ay,hauteur,bas,front=None):
    a=affine_alpha(arr[...,3]); rgb=bleed(arr[...,:3],a>245)
    im=Image.fromarray(np.dstack([rgb,a]).round().clip(0,255).astype('uint8'))
    k=hauteur/(bas-ay); im=im.resize((round(im.width*k),round(im.height*k)),Image.LANCZOS)
    ox,oy=AX-round(ax*k),AY-round(ay*k)
    G=Image.new('RGBA',(CW,CH),(0,0,0,0)); G.paste(im,(ox,oy))
    g=np.array(G).astype(float); ag=g[...,3]/255.
    h=np.array(CINTRE).astype(float)
    # le vêtement fait de l'ombre sur le bois, là où le cintre entre dedans
    ombre=np.roll(ndi.gaussian_filter(ag,4.5),-3,axis=0)
    h[...,:3]*=(1-.42*ombre)[...,None]
    yy,xx=np.mgrid[0:CH,0:CW]; dessus=np.zeros((CH,CW),bool)
    if front:
        xs=[x*k+ox for x,_ in front]; ys=[y*k+oy for _,y in front]
        F=PchipInterpolator(xs,ys); X0,X1=int(np.ceil(xs[0])),int(xs[-1])
        fy=np.full(CW,-1.); fy[X0:X1+1]=F(np.arange(X0,X1+1))
        dessus=(xx>=X0)&(xx<=X1)&(yy<fy[xx])
        # l'intérieur du vêtement est dans l'ombre, et le cintre y porte son ombre
        ombre_c=np.roll(ndi.gaussian_filter(HA,5),8,axis=0)
        fond=1-.15-.30*ombre_c
        g[...,:3]=np.where((dessus&(ag>0))[...,None],g[...,:3]*fond[...,None],g[...,:3])
        # le col de devant passe devant le cintre : petite ombre sur le bois à cet endroit
        h[...,:3]*=(1-.34*ndi.gaussian_filter((~dessus).astype(float),3.5))[...,None]*(1/(1-.42*ombre))[...,None]*(1-.0*ombre)[...,None]
    C=Image.new('RGBA',(CW,CH),(0,0,0,0)); C.alpha_composite(Image.fromarray(h.clip(0,255).round().astype('uint8')))
    C.alpha_composite(Image.fromarray(g.clip(0,255).round().astype('uint8')))
    if front:
        v=h.copy(); v[...,3]*=dessus
        C.alpha_composite(Image.fromarray(v.clip(0,255).round().astype('uint8')))
    return C
os.makedirs('canvas',exist_ok=True)
LISTE=[('estaque-dos','b1',460,540,690),('estaque-face','a1',465,530,690),('pinede-dos','b2',463,538,690),('pinede-face','a2',467,539,690),
('soleilcouchant-dos','b3',544,266,770),('soleilcouchant-face','a3',540,305,770),('petitmatin-dos','b4',541,276,770),('petitmatin-face','a4',533,317,770),
('pleincagnard-dos','n5b',470,431,670),('pleincagnard-face','n5a',471,431,670),('minot-dos','n6b',479,382,790),('minot-face','n6a',480,387,790),
('corpssale-dos','b7',478,376,790),('corpssale-face','a7',478,386,790)]
for nom,n,ax,ay,hh in LISTE:
    arr=nettoie(n); bas=np.where((arr[...,3]>128).any(1))[0][-1]
    pose(arr,ax,ay,hh,bas,FRONT.get(n)).save(f'canvas/{nom}.png')
ord_=['estaque','pinede','soleilcouchant','petitmatin','pleincagnard','minot','corpssale']
P=Image.new('RGB',(7*300,2*340),(244,241,236))
for j,v in enumerate(('dos','face')):
    for i,o in enumerate(ord_):
        c=Image.open(f'canvas/{o}-{v}.png').resize((300,339),Image.LANCZOS); P.paste(c,(i*300,j*340),c)
P.save('controle.png')
noms=['estaque-dos','estaque-face','soleilcouchant-dos','soleilcouchant-face','pleincagnard-dos','pleincagnard-face','minot-dos','minot-face','corpssale-dos','corpssale-face']
W_,H_=560,250
Z=Image.new('RGB',(4*W_+0,3*H_),(244,241,236))
for i,n in enumerate(noms):
    c=Image.open(f'canvas/{n}.png').crop((140,0,700,250)); Z.paste(c,((i%4)*W_,(i//4)*H_),c)
Z.save('cols_v2.png'); print('fini')
