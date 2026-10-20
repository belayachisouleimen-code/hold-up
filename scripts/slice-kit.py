import numpy as np, cv2, os, json
from PIL import Image
from scipy import ndimage as nd
src=np.array(Image.open(__import__('sys').argv[1] if len(__import__('sys').argv)>1 else 'sheet.png').convert('RGB'))
OUT='/home/claude/holdup/online/assets'; os.makedirs(OUT,exist_ok=True)
def white(a,t=40): return (255*3-a.astype(int).sum(2))<t
def cut(name,box,inpaint=None,pad=2):
    x0,y0,x1,y1=box; a=src[y0:y1,x0:x1].copy()
    if inpaint is not None:
        ix0,iy0,ix1,iy1=inpaint; sub=a[iy0-y0:iy1-y0, ix0-x0:ix1-x0]
        lum=sub.astype(int).sum(2)/3; m=(lum<150).astype(np.uint8)*255
        m=cv2.dilate(m,np.ones((5,5),np.uint8),iterations=2)
        sub[:]=cv2.inpaint(sub,m,7,cv2.INPAINT_TELEA)
    w=white(a)
    lab,_=nd.label(w)
    edge=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
    bg=np.isin(lab,list(edge))
    alpha=np.where(bg,0,255).astype(np.uint8)
    ring=nd.binary_dilation(bg,iterations=1)&~bg
    dark=(255*3-a.astype(int).sum(2))/3
    alpha[ring]=np.clip(dark[ring]*4,0,255).astype(np.uint8)
    ys,xs=np.where(alpha>0); a2=np.dstack([a,alpha])[max(ys.min()-pad,0):ys.max()+pad+1, max(xs.min()-pad,0):xs.max()+pad+1]
    im=Image.fromarray(a2,'RGBA'); im.save(f'{OUT}/{name}.webp',quality=88,method=6); return im.size
B={
 'logo':(0,6,412,346),
 'cat-general':(418,12,540,202),'cat-histoire':(543,12,664,202),'cat-sciences':(667,12,789,202),'cat-culture-pop':(792,12,916,202),
 'cat-sport':(919,12,1041,202),'cat-arts':(1044,12,1166,202),'cat-nature':(1169,12,1288,202),'cat-insolite':(1291,12,1410,202),'cat-mystere':(1412,12,1532,202),
 'chip-1':(422,223,531,339),'chip-5':(531,223,640,339),'chip-10':(640,224,748,339),'chip-20':(748,224,856,339),'chip-50':(856,221,967,341),'chip-100':(967,221,1080,341),
 'coins':(1098,221,1187,326),'coin-crown':(1194,232,1275,318),'coin-star':(1275,232,1354,318),'coin-spade':(1354,232,1435,319),'bulb':(1435,230,1508,325),
 'btn-suivre':(414,354,596,510),'btn-miser':(602,354,784,510),'btn-relancer':(790,354,973,510),'btn-coucher':(981,354,1165,510),
 'btn-valider':(1181,341,1435,443),'btn-passer':(1181,443,1435,549),
 'chip-x2':(418,528,534,631),'chip-x5':(539,527,655,631),'chip-x10':(659,527,776,631),'btn-allin':(782,524,908,628),
 'bar-sablier':(934,551,1151,622),'bar-chrono':(1168,559,1412,616),
 'ico-info':(1449,333,1525,412),'ico-settings':(1449,411,1525,489),'ico-people':(1449,487,1525,564),'ico-chat':(1449,562,1525,640),
 'mascots':(0,337,412,655),
 'card-question':(16,653,284,1008),'card-tour':(300,653,563,1008),'card-bonne':(572,647,841,1010),'card-mauvaise':(847,647,1116,1010),
 'panel-teams':(1128,651,1526,1001),
}
sizes={}
for k,b in B.items():
    sizes[k]=cut(k,b,inpaint=(60,725,240,840) if k=='card-question' else None)
json.dump(sizes,open(OUT+'/sizes.json','w'),indent=0)
print(sizes)
