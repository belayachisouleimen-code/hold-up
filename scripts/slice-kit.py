import numpy as np, cv2, os, json, sys
from PIL import Image
from scipy import ndimage as nd
src=np.array(Image.open(sys.argv[1] if len(sys.argv)>1 else 'sheet.png').convert('RGB'))
OUT=sys.argv[2] if len(sys.argv)>2 else '/home/claude/holdup/online/assets'; os.makedirs(OUT,exist_ok=True)
def white(a,t=40): return (255*3-a.astype(int).sum(2))<t
def cut(name,box,inpaint=None,pad=2,flood=True):
    x0,y0,x1,y1=box; a=src[y0:y1,x0:x1].copy()
    if inpaint is not None:
        ix0,iy0,ix1,iy1=inpaint; sub=a[iy0-y0:iy1-y0, ix0-x0:ix1-x0]
        lum=sub.astype(int).sum(2)/3; m=(lum<150).astype(np.uint8)*255
        m=cv2.dilate(m,np.ones((5,5),np.uint8),iterations=2)
        sub[:]=cv2.inpaint(sub,m,7,cv2.INPAINT_TELEA)
    if flood:
        w=white(a); lab,_=nd.label(w)
        edge=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
        bg=np.isin(lab,list(edge))
    else: bg=np.zeros(a.shape[:2],bool)
    alpha=np.where(bg,0,255).astype(np.uint8)
    ring=nd.binary_dilation(bg,iterations=1)&~bg
    dark=(255*3-a.astype(int).sum(2))/3
    alpha[ring]=np.clip(dark[ring]*4,0,255).astype(np.uint8)
    ys,xs=np.where(alpha>0); a2=np.dstack([a,alpha])[max(ys.min()-pad,0):ys.max()+pad+1, max(xs.min()-pad,0):xs.max()+pad+1]
    im=Image.fromarray(a2,'RGBA'); im.save(f'{OUT}/{name}.webp',quality=88,method=6); return im.size
B={
 'logo':(2,6,378,320),
 'cat-general':(380,10,514,203),'cat-histoire':(515,10,647,203),'cat-sciences':(649,10,784,203),'cat-culture-pop':(785,10,917,203),
 'cat-sport':(918,10,1048,203),'cat-arts':(1050,9,1182,203),'cat-nature':(1183,10,1310,203),'cat-insolite':(1310,10,1441,203),
 'chip-1':(375,216,470,314),'chip-5':(470,216,565,314),'chip-10':(565,215,658,316),'chip-20':(658,215,754,316),'chip-50':(754,216,848,316),'chip-100':(848,215,947,315),'chip-500':(947,215,1045,315),
 'coins':(1056,211,1151,317),'coin-crown':(1169,223,1256,312),'coin-star':(1261,225,1345,313),'coin-spade':(1350,225,1434,313),'bulb':(1442,208,1512,316),
 'btn-miser':(16,332,241,444),'btn-suivre':(240,332,451,444),'btn-relancer':(451,332,663,444),
 'btn-coucher':(16,443,241,546),'btn-valider':(241,443,451,545),'btn-passer':(451,443,663,545),
 'chip-x2':(666,330,755,421),'chip-x5':(755,330,847,421),'chip-x10':(847,330,945,422),'btn-allin':(668,431,784,540),
 'ico-info':(811,419,875,481),'ico-people':(811,481,875,543),'ico-settings':(885,420,947,481),'ico-chat':(885,481,947,543),
 'card-question':(958,324,1310,556),'card-mystere':(1316,324,1529,557),
 'avatar-1':(14,555,128,683),'avatar-2':(126,556,231,683),'avatar-3':(231,556,329,683),'avatar-4':(329,556,424,683),'avatar-5':(424,556,516,683),'avatar-6':(516,556,608,683),'btn-plus':(607,560,665,683),
 'rank-bronze':(671,557,736,647),'rank-argent':(734,557,801,647),'rank-or':(799,557,868,647),'rank-platine':(865,557,932,647),'rank-diamant':(931,557,998,647),'rank-legende':(996,557,1067,647),
 'bar-sablier':(1097,553,1317,621),'bar-chrono':(1328,560,1522,614),'btn-quitter':(1394,619,1522,686),
 'card-bonne':(13,684,286,991),'card-mauvaise':(293,685,566,991),
 'classement-head':(866,684,1167,756),'club-banner':(1172,685,1522,868),
}
sizes={}
for k,b in B.items():
    sizes[k]=cut(k,b,inpaint=(1020,390,1265,485) if k=='card-question' else None)
# bouton « Inviter des amis » posé sur le panneau bleu : découpe rectangulaire sans détourage
sizes['btn-inviter']=cut('btn-inviter',(1188,904,1430,964),flood=False)
json.dump(sizes,open(OUT+'/sizes.json','w'),indent=0)
print(len(sizes))
