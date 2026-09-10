<div align="center">

# 🪡 ShilpSetu Backend

**AI-powered backend for India's premier artisan e-commerce platform.**  
Connects traditional craftspeople with buyers through intelligent product photography enhancement, automated catalog generation, and live pricing intelligence.

[![Node.js](https://img.shields.io/badge/Node.js-24%20LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-8-2D3748?logo=prisma&logoColor=white)](https://prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io)

</div>

---

## ✨ What is ShilpSetu?

ShilpSetu ("Bridge of Crafts" in Hindi) is a mobile-first platform built for Indian artisans — weavers, potters, metalworkers, and more — who lack the resources to present their products professionally online. The backend powers:

| Feature | Description |
|---|---|
| 📸 **AI Image Enhancement** | Multi-stage pipeline: background removal → cleanup → studio lighting via GPT-4o / Gemini |
| 🏷️ **Auto Catalog Generation** | Describes products in Hindi & English with cultural context |
| 💰 **Live Pricing Intelligence** | Real-time market prices via Tavily search + static craft benchmarks |
| 🛒 **Marketplace** | Product listings, buyer requests, and order management |
| 🔐 **Auth** | JWT-based auth with OTP support for artisans |
| 🌐 **i18n** | Internationalization service for multi-language artisan content |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Express API (Port 5001)                 │
│  /auth  /images  /products  /catalog  /marketplace      │
│  /pricing  /orders  /voice  /admin  /styles             │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   PostgreSQL 16      Redis 7        Cloudflare R2
   (Prisma ORM)    (BullMQ queues)  (image storage)
         │
         │   AI Image Pipeline (BullMQ workers)
         │   ┌─────────────────────────────────────────┐
         └──▶│  1. Validate & detect product bounds     │
             │  2. Poof.bg background removal (~100ms)  │
             │  3. Cutout cleanup (Sharp)               │
             │  4. GPT-4o / Gemini studio enhancement   │
             │  5. Save versions to R2                  │
             └─────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 LTS |
| Language | TypeScript 7 |
| Framework | Express 5 |
| ORM | Prisma 8 (Next) |
| Database | PostgreSQL 16 |
| Job Queue | BullMQ + Redis 7 |
| File Storage | Cloudflare R2 (S3-compatible) |
| Image Processing | Sharp |
| AI — Image Analysis | Google Gemini 2.5 Flash |
| AI — Enhancement | OpenAI GPT-4o, Groq LLaMA-3 |
| Background Removal | Poof.bg API |
| Price Research | Tavily Search API |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js ≥ 24 LTS** — [download](https://nodejs.org)
- **Docker & Docker Compose** — for PostgreSQL + Redis
- **Git**

### 1. Clone the repository

```bash
git clone https://github.com/your-org/shilpsetu-backend.git
cd shilpsetu-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your credentials. See the [Environment Variables](#-environment-variables) section below for details on each variable.

**Minimum required to start:**
- `DATABASE_URL`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`

### 4. Start infrastructure (PostgreSQL + Redis)

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 16** on port `5433` (host) → `5432` (container)
- **Redis 7** on port `6380` (host) → `6379` (container)

### 5. Initialize the database

```bash
npx prisma skills sync
```

This applies your Prisma 8 contract to the database (creates all tables).

### 6. (Optional) Seed admin account

Set `ADMIN_PHONE` and `ADMIN_PASSWORD` in `.env`, then:

```bash
npm run seed:admin
```

### 7. Start the development server

```bash
npm run dev
```

The API will be live at **http://localhost:5001** (or whatever `PORT` you set).

---

## 🔑 Environment Variables

Copy `.env.example` to `.env` and fill in each section:

### Server

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `development` \| `production` \| `test` |
| `PORT` | No | `4000` | HTTP port |
| `FRONTEND_URL` | No | `http://localhost:3000` | CORS allowed origin |
| `JWT_SECRET` | **Prod** | *(weak default)* | HS256 secret for JWT signing — change in production! |

### Database

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ Yes | — | Full PostgreSQL connection string |

Docker default: `postgresql://shilpsetu:shilpsetu@localhost:5433/shilpsetu`

### Redis

| Variable | Required | Default | Description |
|---|---|---|---|
| `REDIS_URL` | No | — | Full `redis://` URL (overrides HOST/PORT below) |
| `REDIS_HOST` | No | `localhost` | Redis hostname |
| `REDIS_PORT` | No | `6380` | Redis port |
| `REDIS_PASSWORD` | No | — | Redis password |

### Cloudflare R2 Storage

Sign up at [cloudflare.com](https://cloudflare.com) → R2 Object Storage → create a bucket → generate an API token.

| Variable | Required | Description |
|---|---|---|
| `R2_ACCOUNT_ID` | ✅ Yes | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | ✅ Yes | R2 API Token Access Key ID |
| `R2_SECRET_ACCESS_KEY` | ✅ Yes | R2 API Token Secret |
| `R2_BUCKET_NAME` | ✅ Yes | Name of the R2 bucket |
| `R2_PUBLIC_URL` | No | CDN URL for public image access |

### AI Providers

The image pipeline and catalog generation work with whichever AI keys are present. Providing all three gives the best quality + reliability.

| Variable | Required | Get it at | Used for |
|---|---|---|---|
| `GEMINI_API_KEY` | Recommended | [aistudio.google.com](https://aistudio.google.com/apikey) | Product analysis, segmentation fallback, catalog text |
| `OPENAI_API_KEY` | Recommended | [platform.openai.com](https://platform.openai.com/api-keys) | Studio-quality image enhancement (GPT-4o) |
| `GROQ_API_KEY` | Optional | [console.groq.com](https://console.groq.com/keys) | Fast catalog generation (LLaMA-3), free tier available |
| `TAVILY_API_KEY` | Optional | [app.tavily.com](https://app.tavily.com) | Live market price lookup in pricing engine |

> **Pricing fallback:** Without `TAVILY_API_KEY`, prices are estimated from a static craft benchmark table. The API response will include `"pricingSource": "benchmark_fallback"` so you know.

### Background Removal

| Variable | Required | Description |
|---|---|---|
| `POOF_BG_API_KEY` | Recommended | Get at [poof.bg](https://poof.bg) — primary BG removal engine (~100ms) |
| `POOF_BG_API_URL` | No | Defaults to `https://api.poof.bg/v1/remove` |

> **Segmentation fallback chain:** Poof.bg → Gemini Vision polygon mask → local flood-fill segmentation.

### Security & Admin

| Variable | Required | Description |
|---|---|---|
| `TOKEN_ENCRYPTION_KEY` | No | AES-256-GCM key for marketplace token encryption (32 bytes / 64 hex chars) |
| `ADMIN_PHONE` | No | Phone number for the seeded admin account |
| `ADMIN_PASSWORD` | No | Password for the seeded admin account |

---

## 📜 Available Scripts

```bash
# Development
npm run dev            # Start server with hot-reload (tsx watch)
npm start              # Start server once (no watch)

# Database
npm run contract:emit  # Emit Prisma 8 contract artifacts after schema changes
npm run seed:admin     # Seed initial admin user (set ADMIN_PHONE + ADMIN_PASSWORD in .env)

# Testing
npm run test:apis      # Run full API integration test suite
```

---

## 🗂️ Project Structure

```
shilpsetu-backend/
├── src/
│   ├── app.ts                  # Express app setup, middleware, routes
│   ├── index.ts                # Server entry point, worker bootstrapping
│   ├── config/
│   │   └── env.ts              # Zod-validated environment variables
│   ├── routes/                 # Express route definitions
│   │   ├── auth.routes.ts
│   │   ├── image.routes.ts
│   │   ├── product.routes.ts
│   │   ├── catalog.routes.ts
│   │   ├── marketplace.routes.ts
│   │   ├── order.routes.ts
│   │   ├── pricing.routes.ts
│   │   ├── voice.routes.ts
│   │   ├── style.routes.ts
│   │   ├── admin.routes.ts
│   │   ├── buyer-request.routes.ts
│   │   └── i18n.routes.ts
│   ├── services/               # Business logic layer
│   │   ├── auth.service.ts
│   │   ├── image.service.ts
│   │   ├── catalog.service.ts
│   │   ├── marketplace.service.ts
│   │   ├── pricing.service.ts  # Live price search + benchmark fallback
│   │   ├── voice.service.ts
│   │   └── analytics.service.ts
│   ├── jobs/                   # BullMQ workers & pipelines
│   │   ├── pipeline.ts         # Main 7-stage image processing pipeline
│   │   ├── imageProcessing.worker.ts
│   │   ├── catalogGeneration.worker.ts
│   │   ├── marketplace.worker.ts
│   │   └── queues.ts
│   ├── modules/
│   │   ├── auth/               # OTP, JWT, session management
│   │   ├── image/
│   │   │   ├── ai/             # AI provider wrappers (Gemini, OpenAI, Groq)
│   │   │   └── processing/     # Sharp-based image processing utilities
│   │   │       ├── segmentation.ts   # Background removal (Poof.bg → Gemini → local)
│   │   │       ├── detection.ts      # Product bounding-box detection
│   │   │       └── cleanup.ts        # Post-segmentation cutout cleanup
│   │   └── marketplace/        # Marketplace logic
│   ├── middleware/             # Auth guards, error handler, rate limiter
│   ├── lib/                    # Shared utilities (R2 client, logger, etc.)
│   ├── prisma/                 # Prisma 8 contract schema
│   └── i18n/                  # Translation strings
├── migrations/                 # Database migration files
├── scripts/                    # Utility scripts (seed, test-apis)
├── tests/                      # Integration tests
├── docker-compose.yml          # Local dev infrastructure (Postgres + Redis)
├── prisma.config.ts            # Prisma 8 configuration
├── .env.example                # ← All environment variables documented here
└── package.json
```

---

## 🖼️ Image Processing Pipeline

When an artisan uploads a photo, it goes through a 7-stage pipeline powered by BullMQ:

```
Upload ──▶ 1. VALIDATING   (check format, size)
       ──▶ 2. ANALYZING    (Gemini: product type, cultural context, quality score)
       ──▶ 3. DETECTING    (bounding-box of the product)
       ──▶ 4. BACKGROUND_REMOVAL  (Poof.bg ~100ms, or Gemini polygon, or local flood-fill)
       ──▶ 5. CLEANUP      (Sharp: despeckle, sharpen, trim transparent margins)
       ──▶ 6. ENHANCING    (GPT-4o / Gemini: studio lighting + white background recompose)
       ──▶ 7. COMPLETED    (all versions saved to Cloudflare R2)
```

**Key design decisions:**
- Each image is processed by exactly one worker (deduplication via BullMQ job IDs)
- A batch of N images runs concurrently (concurrency: 3 per worker)
- Poof.bg is Tier 1 for background removal — typical response is <100ms
- The pipeline reports per-image progress (0–100%) for real-time UI updates

---

## 💰 Pricing Engine

The `/api/pricing/estimate` endpoint returns market price estimates for artisan products.

**With `TAVILY_API_KEY`:**  
Performs a live web search, extracts price points from Indian e-commerce sites, and returns the median with a confidence range. Response includes `"pricingSource": "live_search"`.

**Without `TAVILY_API_KEY`:**  
Falls back to static `CRAFT_BENCHMARKS` (hardcoded median prices by craft category, calibrated against major Indian marketplaces). Response includes `"pricingSource": "benchmark_fallback"`.

The benchmark category matching uses **longest-key-first** substring matching with word boundaries, so "Chanderi Silk Saree" correctly matches `chanderi` before the more generic `silk`.

---

## 📡 API Overview

Full API reference: see [`API_REFERENCE.md`](./API_REFERENCE.md) or import [`ShilpSetu.postman_collection.json`](./ShilpSetu.postman_collection.json) into Postman.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/signup` | Register artisan |
| POST | `/api/auth/signin` | Login |
| POST | `/api/auth/refresh` | Refresh JWT |
| POST | `/api/images/upload-batch` | Upload image batch for processing |
| GET | `/api/image-batches/:batchId` | Poll batch processing status |
| GET | `/api/products` | List artisan products |
| POST | `/api/products` | Create product |
| POST | `/api/catalog/generate` | Generate catalog description |
| POST | `/api/pricing/estimate` | Estimate product price |
| GET | `/api/marketplace/listings` | Browse marketplace |
| GET | `/api/studio-styles` | Available studio enhancement styles |

---

## 🐳 Docker (Infrastructure Only)

The `docker-compose.yml` runs only the stateful infrastructure — the Node.js server runs locally via `npm run dev`.

```bash
# Start Postgres + Redis
docker compose up -d

# Stop
docker compose down

# Stop and delete data volumes
docker compose down -v
```

---

## 🤝 Contributing

1. Fork the repo and create a feature branch
2. Install dependencies: `npm install`
3. Copy and fill in env: `cp .env.example .env`
4. Start infrastructure: `docker compose up -d`
5. Run the dev server: `npm run dev`
6. Make your changes and run `npm run test:apis`
7. Open a Pull Request

---

## 📄 License

MIT © ShilpSetu

---

<div align="center">
  Made with ❤️ for Indian artisans
</div>
