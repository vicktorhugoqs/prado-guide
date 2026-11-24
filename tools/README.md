# Audio build

Regenerates `listen/before-the-prado.{m4a,mp3}` from the text of `listen/index.html` with Google Cloud Text-to-Speech (voice `en-GB-Chirp3-HD-Charon`).

```bash
mkdir -p /tmp/tts
GTOKEN=$(gcloud auth application-default print-access-token) GCP_PROJECT=<your-project> \
  python3 tools/tts.py listen/index.html /tmp/tts en-GB-Chirp3-HD-Charon   # one WAV per heading/paragraph
python3 tools/assemble.py /tmp/tts /tmp/tts                                # pauses, chapter times, concat list, ffmpeg metadata
cd /tmp/tts && ffmpeg -f concat -safe 0 -i concat.txt -c copy all.wav
ffmpeg -i all.wav -i meta.txt -i ../path/to/icon-512.png -map 0:a -map 2:v -map_metadata 1 -map_chapters 1 \
  -c:a aac -b:a 64k -ac 1 -c:v png -disposition:v attached_pic -movflags +faststart before-the-prado.m4a
ffmpeg -i all.wav -i meta.txt -i ../path/to/icon-512.png -map 0:a -map 2:v -map_metadata 1 -map_chapters 1 \
  -c:a libmp3lame -b:a 64k -ac 1 -c:v mjpeg -disposition:v attached_pic -id3v2_version 3 before-the-prado.mp3
```

`assemble.py` also writes `chapters.json` (title, start in seconds), which is what the chapter buttons on the listen page use. Clips are cached by name, so a rerun only synthesises what is missing — delete the folder after editing the text.
