# E-bike playbook QA report (2026-10-28)

Input: `playbook_research/ebike.json` (20 cards). Output: `verified/ebike.json` (20 cards, JSON parses, every step is 20 words or fewer).

**Counts:** 4 verified, 16 fixed, 0 weak, 0 removed.

## Sources checked
- **All URLs opened.** For the PDFs (FDNY guide, NFPA tip sheet, Bosch Intuvia manual, CPSC 2022 letter, SB County flyer, CHP bulletin), WebFetch could not read the text, so I downloaded each one and pulled the text out locally.
- **CA law text** comes from california.public.law, verified Oct 26, 2026:
  - 312.5 (updated 1/1/2025)
  - 21213 (2016)
  - 21207.5 (2023)
  - 21212
  - 21235 (2019)
  - 21201 (current as of 1/1/2026)
  - 21223
  - 21956 (2023)
  - HSC 26302
- **New source added:** the CHP Information Bulletin "Electric Bicycles and Other Devices" (May 27, 2026). It confirms 312.5, 21207.5 and 21213 as summarized. It also adds two things:
  - the e-moto definition (CVC 436.1, effective 1/1/2026; e-motos are banned on public roads)
  - impound under CVC 22651.08 when a class 3 rider is under 16
- **SB 1271** was chaptered 9/27/2024 (Ch. 791). Sales rules took effect 1/1/2026; the rental section (26303) takes effect 1/1/2028.

## Most important corrections
1. **Battery warning-signs card (safety).** The original said to set the battery on the ground, stay with it, and call 911 only if smoke appears. That conflicts with official guidance:
   - NFPA and FDNY say to stop using it, move it away from anything that burns only if that is safe, and call 911 when warning signs appear.
   - FDNY says that if a battery swells or smokes, you should leave immediately and call 911.

   I rewrote the card to match and removed the "remove the battery" step.
2. **Battery fire card (safety).** I removed "if it's not burning yet, move it away." For a smoking or hissing battery, FDNY says to leave and call 911. I also:
   - moved the indoor "close the door, get out, call 911 from outside" step near the top
   - added a toxic-smoke warning (Seattle Fire Dept source)
3. **Cutout card.** "If the motor or battery feels very hot, let it cool" treated a very hot battery as a cooldown issue. NFPA lists "too much heat" as a reason to stop using a battery. Now a hot motor means cool down, and a hot battery sends the rider to the battery cards. I also removed the "hot battery" trigger from the overheat card.
4. **Classes card (law).**
   - "Under-750-watt" is now "750 watts or less" (312.5 says "does not exceed 750 watts").
   - Added the pedals-removed exclusion.
   - Updated the e-moto warning to the 2026 CVC 436.1 rule.
   - Added the warning about impounding a class 3 bike ridden by someone under 16.
5. **Certification card (law).** The SB 1271 / HSC 26302 rule was cited as a source but never stated in the steps. It is now a step. I also:
   - added EN 15194 as a standard California accepts
   - stated precisely that secondhand sales are exempt only from the labeling requirement
6. **Cold card.** Bosch says to start off on ice *without* motor support. The card had said "with low assist."
7. **Night lights card.** I removed "ride with your phone flashlight pointed forward," because it means riding one-handed and a phone is not a mounted lamp. The card now says to walk with the phone light, and it adds the worn-lamp option from 21201(e).
8. **Walk mode card.**
   - "No walk mode at OFF" is Bosch-only, so it is now hedged.
   - The 3.7 mph figure is now worded as what 312.5(a)(4) *allows* on class 1 and 3 bikes.
   - Added the 21956 right-side exception.
9. **Stranded card.** VVTA Micro-Link runs weekdays 6 a.m. to 8 p.m. only. The page doesn't mention e-bikes, so the card now warns that it is not a late-night option.
10. **Wet card.**
    - Removed "shake" the battery.
    - Added a warning that a submerged battery must be treated as damaged, citing UL's guidance to have a dealer inspect it.
    - The USB warning now matches Bosch: connect no device while riding in rain.
11. **Confidence and wording.**
    - The error-code card dropped from official to expert, because one brand's manual is applied to all brands.
    - The charging card's "most fires start around charging" overstated CPSC and was reworded.

## Checks passed
- **No step tells anyone to open, puncture or repair a battery.** Three cards say never to.
- **No medical advice.** The 911 lines are emergency triggers only.
- **No brand names** in any "prevent" field.
- **Confidence labels.** The brake cutoff card stays "community" because its repair steps come from a retailer (Upway). Cards that mix manufacturer and retailer sources stay "expert."

## Open notes (not blocking)
- The range card's "battery % vs trip %" rule of thumb is our own heuristic, worded as rough. No source states it.
- I found no official source for battery-fire reignition that I could verify, so that claim was not added.
