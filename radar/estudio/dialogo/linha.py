import json, subprocess, numpy as np
SR=44100; FPS=30
def ff(*a): subprocess.run(["ffmpeg","-loglevel","error","-y",*a],check=True)
def pcm(p): return np.frombuffer(subprocess.run(["ffmpeg","-loglevel","error","-i",p,"-ac","1","-ar",str(SR),"-f","f32le","-"],capture_output=True,check=True).stdout,np.float32)
d=json.load(open("dialogo.t.json"))
t=0.8; voz=[np.zeros(int(t*SR),np.float32)]; cenas=[]; falas=[]
for ci,c in enumerate(d):
    ini=t-0.25 if ci else 0.0
    for j,(q,txt,pal,arq) in enumerate(c["falas"]):
        a=pcm(arq); dur=len(a)/SR
        falas.append({"quem":q,"txt":txt,"a":round(t,3),"b":round(t+dur,3),"pal":[[w[0]+t,w[1]+t,w[2]] for w in pal],"cena":c["cena"]})
        voz.append(a); t+=dur
        gap=0.32 if j<len(c["falas"])-1 else 0.6
        voz.append(np.zeros(int(gap*SR),np.float32)); t+=gap
    cenas.append({"id":c["cena"],"cap":c["cap"],"a":round(ini,3),"b":round(t-0.25,3)})
cenas[-1]["b"]=t+1.6; dur=t+1.6
v=np.concatenate(voz); v=np.concatenate([v,np.zeros(int(dur*SR)-len(v),np.float32)])
# envelope por quadro, separado por personagem (boca)
n=int(dur*FPS); env={"ana":np.zeros(n),"ze":np.zeros(n)}
w=SR//FPS
for f in falas:
    for i in range(int(f["a"]*FPS),min(n,int(f["b"]*FPS)+1)):
        s=v[i*w:(i+1)*w]; env[f["quem"]][i]=np.sqrt(np.mean(s**2)) if len(s) else 0
for k in env: env[k]=np.clip(env[k]/(np.percentile(env[k][env[k]>0],90)+1e-6),0,1.3)
v.tofile("voz.f32")
json.dump({"fps":FPS,"dur":dur,"cenas":cenas,"falas":falas,"env":{k:[round(float(x),3) for x in e] for k,e in env.items()}},open("dados.json","w"),ensure_ascii=False)
# trilha: acordes suaves (C - G - Am - F), gerados aqui
acordes=[(261.6,329.6,392.0),(196.0,246.9,293.7),(220.0,261.6,329.6),(174.6,220.0,261.6)]
tt=np.arange(int(dur*SR))/SR; m=np.zeros_like(tt)
for i in range(int(dur/4)+1):
    seg=(tt>=i*4)&(tt<i*4+4.5); env4=np.clip((tt-i*4)/0.8,0,1)*np.clip((i*4+4.5-tt)/0.8,0,1)
    for fr in acordes[i%4]: m+=seg*env4*(np.sin(2*np.pi*fr*tt)+0.3*np.sin(2*np.pi*fr*2*tt))
m=(m/np.abs(m).max()*0.5).astype(np.float32); m.tofile("trilha.f32")
rio=[c for c in cenas if c["id"] in("chegada","esquema","medicao")]
expr="+".join(f"between(t,{c['a']},{c['b']})" for c in rio)
ff("-f","f32le","-ar",str(SR),"-ac","1","-i","voz.f32","-f","f32le","-ar",str(SR),"-ac","1","-i","trilha.f32",
   "-f","lavfi","-i",f"anoisesrc=color=brown:amplitude=0.5:d={dur}:r={SR}",
   "-filter_complex",f"[0]loudnorm=I=-16:TP=-1.5,asplit[v1][vsc];[1]lowpass=f=1800,volume=0.045,afade=t=in:d=1.5,afade=t=out:st={dur-2}:d=2[m];"
   f"[2]lowpass=f=800,volume='0.08*({expr})':eval=frame[r];[m][vsc]sidechaincompress=threshold=0.05:ratio=4:release=400[md];"
   "[md][r]amix=inputs=2:normalize=0[bg];[v1][bg]amix=inputs=2:normalize=0,alimiter=limit=0.95",
   "-ac","1","-ar",str(SR),"-b:a","128k","audio.mp3")
print(round(dur,1),[(c["id"],c["a"],c["b"]) for c in cenas])
