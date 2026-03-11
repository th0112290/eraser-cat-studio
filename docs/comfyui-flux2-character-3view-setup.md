# FLUX2 Character 3-View Setup (ComfyUI + eraser-cat-studio)

This guide is tailored to your current local model set:

- text encoder: `qwen_3_4b.safetensors`
- diffusion model: `flux-2-klein-base-4b-fp8.safetensors`
- vae: `flux2-vae.safetensors`

## Current compatibility result

I validated your local ComfyUI API (`127.0.0.1:8000`) with actual prompt runs.

Result: the current model trio is **not directly compatible** with local FLUX sampling in ComfyUI for txt2img.

Observed errors:

1. `CLIPTextEncodeFlux` -> `KeyError: 't5xxl'`
2. sampler runtime -> `mat1 and mat2 shapes cannot be multiplied (... and 7680x3072)`

Meaning:
- `flux-2-klein-base-4b-fp8` expects FLUX-style text embeddings (clip_l + t5xxl path).
- `qwen_3_4b` alone does not match that local FLUX embedding contract in this chain.

## What you additionally need (for local FLUX2 generation)

Install at least these text encoders into ComfyUI text encoder folder:

1. `clip_l.safetensors`
2. `t5xxl_fp16.safetensors` (or bf16 variant compatible with your Comfy build)

Then use `DualCLIPLoader(type=flux)` + `CLIPTextEncodeFlux`.

## Ready template

Use legacy template [workflows/comfy/legacy/image_generation/flux2_character_3view_api.template.json](../workflows/comfy/legacy/image_generation/flux2_character_3view_api.template.json).

How to use:

1. Replace placeholders:
- `__UNET_NAME__`
- `__VAE_NAME__`
- `__CLIP_L_NAME__`
- `__T5XXL_NAME__`
- `__VIEW_PROMPT_CLIP_L__`
- `__VIEW_PROMPT_T5__`
- `__SEED__`

2. POST to ComfyUI:

```bash
curl -X POST http://127.0.0.1:8000/prompt \
  -H "content-type: application/json" \
  -d @payload.json
```

## 3-view generation strategy

Use the same base identity prompt and vary only the view suffix:

- front: `front view, facing camera, symmetric shoulders`
- threeQuarter: `three-quarter view, 45-degree yaw`
- profile: `right profile view, 90-degree side view`

Seed policy:

- base seed fixed per character version
- front=`base+11`, threeQuarter=`base+23`, profile=`base+37`

## Presets

Quality preset:
- steps: 36-44
- sampler: dpmpp_2m_sde
- scheduler: karras
- guidance: 3.8-4.5
- resolution: 1024x1024 (or 832x1216 for portrait)

Balanced preset:
- steps: 24-32
- sampler: dpmpp_2m
- scheduler: karras or sgm_uniform
- guidance: 3.2-3.8

Fast preset:
- steps: 14-20
- sampler: euler
- scheduler: normal
- guidance: 2.6-3.2

## Existing related docs

- [docs/comfyui-3view-prompt-pack.md](./comfyui-3view-prompt-pack.md)
- [docs/character-generation-debug-checklist.md](./character-generation-debug-checklist.md)

## Notes for your current setup

If you keep only `qwen_3_4b + flux-2-klein-base-4b-fp8 + flux2-vae`, local FLUX2 txt2img chain will keep failing with embedding mismatch.

So the next concrete step is installing `clip_l` + `t5xxl`.
