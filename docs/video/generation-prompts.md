# Presenter Generation Prompts

Use these only for the fictional presenter and presentation-stage shots. Keep
the presenter visually consistent by first generating one approved reference
portrait, then supplying it as the reference image to subsequent generation
requests. Never request a real person's likeness.

## Reference portrait prompt

```text
Original fictional adult Korean woman, early thirties, professional technology
presenter, warm confident expression, shoulder-length dark hair with a neat
side part, navy tailored blazer over a simple ivory blouse, minimal jewelry,
natural studio makeup, standing in a modern dark-blue presentation studio with
soft cyan accent lighting, medium shot, 16:9, premium product-launch lighting,
photorealistic, no text, no logos, no watermark, not based on any real person.
```

## Gemini video prompt — opening and closing

```text
Create a 6-second 16:9 video using the supplied fictional presenter reference.
She is an adult Korean technology presenter in the same navy blazer and modern
blue presentation studio. She faces camera, delivers a calm confident opening,
natural hand gesture, slow camera push-in, clean stage background with empty
space on the right for a title overlay. Photorealistic. No readable text, no
logos, no watermark, no extra people, no simulated terminal or product UI.
```

## Gemini video prompt — side-by-side transition

```text
Create a 5-second 16:9 video using the supplied fictional presenter reference.
Same adult Korean presenter and studio. Three-quarter angle, presenter stands
on the left and gestures toward a blank presentation canvas on the right.
Locked camera, restrained movement, premium developer-tool keynote style.
Leave the right side uncluttered for insertion of a real screen recording in
post. No readable text, no logos, no watermark, no simulated app interface.
```

## Codex editing brief

```text
Read docs/video/production-plan.md and assemble a 1920x1080, under-three-minute
BriefOps Relay submission video from the supplied real screen recordings,
approved fictional-presenter clips, narration WAV, and captions SRT.

Requirements:
- preserve real product captures without inventing UI;
- use presenter clips only as transitions or beside blank slide space;
- burn in English captions;
- no music unless an explicitly licensed track is supplied;
- output H.264/AAC MP4 and run ffprobe to verify duration, video, and audio;
- report missing inputs instead of fabricating them.
```
