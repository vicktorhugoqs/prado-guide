# Prado Museum — Permanent Collection Field Guide

A static, offline-capable visit guide to the permanent collection of the [Museo Nacional del Prado](https://www.museodelprado.es/en) in Madrid. A sibling of the [Gulbenkian guide](https://github.com/vicktorhugoqs/gulbenkian-guide), built the same way.

**Live:** https://vicktorhugoqs.github.io/prado-guide/ (GitHub Pages, from this repository's root).

## What it is

- 54 masterpieces in walking order, grouped into 13 stops — from Van der Weyden and Bosch on Floor 0, through Titian, El Greco, Velázquez, Rubens and the court Goya on Floor 1 and the top floor, back down to Goya's war paintings and Black Paintings. Each stop has a short essay; each work a text and a "Look for" note.
- A floor and room number on every card and section, and a route table at the top. Rooms were checked against the Prado's online catalogue in November 2026; the museum rehangs, so its own plan wins.
- Tap ✓ on a card to mark it seen — progress persists in `localStorage`. "Next unseen" jumps down the route.
- Light and dark themes (follows the system; toggle in the footer).
- Every work is in the served HTML, so the guide reads with JavaScript off. JavaScript only runs the checklist, the theme toggle and the offline download.
- A service worker caches the page shell on first load; the 54 images (~5 MB) follow in the background, and the footer says "Ready to use offline" once they are stored.
- A [spoken introduction](listen/) for before the visit: half an hour of context in British English (`lang="en-GB"`), written for browser read-aloud — no abbreviations, regnal numbers spelled out.
- A [2-hour route](highlights-2-hours/) with a one-hour express list, and a [visitor FAQ](faq/) with FAQPage structured data.
- No framework, no dependencies — one `node build.js` and plain files.

## Structure

```
index.html            the page: hand-written shell, generated chips, route table and cards
data.js               all content: sections, works, texts, rooms — edit this
build.js              renders data.js into the pages, sw.js and sitemap.xml
img/                  54 images, max 768×1000 px (sources in IMAGES.md)
highlights-2-hours/   the timed route (hand-written; ticket line generated)
faq/                  the FAQ (hand-written; ticket answer generated in HTML and JSON-LD)
listen/               the spoken pre-visit introduction (hand-written)
sw.js                 service worker: shell precache + background image download
```

## Regenerating

```bash
node build.js                 # writes index.html, the subpages' ticket lines, sw.js, sitemap.xml
node build.js --check         # exits 1 if anything is out of date
node build.js --report-links  # checks every #w- anchor in the subpages resolves
```

`build.js` only rewrites the regions between `BEGIN GENERATED` / `END GENERATED` markers. It validates `data.js` on every run (ids, sections, alt-text length, images present), reads each JPEG's real size so cards carry `width`/`height`, and derives the service-worker cache name from the content of every cached file.

## Sources & credit

Room numbers, dates and inventory numbers from the Prado's online catalogue (each card links to its official page). Texts written for this guide. Images are faithful reproductions of public-domain paintings from Wikimedia Commons, listed in [IMAGES.md](IMAGES.md).

## License

- **Code**: [MIT](LICENSE).
- **Original guide texts**: CC BY 4.0.
- **Images**: public domain (see the scope note in [LICENSE](LICENSE)).

Free, non-profit, independent; not affiliated with or endorsed by the Museo Nacional del Prado. Corrections welcome as [issues](https://github.com/vicktorhugoqs/prado-guide/issues).

## Search engines

`indexnow-ping.sh` notifies IndexNow engines (Bing, DuckDuckGo, …) of the three page URLs; run it after deploying content changes. The hex `*.txt` file at root is the IndexNow key and must stay deployed.
