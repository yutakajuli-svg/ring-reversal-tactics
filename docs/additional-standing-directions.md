# Additional four standing directions

Generated with the built-in image generation tool on 2026-10-02. Existing rounded sprite sheets remain unchanged. These companion sheets are prepared assets; the current game renderer and four-direction rules have not been changed.

Files: public/assets/wrestler-red-cardinal-sprites.png and public/assets/wrestler-blue-cardinal-sprites.png.

Both sheets: 1222 x 1287, RGBA, transparent background, 2 x 2 layout. Top left: front. Top right: back. Bottom left: screen-left profile. Bottom right: screen-right profile. Match the existing sheet's cell convention and calibrate foot alignment in the renderer before using.

For the default isometric view, the new board diagonal (-1,+1) uses the screen-right profile; (+1,+1) uses front; (+1,-1) uses screen-left profile; (-1,-1) uses back. A 180 degree board view reverses these directions. Diagonal travel and collision handling remain pending integration.

## Generation prompts

Red: Use case: identity-preserve. Asset type: transparent game character direction sprite sheet, companion to the provided existing four-direction sheet. Draw exactly FOUR full-body views of the SAME ADULT female wrestler in the reference, arranged in a clean 2x2 grid of equal cells: TOP LEFT facing directly toward the viewer (front view); TOP RIGHT facing directly away (back view); BOTTOM LEFT facing exactly screen-left (strict left profile); BOTTOM RIGHT facing exactly screen-right (strict right profile). These are the four missing angles between the reference's existing three-quarter directions; DO NOT repeat three-quarter views. Keep the identical short brown bob haircut, rounded chibi proportions, muscular sturdy adult build, red wrestling singlet with white V neck trim and white side stripes, red wrist cuffs, black lace-up boots, face design, warm illustrated 3D-like shading and outline quality. Same idle fighting stance, fists raised, feet apart. Match reference camera slightly elevated enough to show boot tops, same scale in all four cells, each figure centered, full hair and both boots visible, generous clear transparent margins at every cell boundary, no overlaps. Genuine transparent background. No labels, text, arrows, ring, floor, scenery or ground shadows. Do not change the costume or character identity.

Blue: Use case: precise-object-edit. Make the BLUE version of Image 1's exact four-direction transparent sprite sheet. Image 2 shows the correct blue costume. Change ONLY the red singlet fabric and red wrist cuffs in Image 1 to the saturated royal blue from Image 2. Preserve all four poses, exact front/back/left-profile/right-profile angles, framing, 2x2 cell arrangement, hair, face, skin, adult muscular chibi proportions, white costume trim and side stripes, black boots, highlights, outlines, spacing and scale from Image 1. No other modifications, no extra characters or angles. Genuine transparent background, no text, no labels or shadows.
