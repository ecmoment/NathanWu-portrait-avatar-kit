import zlib, struct, sys
def read_png(path):
    data=open(path,'rb').read(); pos=8; w=h=bd=ct=None; idat=b''
    while pos < len(data):
        ln=struct.unpack('>I', data[pos:pos+4])[0]; typ=data[pos+4:pos+8]
        chunk=data[pos+8:pos+8+ln]; pos+=12+ln
        if typ==b'IHDR': w,h,bd,ct=struct.unpack('>IIBB', chunk[:10])
        elif typ==b'IDAT': idat+=chunk
        elif typ==b'IEND': break
    raw=zlib.decompress(idat); ch={0:1,2:3,3:1,4:2,6:4}[ct]; bpp=ch*(bd//8); stride=w*bpp
    out=bytearray(); prev=bytearray(stride); i=0
    for y in range(h):
        f=raw[i]; i+=1; line=bytearray(raw[i:i+stride]); i+=stride
        if f==1:
            for x in range(bpp,stride): line[x]=(line[x]+line[x-bpp])&255
        elif f==2:
            for x in range(stride): line[x]=(line[x]+prev[x])&255
        elif f==3:
            for x in range(stride):
                a=line[x-bpp] if x>=bpp else 0
                line[x]=(line[x]+((a+prev[x])>>1))&255
        elif f==4:
            for x in range(stride):
                a=line[x-bpp] if x>=bpp else 0; b=prev[x]; c=prev[x-bpp] if x>=bpp else 0
                pp=a+b-c; pa=abs(pp-a); pb=abs(pp-b); pc=abs(pp-c)
                pr=a if (pa<=pb and pa<=pc) else (b if pb<=pc else c)
                line[x]=(line[x]+pr)&255
        out+=line; prev=line
    return w,h,ch,bytes(out)

def stats(path, label=None):
    w,h,ch,px=read_png(path)
    n=0; s=0; sq=0; darks=0; p5=[]; p95=[]
    step=max(1,(w*h)//60000)
    vals=[]
    for idx in range(0,w*h,step):
        o=idx*ch; r,g,b=px[o],px[o+1],px[o+2]
        lum=0.299*r+0.587*g+0.114*b
        vals.append(lum); s+=lum; sq+=lum*lum; n+=1
        if lum<70: darks+=1
    vals.sort()
    mean=s/n; std=(sq/n-mean*mean)**0.5
    p05=vals[int(len(vals)*0.05)]; p95=vals[int(len(vals)*0.95)]
    print(f"{(label or path).split('/')[-1]:16s} {w}x{h}  亮度={mean:6.1f}  对比std={std:5.1f}  动态范围={p95-p05:5.1f}  暗部<70={darks/n*100:5.1f}%  P5={p05:5.1f} P95={p95:5.1f}")

for f in sys.argv[1:]: stats(f)
