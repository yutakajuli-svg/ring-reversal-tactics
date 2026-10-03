# Groggy standing sprite sheets

Created 2026-10-03 using the built-in image_gen tool (imagegen skill). Prepared for visual review; no game rule, normal sprite or renderer change in this asset-only step.

Assets: public/assets/wrestler-red-groggy-sprites.png and public/assets/wrestler-blue-groggy-sprites.png.

Both use a transparent 2x2 layout matching the normal rounded sheets: top-left right/front, top-right right/back, bottom-left left/back, bottom-right left/front. Standing, feet planted, knees slightly bent, head and shoulders lowered, arms down; no prone pose, stars or effects. Existing four standing sheets and FIX transforms remain unchanged. Renderer alignment should be checked when wiring in the groggy state; these are prepared assets, not yet published in the playable version.

## Final red prompt

Use case: identity-preserve. Asset type: transparent 2x2 sprite sheet for the existing RING REVERSAL wrestling game. The input image is the exact character identity, art style, camera angles, sheet layout and scale reference. Create the GROGGY standing state of this SAME ADULT female wrestler in red. Exactly four full-body views in the SAME quadrant arrangement and three-quarter viewing directions as the reference: top-left facing screen-right/front; top-right screen-right/back; bottom-left screen-left/back; bottom-right screen-left/front. Keep the short brown bob, sturdy muscular rounded chibi adult proportions, red singlet with white V neckline and side stripes, red wrist cuffs, black lace-up boots, soft shaded illustrated 3D finish. Change the posture to dazed but STANDING: both boots planted and feet apart, knees slightly bent, upper body slumped a little forward, head lowered, shoulders dropped, both arms hanging loosely down. Front visible face tired half-closed eyes, no smile. The groggy posture must clearly differ from raised-fist ready stance and from lying down. Preserve each view's boot baseline and character scale, equal clean quadrant cells, keep full hair and both boots within each quadrant and adequate transparent margins. Do not draw a floor, cast shadow, ring, effects, stars, text, grid or background. Genuine RGBA transparent background. No sitting, kneeling or lying, no injuries. Match reference canvas aspect ratio and ideally 1222x1287 dimensions. Do not repeat a view.

## Final blue prompt

Use case: precise-object-edit. Asset type: transparent groggy-state game sprite sheet. Image 1 is the EDIT TARGET, the approved newly generated RED groggy 2x2 sheet. Image 2 is a supporting COLOR reference, the existing BLUE game character. Make the BLUE version of Image 1. Change ONLY red singlet fabric and red wrist cuffs to the vivid royal blue in Image 2. Keep Image 1 exact four groggy poses and three-quarter angles, slumped head and arms, tired face, adult female character identity, brown bob hair, skin, white trim, black boots, illustration shading, scale, canvas size, margins, 2x2 arrangement, boot baselines and every transparent area. Do not restore the raised fists in Image 2: use Image 2 only for outfit COLOR. No additions, no text, no stars or floor shadows. Preserve genuine transparent RGBA background.


## Native match integration

2026-10-03: the approved red and blue sheets now render each fighter independently when groggy and standing. Down sprites take precedence; the old four-direction offsets and 84px sizing remain unchanged. Normal appearance and the manual old-version test are preserved.
