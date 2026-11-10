import asyncio, json, edge_tts, subprocess
V="pt-BR-FranciscaNeural"
async def um(c):
    com=edge_tts.Communicate(c["fala"],V,rate="+0%",boundary="WordBoundary")
    pal=[]; aud=bytearray()
    async for ch in com.stream():
        if ch["type"]=="audio": aud+=ch["data"]
        elif ch["type"]=="WordBoundary": pal.append([ch["offset"]/1e7,(ch["offset"]+ch["duration"])/1e7,ch["text"]])
    open(f'{c["id"]}.mp3',"wb").write(aud); c["palavras"]=pal
    c["dur"]=float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f'{c["id"]}.mp3'],capture_output=True,text=True).stdout)
async def main():
    cs=json.load(open("cenas.json"))
    for c in cs: await um(c)
    json.dump(cs,open("cenas.t.json","w"),ensure_ascii=False,indent=1)
    for c in cs: print(c["id"],round(c["dur"],1),len(c["palavras"]))
asyncio.run(main())
