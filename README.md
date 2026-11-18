# Off Book

A seated rehearsal room for Meta Quest that runs in the headset browser. Hands only, no microphone, no account, no server.

## Run it
It is a static site with no build step. Serve this folder over HTTPS (WebXR needs a secure origin; `localhost` also counts).

    python3 -m http.server 8766        # then open http://localhost:8766/

Without a headset the same page opens a keyboard, mouse or touch preview.

## Check it
    node --test test/logic.test.mjs   # the rules (41 tests, no browser)
    ./shot.sh walk "index.html?auto=walk"   # the real app in headless Chrome: 35 checks from entry to Leave

## Tune it on the device (no code change)
Add to the address, for example `?down=-15&hold=0.3`:

| name | default | meaning |
|---|---|---|
| up | -9 | head pitch (degrees from straight ahead) above which the head is "up" |
| down | -13 | pitch below which, after `nod` seconds, the head is "down" |
| nod | 0.3 | seconds a dip must last before it is a look down |
| look | 1.5 | a look down still going on at the pinch, begun this recently, belongs to the next line |
| debounce | 0.4 | a second "next" inside this time is ignored |
| hold | 0.35 | other hand: shorter is "back", longer shows the line |
| pause | 0.4 | both hands held this long opens the pause menu |
| word | 0.3 | head-up seconds needed per word before a line counts |
| zin / zout | 11 / 8.5 | yaw to enter / leave a side zone |
| fade | (setting) | `fade=0` keeps the words lit while the head is up |
| preview | | `preview=1` forces the no-headset preview |

## Files
- `index.html`, `js/page.js`: entry page (script, key words, settings, link)
- `js/logic.js`: every rule, no browser APIs
- `js/world.js`: the room (three.js r170, unlit, canvas textures)
- `js/main.js`: states, input (hands, keys, touch), XR session
- `js/draw/`: canvas drawings (monitor, clock, notes sheet, question card, textures) and synthesized sound
- `textures/`: audience sprites. These were made with an image-generation model, then cut and flattened in code.
