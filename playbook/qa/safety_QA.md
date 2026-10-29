# Safety playbook QA (checked 2026-10-28)

Input: `playbook_research/safety.json` (21 cards). Output: `verified/safety.json` (21 cards, JSON parses, every step 20 words or fewer).

**Result:** 4 verified, 16 fixed, 1 weak, 0 removed. All source URLs fetched successfully; none were blocked.

## Phone numbers and addresses (all confirmed on official pages)
- Sheriff Desert non-emergency dispatch: (760) 956-5001. Sheriff Apple Valley station page.
- Apple Valley Patrol Station: (760) 240-7400, 14931 Dale Evans Parkway, Apple Valley CA 92307, 8:00 a.m.-5:00 p.m. Sheriff Apple Valley station page.
- Town of Apple Valley: (760) 240-7000, 14955 Dale Evans Parkway, Apple Valley CA 92307. Apple Valley Connect page and State of the Town 2026 page.
- Sheriff Records: PO Box 569, San Bernardino CA 92402; NextRequest portal. Sheriff Public Records page.
- Not used: an "after hours dispatch 245-4211" number showed up in an old Town resource sheet in search results. It is not on any current official page, so it was left out.

## Law checks (California Public Law text)
- VC 21760: 3 ft, lane change, slow-and-pass, $35 / $220. Matches. Wording now says "base fine" and that $220 applies when a crash injures the rider.
- VC 21201: 300/500/200 ft, worn lamp (e), e-bike all hours (f). Matches. Added "front and rear" for pedal reflectors.
- VC 21202: Added the missing right-turn exception. Added the VC 21656 duty (5+ vehicles behind on a two-lane road: pull off where safe), since 21202's narrow-lane exception is expressly "subject to 21656".
- VC 21206: Local regulation of sidewalk riding is confirmed. **Apple Valley's own ordinance was not found**, so that card is weak.
- VC 21956: The left-edge rule applies only outside business/residence districts, and the step now says so.
- VC 20001 / 20003: Match current text.

## Most important corrections
1. **Crash card:** "If unhurt, get out of traffic first" conflicted with "call 911 first". It now follows the DMV order: if no one is hurt, move out of traffic, then call 911.
2. **Road rage card:** Removed "avoid eye contact", which no cited source supports.
3. **Records card:** "Response within 10 days" was wrong. 10 days is the deadline to decide on release, and it can be extended.
4. **Walk-home card:** The QUT source only covers cyclists, so the pedestrian claim was replaced with OTS guidance. Dropped "earbuds" (OTS only says phone).
5. **Wind card:** NWS gives no specific action for a Dust Storm Warning. "Get off the road" was replaced with NWS shelter guidance.
6. **Heat card:** Added NWS heat-stroke signs so users know when to call 911. No treatment advice.
7. **Apple Valley Connect card:** Removed "take a photo" and "free" (the Town pages don't state either).

## Weak
- `law-sidewalk-riding-local`: Apple Valley's sidewalk-riding ordinance was not found online. The card already warns users not to assume it is allowed. To fix it, get the Town code section (Title 10) or ask the Town at (760) 240-7000.

## Notes
- Alexandria (Indiana) PD is out-of-state, but it is a government page that agrees with the CHP advice. Kept as a supporting source.
- Two goathead tips ("move off the road before fixing a flat" and "carry a spare tube") are general safety sense, not from UC IPM. Flagged in the qa note.
- Confidence labels are unchanged; all were judged honest.
