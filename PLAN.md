# Nail Art Studio — Implementation Plan

MERN monorepo: `server/` (Node 20+/Express/MongoDB) and `client/` (React + Vite + Tailwind).

```
test claude/
├── PLAN.md
├── server/                 Express API, image isolation pipeline
│   ├── src/
│   │   ├── config/         env, db, cloudinary
│   │   ├── models/         User, Design, Appointment
│   │   ├── middleware/     auth, upload (multer), validate (zod), error
│   │   ├── services/       storage, backgroundRemoval, nailIsolation, designProcessor, slots
│   │   ├── controllers/    auth, designs, appointments
│   │   ├── routes/
│   │   ├── scripts/        seedAdmin
│   │   ├── app.js
│   │   └── server.js
│   └── uploads/            local asset store (used when Cloudinary isn't configured)
└── client/                 React + Vite + Tailwind v4
    └── src/
        ├── lib/            api client, auth context, formatting
        ├── components/     layout, cards, shared UI
        ├── pages/          customer pages; admin/ for the dashboard
        └── tryon/          handDetector (MediaPipe), nailGeometry, renderNails
```

## Key design decisions

| Concern | Decision | Why |
|---|---|---|
| Asset storage | `storage` service: Cloudinary if `CLOUDINARY_*` set, otherwise local `uploads/` served at `/uploads` | Dev works with zero accounts; prod uses the CDN |
| Background removal | Pluggable provider: `imgly` (`@imgly/background-removal-node`, local ONNX model, free) / `cloudinary` (`e_background_removal` add-on) / `none`; `auto` = imgly if installed | imgly is free and runs offline; Cloudinary is an option if the add-on is paid for |
| Hand/skin removal | Done after background removal, in `nailIsolation` with sharp raw pixels: YCrCb skin candidates → **adaptive** skin model (median/MAD of chroma) → mask out skin → open/close morphology → connected components | Background removers keep the hand (it's foreground). An adaptive skin model handles nude/pink polish far better than a fixed skin range |
| Try-on texture | Pipeline outputs two assets: `isolatedImage` (all nails, transparent PNG, shown in the gallery) and `swatchImage` (the largest nail, rotated upright, inset-cropped to a full 256×384 texture) | Try-on needs a texture that fills the nail completely; a cut-out with ragged edges looks bad once warped |
| Processing | Upload returns `202`; isolation runs in the background; `processing.status` = `pending → processing → ready / failed`; admin can reprocess with a different `skinTolerance` | imgly takes a few seconds; keeps the request fast |
| Booking slots | Fixed-length slots (`SLOT_MINUTES`) inside business hours, in the studio's time zone; one booking per slot, enforced by a **unique partial index** on `{date, startTime}` where `active: true` | Rules out double-booking races with no replica set or transactions needed |
| Auth | JWT (Bearer), roles `customer` / `admin`; guests can book with contact details; admin is created by a seed script | Simple to use; no public admin sign-up |
| Validation | zod schemas per route | Clear 400 errors |

## Phases

### Phase 1 — Backend foundation ✅
- Express app, config, Mongo connection, error handling, security middleware (helmet, CORS, rate limit)
- Models: User, Design, Appointment
- Auth: register / login / me; `seed:admin`
- Designs CRUD + upload + async isolation pipeline + reprocess
- Appointments: availability, book, my bookings, cancel, admin list/filter/stats/status update

### Phase 2 — Backend hardening
- Integration tests (vitest + supertest + mongodb-memory-server)
- Isolation tuning against real reference photos; tune default `skinTolerance`
- Optional: email confirmation (nodemailer), technician/seat capacity > 1

### Phase 3 — Client foundation ✅
- Vite + React + Tailwind + React Router + TanStack Query; axios client with JWT interceptor
- Pages: Home, Gallery (`/designs`), Design detail, Booking flow (design → date → slot → contact → confirm), Login/Register, My Bookings

### Phase 4 — Admin dashboard ✅
- Appointments table (filters, status changes), stats cards, calendar/day view
- Design manager: upload with live processing status (polling), preview original vs. isolated vs. swatch, reprocess with tolerance slider, edit and archive

### Phase 5 — Virtual try-on (client-side, `@mediapipe/tasks-vision`) ✅ first version
1. **Detect**: HandLandmarker (21 landmarks). For each finger: TIP (4, 8, 12, 16, 20) and DIP (3, 7, 11, 15, 19).
2. **Nail geometry**: axis = DIP→TIP; nail centre ≈ `TIP − 0.35·(TIP−DIP)`; length ≈ `0.55·|TIP−DIP|`; width ≈ `0.75·length` (thumb gets wider ratios); rotation = axis angle. Fit per finger, using landmark z to tell palm from back of hand (skip when the palm faces the camera).
3. **Refine** ✅: walk from the tip landmark to the fingertip outline and slide the nail so its free edge sits there; measure finger width across the nail (clamped, with a fallback to the estimate). *Later:* OpenCV.js segmentation of the nail plate itself.
4. **Warp** ✅: cover-fit the swatch into an upright superellipse nail tile, then rotate and translate it into place. *Later:* perspective squash from landmark z.
5. **Blend for realism**:
   - Shading layer: grayscale of the original nail region, high-passed → composite with `multiply` (shadows) and `soft-light`/`overlay` (contours)
   - Specular: keep the brightest pixels of the original as a `screen` highlight layer
   - Edge feathering with a blurred mask; a subtle cuticle shadow
   - Match the photo's white balance by tinting the shading layer
6. UI: upload or take a photo, pick a design, sliders for opacity/size/offset, per-nail drag adjust, download the result, "Book this look" CTA.

### Phase 6 — Polish and deploy
- Responsive and accessibility pass, loading skeletons, error states
- Deploy: API → Render/Railway, client → Vercel/Netlify, MongoDB Atlas, Cloudinary

## API (Phase 1)

| Method | Path | Access |
|---|---|---|
| POST | `/api/auth/register` | public |
| POST | `/api/auth/login` | public |
| GET | `/api/auth/me` | auth |
| GET | `/api/designs` (`?category&search&all=true`) | public (`all` = admin only) |
| GET | `/api/designs/:id` | public |
| POST | `/api/designs` (multipart `image`) | admin |
| PATCH | `/api/designs/:id` (multipart, image optional) | admin |
| POST | `/api/designs/:id/reprocess` (`{skinTolerance}`) | admin |
| DELETE | `/api/designs/:id` (archive) | admin |
| GET | `/api/appointments/availability?date=YYYY-MM-DD` | public |
| POST | `/api/appointments` | public (guest) / auth |
| GET | `/api/appointments/mine` | auth |
| PATCH | `/api/appointments/:id/cancel` | owner / admin |
| GET | `/api/appointments` (`?status&from&to&page&limit`) | admin |
| GET | `/api/appointments/stats` | admin |
| PATCH | `/api/appointments/:id/status` | admin |

### Phase 7 — Generative AI try-on (Replicate) ✅ built, awaiting a real-model test
Mask generated in the browser from the adjusted nails → server calls Replicate (configurable model/preset) → result composited back onto the original photo inside the nail mask only → stored and shown. Tested end to end against a fake Replicate API; **not yet run against the real service** (needs your token). Instant in-browser preview is kept as the free, offline option.
