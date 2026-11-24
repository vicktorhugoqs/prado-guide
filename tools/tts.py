import base64, html, json, os, re, sys, urllib.request, concurrent.futures as cf
src, out, voice = sys.argv[1], sys.argv[2], sys.argv[3]
tok = os.environ["GTOKEN"]  # gcloud auth application-default print-access-token
PROJECT = os.environ["GCP_PROJECT"]  # project with the Text-to-Speech API enabled
s = open(src).read()
a = s[s.index('<article>'):s.index('</article>')]
a = re.sub(r'<p class="howto">.*?</p>', '', a, flags=re.S)
clean = lambda t: re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', t))).strip()
chapters = []  # [title, heading_text, [paras]]
title = clean(re.search(r'<h1>(.*?)</h1>', a, re.S).group(1))
chapters.append(["Introduction", title + ".", []])
for m in re.finditer(r'<h2>(.*?)</h2>|<p>(.*?)</p>', a, re.S):
    if m.group(1): 
        h = clean(m.group(1)); chapters.append([h, h + ".", []])
    else:
        chapters[-1][2].append(clean(m.group(2)))
jobs = []
for ci, (t, h, ps) in enumerate(chapters):
    jobs.append((f"{ci:02d}_h", h))
    for pi, p in enumerate(ps): jobs.append((f"{ci:02d}_p{pi:02d}", p))
def synth(job):
    name, text = job
    f = os.path.join(out, name + ".wav")
    if os.path.exists(f): return name
    assert len(text.encode()) < 4800, name
    body = json.dumps({"input": {"text": text}, "voice": {"languageCode": "en-GB", "name": voice},
                       "audioConfig": {"audioEncoding": "LINEAR16", "sampleRateHertz": 24000}}).encode()
    req = urllib.request.Request("https://texttospeech.googleapis.com/v1/text:synthesize", data=body,
        headers={"Authorization": "Bearer " + tok, "x-goog-user-project": PROJECT, "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            d = json.load(urllib.request.urlopen(req, timeout=120)); break
        except Exception as e:
            err = e; 
            import time; time.sleep(3 * (attempt + 1))
    else: raise err
    open(f, "wb").write(base64.b64decode(d["audioContent"]))
    return name
with cf.ThreadPoolExecutor(4) as ex:
    for n in ex.map(synth, jobs): pass
json.dump([[t, [j for j, _ in jobs if j.startswith(f"{ci:02d}_")]] for ci, (t, h, ps) in enumerate(chapters)],
          open(os.path.join(out, "plan.json"), "w"), indent=1)
print(len(jobs), "clips;", sum(len(x[1]) for x in jobs), "chars;", len(chapters), "chapters")
