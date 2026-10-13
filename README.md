# Lacquer & Co. — Nail Art Studio

MERN app for a nail studio: an online booking system, an admin dashboard, automatic extraction of nail art from reference photos, and a virtual try-on that runs in the browser.

See [PLAN.md](PLAN.md) for the architecture, design decisions and roadmap.

## Requirements

- Node.js 20.19+ (tested on 24)
- MongoDB 6+ running locally, or a MongoDB Atlas URI
- Optional: a Cloudinary account (without one, images are stored in `server/uploads/`)

## Setup

```bash
# API
cd server
cp .env.example .env          # set JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, STUDIO_TIMEZONE…
npm install
npm run seed:admin            # creates the admin account from .env
npm run dev                   # http://localhost:5000

# Web client (second terminal)
cd client
npm install
npm run dev                   # http://localhost:5173 (proxies /api and /uploads to :5000)
```

Log in with the admin credentials from `.env` to reach `/admin`.

## How it works

**Nail art extraction** (`server/src/services/nailIsolation.js`). When an admin uploads a reference photo, the API returns straight away and processes the image in the background:

1. background removal (`@imgly/background-removal-node`, runs locally; or Cloudinary's add-on)
2. skin removal with an adaptive YCrCb skin model learned from each photo, with a guard that keeps white, grey and silver nails
3. removal of large white/grey areas (sleeves, walls) so nails resting on them stay separate
4. morphological clean-up and connected components, filtered by size, shape, how much of the outline borders skin, how skin-coloured the region is, and size relative to the other nails
5. two outputs: a transparent PNG of all the nails, and an upright texture of the largest single nail for try-on

To test extraction on a photo without the UI, run `npm run test:isolation -- <image> [--tolerance 2.5] [--debug]` in `server/`. It writes the isolated PNG, the swatch and a side-by-side preview to `<image dir>/output/`. `--debug` adds the intermediate masks and explains why each region was kept or dropped. To add a photo as a real design from the command line, use `npm run import:design -- <image> --name "…" --price 30000`.

The sample photo `server/test-assets/test-nail.jpg` is by [Ari Kurniawan on Unsplash](https://unsplash.com/photos/womans-hands-with-ornate-navy-gold-and-white-nails-v9agFscJCIE) (Unsplash License).

If extraction misses or removes too much, adjust **Skin removal** on the design page and click **Re-extract**. Set it to 0 for nude polish that is close to skin colour.

**Virtual try-on** (`client/src/tryon/`). This runs entirely in the browser, and customer photos are never uploaded:

1. MediaPipe HandLandmarker finds 21 landmarks per hand
2. nail position and size are estimated from each finger's last segment, then snapped to the fingertip outline in the photo
3. the design texture is drawn into each nail with lighting matched to the photo: exposure, broad shading, fine texture, white balance, nail curvature, gloss highlights and a cuticle shadow

Customers can drag and resize individual nails, hide nails, compare before and after, and save the result.

## Configuration

All settings live in `server/.env` (see `.env.example`): database, JWT, Cloudinary, the background-removal provider (`auto | imgly | cloudinary | none`), studio hours, slot length, closed days and the booking window.

Client options (in `client/.env`, all optional):

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `/api` | API base URL when the API isn't behind the dev proxy |
| `VITE_CURRENCY` | `MMK` | currency used to format prices |
| `VITE_HAND_MODEL_URL` | Google-hosted model | self-host `hand_landmarker.task` |

For the dev server only, `API_PROXY_TARGET` points the Vite proxy at an API other than `http://localhost:5000`.

## Known limitations

- Each time slot holds one booking (one technician).
- Try-on works best with the back of the hand, fingers spread, good light and a plain background. Thumbs seen side-on are the least accurate; customers can adjust any nail by hand.
- Nail art extraction has been checked on synthetic test images; tune the default skin tolerance against real reference photos.

## AI try-on (Replicate)

Besides the instant in-browser preview, logged-in customers can generate a photo-realistic result with a generative model on [Replicate](https://replicate.com). It is off until you set `REPLICATE_API_TOKEN` in `server/.env`.

How it works:

1. The browser builds a black and white **nail mask** from the detected nails (including any nails the customer dragged, resized or hid) and uploads it with the photo.
2. The server sends the photo, the design's isolated nail art as the reference pattern, and the mask to the model with a prompt describing the scene.
3. The result is **composited back onto the original photo only inside the (slightly grown, feathered) nail mask**. Generative models re-render the whole image, so this keeps the customer's actual hand, skin and background unchanged.
4. The result is stored (Cloudinary or `server/uploads/tryons/`) and shown. Only the owner or an admin can view it. The original photo is never stored, and results are deleted after `TRYON_RETENTION_DAYS` (default 30).

**Pick and verify a model.** Image models differ in what they accept, so check before you rely on one:

```bash
cd server
# in .env: REPLICATE_API_TOKEN=..., REPLICATE_PRESET=multi-image, optionally REPLICATE_MODEL=owner/name
npm run replicate:schema      # prints the model's real input fields
```

| Preset | Sends | Use for |
|---|---|---|
| `multi-image` (default, `google/nano-banana`) | `prompt`, `image_input[photo, pattern, mask]`, `output_format` | editing models that take several reference images; the model sees the design |
| `inpaint` (`black-forest-labs/flux-fill-pro`) | `prompt`, `image`, `mask` | classic mask inpainting; the model **cannot see the design**, only the prompt |
| `custom` | whatever `REPLICATE_INPUT_TEMPLATE` describes | any other model |

The default model names and field names are from memory of Replicate's catalogue and have **not been verified against the live API** in this project. Run `npm run replicate:schema` first, and use `custom` if a model's fields differ.

**Cost and abuse controls** (each generation is billed to your Replicate account): login is required, `TRYON_RATE_PER_HOUR` (default 10) limits each user, `TRYON_DAILY_LIMIT` (default 200) caps the total per day, and a user can only run one generation at a time.

**Privacy.** The customer ticks a consent box before their photo is sent to the server and Replicate. Update your privacy policy accordingly.
