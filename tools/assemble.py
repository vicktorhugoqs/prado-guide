import json, os, sys, wave, subprocess
d, outdir = sys.argv[1], sys.argv[2]
plan = json.load(open(os.path.join(d, "plan.json")))
RATE = 24000
def sil(sec):
    f = os.path.join(d, f"sil_{int(sec*1000)}.wav")
    if not os.path.exists(f):
        with wave.open(f, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(b"\0\0" * int(RATE*sec))
    return f
def dur(f):
    with wave.open(f) as w:
        assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2, f
        return w.getnframes() / RATE
seq, chaps, t = [], [], 0.0
seq.append(sil(0.5)); t += 0.5
for title, clips in plan:
    start = t
    for i, c in enumerate(clips):
        f = os.path.join(d, c + ".wav")
        seq.append(f); t += dur(f)
        gap = 0.9 if i == 0 else 0.6
        if i == len(clips) - 1: gap = 1.6
        seq.append(sil(gap)); t += gap
    chaps.append((title, start, t))
lst = os.path.join(d, "concat.txt")
open(lst, "w").write("".join(f"file '{f}'\n" for f in seq))
meta = [";FFMETADATA1", "title=Before the Prado: a spoken introduction", "artist=Prado Museum Guide (independent)",
        "album=Prado Museum Guide", "date=2026", "genre=Speech",
        "comment=https://vicktorhugoqs.github.io/prado-guide/listen/"]
for title, a, b in chaps:
    meta += ["[CHAPTER]", "TIMEBASE=1/1000", f"START={int(a*1000)}", f"END={int(b*1000)}", f"title={title}"]
open(os.path.join(d, "meta.txt"), "w").write("\n".join(meta) + "\n")
json.dump([[ti, round(a, 1)] for ti, a, b in chaps], open(os.path.join(outdir, "chapters.json"), "w"), ensure_ascii=False, indent=1)
for ti, a, b in chaps: print(f"{int(a//60):2d}:{int(a%60):02d}  {ti}")
print("total", f"{int(t//60)}:{int(t%60):02d}")
