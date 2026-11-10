import asyncio, json, edge_tts, subprocess
V={"ana":("pt-BR-FranciscaNeural","+0%","+0Hz"),"ze":("pt-BR-AntonioNeural","-6%","-5Hz")}
async def falar(q,txt,dest):
    v,r,p=V[q]; pal=[]; aud=bytearray()
    for tent in range(4):
        try:
            async for ch in edge_tts.Communicate(txt,v,rate=r,pitch=p,boundary="WordBoundary").stream():
                if ch["type"]=="audio": aud+=ch["data"]
                elif ch["type"]=="WordBoundary": pal.append([ch["offset"]/1e7,(ch["offset"]+ch["duration"])/1e7,ch["text"]])
            break
        except Exception as e: print("tenta de novo",e); aud=bytearray(); pal=[]; await asyncio.sleep(3)
    open(dest,"wb").write(aud); return pal
async def main():
    d=json.load(open("dialogo.json")); k=0
    for c in d:
        for f in c["falas"]:
            dest=f"f{k:02d}.mp3"; f.append(await falar(f[0],f[1],dest)); f.append(dest); k+=1
    json.dump(d,open("dialogo.t.json","w"),ensure_ascii=False)
asyncio.run(main())
