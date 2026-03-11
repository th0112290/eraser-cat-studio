# Cat Mascot Production Brief

Updated: 2026-03-06

## Reference Set

- Main style: [refs/cat_quality_input/01_main_style/ChatGPT Image 2026년 3월 6일 오후 02_10_14.png](C:\Users\th011\eraser-cat-studio\refs\cat_quality_input\01_main_style\ChatGPT Image 2026년 3월 6일 오후 02_10_14.png)
- Face detail: [refs/cat_quality_input/02_face_detail/ChatGPT Image 2026년 3월 6일 오후 02_10_17.png](C:\Users\th011\eraser-cat-studio\refs\cat_quality_input\02_face_detail\ChatGPT Image 2026년 3월 6일 오후 02_10_17.png)
- Hands and body: [refs/cat_quality_input/03_hands_body/ChatGPT Image 2026년 3월 6일 오후 02_14_07.PNG](C:\Users\th011\eraser-cat-studio\refs\cat_quality_input\03_hands_body\ChatGPT Image 2026년 3월 6일 오후 02_14_07.PNG)
- User notes: [refs/cat_quality_input/notes.txt](C:\Users\th011\eraser-cat-studio\refs\cat_quality_input\notes.txt)

## Target

The target is not a detailed anime character sheet.

The target is a simple 2D cat mascot with:

- a near-square oversized head
- tiny chibi body
- black line-art on white or transparent background
- very limited facial features
- readable sticker-grade expressions
- simplified paw or mitten hands
- an eraser-dust tail cluster instead of a normal tail
- a doodle or hand-drawn feel rather than commercial anime polish

## Hard Visual Constraints

These are identity constraints, not optional style hints.

- Head shape must stay near-square with soft corners.
- Ears must be pointed and clearly separated from the head block.
- Eyes must stay extremely simple: dot eyes or single-stroke expression eyes.
- Nose should be absent or nearly absent.
- Mouth must stay graphic and minimal.
- Body must remain short, narrow, and clearly subordinate to the head.
- Arms and legs must stay short and tube-like.
- Hands must be paw-like or mitten-like. Avoid realistic fingers.
- The tail replacement must read as a small clustered eraser-dust puff.
- Line weight must be clean, dark, and fairly even.
- Shading should be absent or extremely light.
- Palette should stay monochrome or almost monochrome.

## Explicit Rejections

- realistic fur texture
- glossy anime rendering
- painterly detail
- 3D lighting or 3D material cues
- long human limbs
- small head / long torso proportions
- realistic nose, lips, brows, or cheek anatomy
- five-finger hands
- high-detail commercial anime face rendering

## Why The Current Pipeline Misses

The current generation stack was tuned around "high quality 2D anime character sheet" assumptions:

- prompts emphasize production-ready anime design and full-body model-sheet polish
- selection logic rewards general technical image quality more than mascot readability
- pose-guided side views preserve rotation, but they do not enforce this mascot's simplified graphic language
- human-like hand anatomy remains overrepresented in the prompt space
- the current presets prefer detail, shading, and "quality" cues that are actively harmful here

In practice, this creates the wrong failure mode:

- the face drifts toward anime or semi-human
- hands become uncanny
- line-art becomes too polished or too noisy
- the square-head identity weakens
- 3-view consistency fights the mascot simplicity instead of supporting it

## Production Direction

### 1. Simplify, do not beautify

The goal is not "prettier anime".

The goal is stronger graphic reduction:

- fewer face landmarks
- fewer anatomy demands
- flatter tone
- higher silhouette clarity
- stricter head/body ratio control

### 2. Treat this as a mascot system, not a humanoid character system

Quality should be judged by:

- silhouette readability at small size
- expression clarity
- ear and head consistency
- paw simplicity
- tail-cluster recognizability

Quality should not be judged primarily by:

- realistic hands
- skin rendering
- hair detail
- cinematic lighting
- dense texture

### 3. Split identity rules from view rules

Identity rules:

- square head
- pointed ears
- tiny body
- simple face
- eraser-dust tail
- black line-art

View rules:

- front: full symmetry and expression readability
- three-quarter: preserve ear spacing and cheek contour, keep muzzle implication minimal
- profile: preserve blocky head silhouette and tiny body, avoid realistic snout development

### 4. Downscope hands on purpose

Hands should be generated as:

- mitten paws
- round paw pads
- three-toe or paw-indicated marks only

Not as:

- articulated human hands
- long fingers
- detailed knuckles

## New Evaluation Rubric

Score each candidate by the following first, before generic quality metrics:

1. Head shape preserved
2. Ear shape preserved
3. Eye style stays minimal
4. Body stays chibi and short
5. Hands remain paw-like
6. Tail-cluster reads correctly
7. Line-art is clean and even
8. Expression reads instantly
9. Front / three-quarter / profile keep the same mascot identity
10. Output still works as a sticker or emote at small size

If any of the following fail, the candidate should usually be rejected:

- head becomes too round
- body becomes too human
- fingers become realistic
- face becomes commercial-anime detailed
- tail loses the eraser-dust read

## Immediate Pipeline Changes Recommended

1. Replace anime-oriented positive prompts with mascot-oriented graphic prompts.
2. Add hard negative tokens against realistic hands, fur detail, glossy anime shading, and human anatomy.
3. Add a dedicated mascot quality profile:
   - square-ish canvas
   - lower detail pressure
   - flatter postprocess
   - no saturation boosting
   - no sharpen pass that creates faux detail
4. Change selection logic so silhouette and mascot identity outrank generic texture/sharpness scores.
5. Generate front view as the master identity sheet first.
6. Use side-view generation only after the front view passes mascot checks.
7. Keep pose guidance lighter than current humanoid character settings.

## Recommended Next Implementation Step

Build a dedicated `eraser-cat-mascot-production` preset with:

- mascot-specific prompts
- mascot-specific negatives
- flat monochrome quality profile
- simplified hand constraints
- selector rules tuned for mascot readability

Do not continue tuning the current anime-production preset as the main path for this character.
