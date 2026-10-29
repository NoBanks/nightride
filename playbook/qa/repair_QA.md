# Repair playbook QA: 2026-10-28

Input: `playbook_research/repair.json` (23 cards). Output: `verified/repair.json` (23 cards, each with a `qa` field). The JSON parses, and every step is 20 words or fewer (checked with a script).

**Result: 11 verified, 12 fixed, 0 weak, 0 removed.**

## How it was checked
- I fetched every cited URL. Two PDFs came back as raw binary through WebFetch: the Park TPT-1 plug instructions and the League ABC Quick Check. I extracted their text locally with pdftotext and checked them line by line.
- I checked each step, warning and prevent tip against its sources, and also read each card for safety problems from bike-mechanic knowledge.
- No "prevent" tip uses a brand name. There is no medical advice. Triggers are plain rider phrases. The confidence labels hold up.

## Critical corrections (these would have caused failures)
1. **Chain snapped**: the card said to keep "one narrow end and one wide end" for a quick link. That is wrong. A quick link is a pair of outer plates, so it joins **two narrow (inner) ends**. The narrow-to-wide rule only applies when re-pressing a pin. Fixed using Park's On the Ride Chain Repair and Chain Length Sizing pages.
2. **One-speed conversion**: "Too loose? Try the next smaller rear cog" was backwards, because a smaller cog makes the chain looser. It now says to move to the next **bigger** cog or remove one more link pair. The quick-link rule is fixed here too. I added a full-suspension warning: chain length changes as the suspension compresses, so leave slack (Park chain sizing).
3. **Loose seat**: the card had no minimum-insertion warning. It now says never to raise the post until its min-insert mark shows (Park's saddle/seatpost page). A post raised past the mark can snap or crack the frame.

## Other fixes
- **Rear flat**: added the step to switch off a clutch derailleur, a warning not to stand the bike upright with the rear wheel out, and a low-pressure check that the tire bead sits evenly before full pressure, with deflate-if-bulging (all from Park).
- **Front flat**: added "loosen the QR nut a few turns", because most forks have tabs that stop the wheel dropping out. Added the same bead check.
- **Tubeless plug**: the "hold" step now matches Park's instructions, which say to hold the tool's retainer.
- **Sidewall boot**: Sheldon Brown says Mylar food wrappers, not foil, so the step now says "energy bar wrapper". Removed "peel" because not every boot is adhesive.
- **Chain dropped**: made the rear-cog step clearer. Added two Sheldon Brown warnings: if the chain is jammed in the spokes, turn the wheel backward gently, and a right-side fall can bend the hanger.
- **Chain snapped**: added a warning that many 9-speed and higher chains won't hold a re-pressed pin (Sheldon).
- **Disc rub**: added Park's warning to keep fingers clear of the spinning rotor.
- **Crank/pedal**: added "stop riding right away" (Park). Changed "the crank bolt" to "the bolt or bolts holding that arm", because many cranks use side pinch bolts.
- **Broken spoke**: open the rim brake release only enough to clear the rim, then check the brake still stops the wheel.
- **Hub motor wheel**: added "guide the rotor between the pads" (Magnum), a warning to snip the zip tie away from the wire, and a separate torque warning. The derailleur wording is now neutral.

## Notes and gaps (not errors)
- **CO2 card**: "CO2 leaks faster than air" comes from road.cc reader comments, not the article body. It is still true (CO2 passes through rubber faster), so I kept it.
- **Night kit**: "practice at home" is common-sense advice, not from a source. The kit doesn't list a **spare light**, and none of the cited sources mention one, so I didn't add it. I recommend a lighting/visibility card sourced from a government or road-safety body.
- **Park TPT-1 PDF**: this is a distributor-hosted copy (grofa.com). The content is genuine Park text, but the link could break. Park's product page links its own copy.
