# RestoStaff Code Review v187

## Summary

v187 simplifies the brand/access page CSS after layout review. It keeps the fixed topbar, removes the fixed/overlapping sponsor bar, and returns the page to a normal flow: topbar, main card, sponsor footer.

## Changes reviewed

- Replaced the fixed-position main shell with a normal centered page shell.
- Changed the sponsor marquee from fixed bottom overlay to a normal footer below the main card.
- Simplified the module board to show all 9 modules in a 3x3 grid.
- Made the module grid fill the left panel instead of floating within unused space.
- Kept existing login fields and prototype access logic intact.

## Risk level

Low to medium. Mostly CSS/layout plus one small module-preview rendering change. Operational modules are unchanged.

## Recommended manual checks

- Fixed topbar remains visible.
- Main card sits below the topbar and does not overlap the sponsor strip.
- All 9 module cards fill the left panel evenly.
- Login form is usable and visually balanced.
- Sponsor strip appears below the main card as a footer.
- Restaurant dropdown and username/PIN flow still work.
