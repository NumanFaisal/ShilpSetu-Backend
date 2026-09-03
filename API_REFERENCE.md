# ShilpSetu Backend — API Reference (Postman Ready)

Complete list of every REST endpoint, its request body, and the response you should get.
Use this to test the API with **Postman**.

---

## Quick Start

| Item | Value |
|---|---|
| **Base URL** | `http://localhost:5001` |
| **Start server** | `PORT=5001 npx tsx src/index.ts` |
| **Auth header** | `Authorization: Bearer <JWT_TOKEN>` |
| **Default Admin** | phone `+919999999999` / password `MoSJE@Admin2026` |

### Authentication model
- Almost every route requires a JWT in the `Authorization` header.
- Public routes (storefront, QR, inquiries, studio styles, i18n, health) do **not**.
- Admin routes additionally require the user role to be `admin` (else `403`).
- Get a token from **sign-in**, **sign-up**, or the **OTP** flow.

> **Postman tip:** Create a Postman collection variable `baseUrl = http://localhost:5001`.
> After signing in, copy the returned `token` into a collection variable `token` and use
> `Authorization: Bearer {{token}}` as a header on every authenticated request.

---

## Table of Contents
1. [Health](#1-health)
2. [Auth](#2-auth) — signup / signin / OTP
3. [Studio Styles](#3-studio-styles)
4. [Public Storefront & B2B](#4-public-storefront--b2b)
5. [Artisan Inquiries](#5-artisan-inquiries)
6. [Marketplace Connections](#6-marketplace-connections)
7. [Publish Everywhere](#7-publish-everywhere)
8. [ONDC / GeM Exports](#8-ondc--gem-exports)
9. [Catalog PDF](#9-catalog-pdf)
10. [Image Processing](#10-image-processing)
11. [Admin & Analytics](#11-admin--analytics)
12. [i18n (Multilingual)](#12-i18n-multilingual)

---

## 1. Health

### `GET /health`
Public. Returns service status.

**Response 200**
```json
{
  "status": "ok",
  "timestamp": "2026-09-03T07:10:59.860Z"
}
```

---

## 2. Auth

All auth routes are **public** (no token needed).

### `POST /api/auth/signup`
Register a new user with phone + password.

**Body (JSON)**
```json
{
  "name": "Ramesh Kumar",
  "phone": "+919876543210",
  "password": "Artisan@123"
}
```
- `name`: required, 1–100 chars
- `phone`: required, 10–15 digits, optional `+` prefix
- `password`: required, 6–72 chars

**Response 201**
```json
{
  "message": "Account created successfully.",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "name": "Ramesh Kumar",
    "phone": "+919876543210",
    "role": "user",
    "language": "en",
    "createdAt": "2026-09-03T05:52:00.132292Z"
  }
}
```

**Errors:** `409` if phone already registered.

---

### `POST /api/auth/signin`
Log in with phone + password and get a JWT.

**Body (JSON)**
```json
{
  "phone": "+919999999999",
  "password": "MoSJE@Admin2026"
}
```

**Response 200**
```json
{
  "message": "Signed in successfully.",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 10,
    "name": "MoSJE Admin",
    "phone": "+919999999999",
    "role": "admin",
    "language": "en",
    "createdAt": "2026-09-03T05:52:00.132292Z"
  }
}
```

**Errors:** `401` if phone/password is wrong.

> **Postman:** copy `token` from the response into your `{{token}}` collection variable.

---

### `POST /api/auth/send-otp`
Request a 6-digit OTP for a phone number.

**Body (JSON)**
```json
{
  "phone": "+919700000001"
}
```

**Response 200**
```json
{
  "message": "OTP sent successfully.",
  "sent": true,
  "phone": "+919700000001"
}
```

> **Dev note:** the OTP code is **logged to the server console** (search for `OTP for +919700000001: 123456`). In production you'd wire this to SMS/WhatsApp.

---

### `POST /api/auth/verify-otp`
Verify the OTP and get a JWT. Auto-creates the account if the phone is new.

**Body (JSON)**
```json
{
  "phone": "+919700000001",
  "code": "123456",
  "name": "Priya Sharma"
}
```
- `code`: required, exactly 6 digits
- `name`: optional, only used when the phone is new

**Response 200**
```json
{
  "message": "OTP verified successfully.",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 11,
    "name": "Priya Sharma",
    "phone": "+919700000001",
    "role": "user",
    "language": "en",
    "createdAt": "2026-09-03T07:14:56.647167Z"
  }
}
```

**Errors:** `400` if no OTP sent, OTP expired, or wrong code.

---

## 3. Studio Styles

Both are **public**.

### `GET /api/studio-styles`
List all studio styles with base64 previews.

**Response 200**
```json
[
  {
    "id": "white_studio",
    "name": "White Studio",
    "preview": "data:image/png;base64,iVBORw0KGgo..."
  }
]
```
Styles: `white_studio`, `wooden_surface`, `marble_surface`, `luxury`.

### `GET /api/studio-styles/:styleId/preview`
Single style preview image.

**Response 200** — raw PNG image (`Content-Type: image/png`).

---

## 4. Public Storefront & B2B

All **public** (no token).

### `GET /api/public/stores/:slug`
View an artisan's public storefront.

**Example:** `GET /api/public/stores/master-artisan`

**Response 200**
```json
{
  "artisan": {
    "id": 1,
    "name": "Master Artisan",
    "storeName": "Master Artisan Studio",
    "bio": "Handcrafted terracotta pottery from Jaipur.",
    "location": "Jaipur",
    "state": "Rajasthan",
    "district": "Jaipur",
    "craftType": "Terracotta Pottery",
    "experience": 12
  },
  "products": [
    {
      "id": 1,
      "artisanId": 1,
      "name": "Artisan Craft #1",
      "description": null,
      "material": null,
      "category": "Handicraft",
      "price": 1499,
      "quantity": 50,
      "status": "published",
      "createdAt": "2026-08-31T11:35:56.487516Z",
      "images": [],
      "catalogue": null,
      "pricing": null,
      "imageUrl": "https://...r2.cloudflarestorage.com/.../final/1x1.jpg?...",
      "originalImageUrl": "https://.../originals/....jpg?..."
    }
  ]
}
```

**Errors:** `404` if the slug doesn't exist.

---

### `GET /api/public/stores/:slug/qr.png`
Generate a QR code pointing to the storefront.

**Example:** `GET /api/public/stores/master-artisan/qr.png`

**Response 200** — raw PNG image (`Content-Type: image/png`).

---

### `POST /api/public/inquiries`
Create a B2B (bulk) inquiry for an artisan.

**Body (JSON)**
```json
{
  "artisanId": 1,
  "productId": 1,
  "quantity": 100,
  "buyerName": "Retail Chain",
  "buyerEmail": "buyer@retail.in",
  "buyerPhone": "+919000000001",
  "targetPrice": 1200,
  "deliveryLocation": "Mumbai",
  "requiredDate": "2026-10-01T00:00:00Z",
  "message": "Interested in bulk terracotta order."
}
```
- `artisanId` (required), `productId` (required), `quantity` (required)
- Optional: `buyerName`, `buyerEmail`, `buyerPhone` (folded into the message), `targetPrice`, `deliveryLocation`, `requiredDate`, `message`

**Response 201**
```json
{
  "id": 2,
  "buyerId": 0,
  "artisanId": 1,
  "productId": 1,
  "quantity": 100,
  "targetPrice": 1200,
  "deliveryLocation": "Mumbai",
  "requiredDate": "2026-10-01T00:00:00Z",
  "message": "[Name: Retail Chain, Email: buyer@retail.in, Phone: +919000000001]\nInterested in bulk terracotta order.",
  "status": "PENDING",
  "createdAt": "2026-09-03T07:10:04.302356Z"
}
```

**Errors:** `400` if `artisanId`, `productId`, or `quantity` is missing.

---

## 5. Artisan Inquiries

Both require an **artisan JWT**.

### `GET /api/artisan/inquiries`
List all B2B inquiries received by the logged-in artisan.

**Headers:** `Authorization: Bearer {{token}}`

**Response 200**
```json
[
  {
    "id": 1,
    "buyerId": 0,
    "artisanId": 1,
    "productId": 1,
    "quantity": 100,
    "targetPrice": 1200,
    "deliveryLocation": "Mumbai",
    "requiredDate": null,
    "message": "[Name: Retail Chain, ...] Interested in bulk terracotta order.",
    "status": "ACCEPTED",
    "createdAt": "2026-09-03T05:45:16.667091Z"
  }
]
```

---

### `PATCH /api/inquiries/:id/status`
Accept / decline / complete an inquiry.

**Example:** `PATCH /api/inquiries/2/status`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON)**
```json
{
  "status": "ACCEPTED"
}
```
Allowed values: `ACCEPTED`, `DECLINED`, `COMPLETED`.

**Response 200**
```json
{
  "id": 2,
  "status": "ACCEPTED"
}
```

**Errors:** `400` invalid status; `404` inquiry not found.

---

## 6. Marketplace Connections

Require an **artisan JWT**.

### `GET /api/marketplaces/connections`
See which marketplaces the artisan has connected.

**Headers:** `Authorization: Bearer {{token}}`

**Response 200**
```json
[
  {
    "id": 1,
    "artisanId": 1,
    "marketplace": "ONDC",
    "status": "CONNECTED",
    "externalSellerId": "np-shilpsetu-001",
    "expiresAt": null,
    "metadata": null,
    "createdAt": "2026-09-03T05:45:44.553123Z",
    "updatedAt": "2026-09-03T05:45:44.53Z",
    "hasAccessToken": true,
    "hasRefreshToken": true
  }
]
```
> Tokens are **never** returned — only `hasAccessToken` / `hasRefreshToken` flags.

---

### `POST /api/marketplaces/:marketplace/connect`
Connect an artisan to a marketplace.

**Example:** `POST /api/marketplaces/ONDC/connect`

**Headers:** `Authorization: Bearer {{token}}`

**Marketplaces:** `AMAZON`, `FLIPKART`, `ONDC`, `GEM`

**Body per marketplace:**

| Marketplace | Required field | Example |
|---|---|---|
| **ONDC** | `npId` (participant/NP id) | `{ "npId": "np-shilpsetu-001" }` |
| **GEM** | `sellerId` | `{ "sellerId": "gem-seller-55" }` |
| **AMAZON** | `sellerId` (+ optional tokens) | `{ "sellerId": "A1B2C3", "accessToken": "...", "refreshToken": "...", "expiresAt": "2026-12-01T00:00:00Z", "metadata": { "marketplaceId": "ATVPDKIKX0DER" } }` |
| **FLIPKART** | `sellerId` (+ optional tokens) | `{ "sellerId": "FLIP-123" }` |

**Response 200**
```json
{
  "connected": true,
  "marketplace": "ONDC",
  "externalSellerId": "np-shilpsetu-001"
}
```

**Errors:** `400` unknown marketplace or missing required field.

---

### `POST /api/marketplaces/:marketplace/disconnect`
Disconnect a marketplace.

**Example:** `POST /api/marketplaces/ONDC/disconnect`

**Headers:** `Authorization: Bearer {{token}}`

**Response 200**
```json
{
  "disconnected": true,
  "marketplace": "ONDC"
}
```

**Errors:** `404` if no connection exists.

---

## 7. Publish Everywhere

Require an **artisan JWT**. Uses a **BullMQ queue** — the request returns immediately and the worker publishes in the background.

### `POST /api/products/:id/publish`
Queue a product for publishing to one or more marketplaces.

**Example:** `POST /api/products/1/publish`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON)**
```json
{
  "marketplaces": ["ONDC", "GEM", "AMAZON"]
}
```

**Response 200** (returns immediately, worker runs in background)
```json
{
  "queued": true,
  "results": [
    { "marketplace": "ONDC", "status": "PENDING" },
    { "marketplace": "GEM", "status": "PENDING" },
    { "marketplace": "AMAZON", "status": "PENDING" }
  ]
}
```

**Errors:** `400` if `marketplaces` is empty; `404` if product not found.

> **Note:** `AMAZON` / `FLIPKART` publish jobs will end `FAILED` with a "requires seller OAuth" message — that's expected (they're connect-stubs until real seller APIs exist). ONDC and GEM publish successfully.

---

### `GET /api/products/:id/marketplaces`
Check the publish status of a product on each marketplace.

**Example:** `GET /api/products/1/marketplaces`

**Headers:** `Authorization: Bearer {{token}}`

**Response 200**
```json
[
  {
    "id": 1,
    "productId": 1,
    "marketplace": "ONDC",
    "externalId": "ONDC-1",
    "status": "PUBLISHED",
    "errorMessage": null,
    "lastSyncedAt": "2026-09-03T05:46:29.442Z"
  },
  {
    "id": 2,
    "productId": 1,
    "marketplace": "GEM",
    "externalId": "GEM-1",
    "status": "PUBLISHED",
    "errorMessage": null,
    "lastSyncedAt": "2026-09-03T05:46:29.426Z"
  },
  {
    "id": 3,
    "productId": 1,
    "marketplace": "AMAZON",
    "externalId": null,
    "status": "FAILED",
    "errorMessage": "Amazon listing creation requires SP-API seller OAuth authorization, which is not configured yet.",
    "lastSyncedAt": null
  }
]
```

---

## 8. ONDC / GeM Exports

Require an **artisan JWT**. Return the product translated into each platform's native JSON schema.

### `GET /api/exports/ondc/:productId`
Export to ONDC `RET10` retail catalog schema.

**Example:** `GET /api/exports/ondc/1`

**Headers:** `Authorization: Bearer {{token}}`

**Response 200**
```json
{
  "context": {
    "domain": "ONDC:RET10",
    "country": "IND",
    "city": "*",
    "action": "on_search",
    "core_version": "1.2.0"
  },
  "message": {
    "catalog": {
      "bpp/providers": [
        {
          "id": "shilpsetu-1",
          "items": [
            {
              "id": "1",
              "descriptor": {
                "name": "Artisan Craft #1",
                "long_desc": "",
                "images": ["https://.../final/1x1.jpg"]
              },
              "price": { "currency": "INR", "value": "1499" },
              "quantity": { "available": 50 }
            }
          ]
        }
      ]
    }
  }
}
```

---

### `GET /api/exports/gem/:productId`
Export to GeM-compatible product schema.

**Example:** `GET /api/exports/gem/1`

**Headers:** `Authorization: Bearer {{token}}`

**Response 200**
```json
{
  "product": {
    "sku": "SHILPSETU-1",
    "title": "Artisan Craft #1",
    "description": "",
    "category": "Handicraft",
    "material": null,
    "unit": "Nos",
    "price": 1499,
    "quantity": 50,
    "currency": "INR",
    "keywords": [],
    "gstApplicable": false,
    "delivery": { "type": "FORWARD" }
  }
}
```

**Errors (both):** `404` if product not found.

---

## 9. Catalog PDF

Requires an **artisan JWT**. Generates a PDF catalog of an artisan's published products.

### `GET /api/catalog/:artisanId/pdf`
**Example:** `GET /api/catalog/1/pdf`

**Headers:** `Authorization: Bearer {{token}}`

**Response 200** — binary `application/pdf`
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="catalog-artisan-1.pdf"
```

> **Postman:** use **Send and Download** to save the PDF and open it.

---

## 10. Image Processing

All image routes require an **artisan JWT** (`Authorization: Bearer {{token}}`).

> Uses **free AI** (Gemini primary, Groq fallback) — no paid key needed.

### `POST /api/image-batches/upload`
**Direct upload** — multipart form-data with 1–4 images. This is the simplest way to test.

**Headers:** `Authorization: Bearer {{token}}`

**Body (form-data):**
| Key | Type | Value |
|---|---|---|
| `images` | File | your image (repeat for up to 4) |
| `style` | Text (optional) | `white_studio` (default), `wooden_surface`, `marble_surface`, `luxury` |
| `productId` | Text (optional) | existing product id to attach images to |

**Response 201**
```json
{
  "message": "Batch created and 1 images queued for AI processing.",
  "batchId": "0dfd8375-98c1-498e-bc5f-afd7c72a8a90",
  "status": "PROCESSING",
  "totalImages": 1,
  "images": [
    {
      "imageId": "786fcabb-1eb3-4993-b213-4fd7a4cc42dd",
      "storageKey": "shilpsetu/users/1/batches/0dfd8375-.../originals/786fcabb-....jpg"
    }
  ]
}
```

---

### `GET /api/image-batches/:batchId`
Poll the batch status while processing runs (COMPLETED / PROCESSING / FAILED).

**Headers:** `Authorization: Bearer {{token}}`

**Response 200**
```json
{
  "batchId": "0dfd8375-98c1-498e-bc5f-afd7c72a8a90",
  "status": "COMPLETED",
  "style": "white_studio",
  "totalImages": 1,
  "completedImages": 1,
  "failedImages": 0,
  "createdAt": "2026-09-03T07:12:33.409833Z",
  "updatedAt": "2026-09-03T07:12:33.409833Z",
  "images": [
    {
      "imageId": "786fcabb-...",
      "status": "COMPLETED",
      "currentStep": "COMPLETED",
      "progress": 100,
      "error": null,
      "validationScore": 1,
      "outputs": {
        "square": "https://.../final/1x1.jpg?..."
      }
    }
  ]
}
```

---

### `POST /api/image-batches`
Create a **presigned upload session** (uploads happen directly to R2).

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON)**
```json
{
  "imageCount": 1,
  "productId": 1,
  "style": "white_studio"
}
```
- `imageCount`: required, 1–4
- `productId`: optional
- `style`: optional, default `white_studio`

**Response 201**
```json
{
  "batchId": "abc-123...",
  "images": [
    {
      "imageId": "img-456...",
      "uploadUrl": "https://...r2.cloudflarestorage.com/...?X-Amz-Signature=...",
      "objectKey": "shilpsetu/.../originals/img-456....jpg"
    }
  ]
}
```
> Upload each file via `PUT` to its `uploadUrl`, then call `/complete`.

### `POST /api/image-batches/:batchId/complete`
Verify uploads exist in R2 and queue AI processing.

**Headers:** `Authorization: Bearer {{token}}`

**Response 200**
```json
{
  "message": "Batch upload verified. Background image processing queued.",
  "batchId": "abc-123...",
  "status": "PROCESSING"
}
```

---

### `POST /api/image-batches/:batchId/cancel`
Cancel a queued/running batch.

**Response 200**
```json
{ "message": "Batch cancelled successfully.", "batchId": "abc-123..." }
```

### `POST /api/image-batches/:batchId/images/:imageId/retry`
Re-queue a failed image.

**Response 200**
```json
{ "message": "Image processing queued for retry.", "imageId": "img-456..." }
```

### `GET /api/image-batches/:batchId/images/:imageId`
Single image detail + versions.

**Response 200**
```json
{
  "imageId": "img-456...",
  "status": "COMPLETED",
  "currentStep": "COMPLETED",
  "progress": 100,
  "analysis": { "productType": "...", "material": "..." },
  "boundingBox": { "x": 200, "y": 150, "width": 600, "height": 700 },
  "validationScore": 1,
  "outputs": { "square": "https://.../final/1x1.jpg" },
  "versions": [
    { "step": "cutout", "storageKey": "...", "url": "https://..." }
  ]
}
```

### `GET /api/image-batches/:batchId/images/:imageId/download`
Signed download URLs for final formats.

**Response 200**
```json
{
  "imageId": "img-456...",
  "downloadUrls": { "square": "https://...?X-Amz-Signature=..." }
}
```

---

## 11. Admin & Analytics

All admin routes require an **admin JWT** (user role must be `admin`).
- No token → `401`
- Non-admin token → `403`

### `GET /api/admin/dashboard`
Combined onboarding + economics + marketplace overview.

**Response 200**
```json
{
  "onboarding": {
    "totalArtisans": 1,
    "publishedProducts": 1,
    "regional": [ { "state": "Rajasthan", "count": 1 } ]
  },
  "economics": {
    "estimatedRevenue": 0,
    "avgListingPrice": 1499,
    "matchedInquiries": 1
  },
  "marketplaces": {
    "connectedArtisans": 2,
    "connectionsByPlatform": { "ONDC": 1, "AMAZON": 1 },
    "totalListings": 3,
    "publishByPlatform": {
      "GEM": { "total": 1, "published": 1, "failed": 0, "pending": 0 },
      "ONDC": { "total": 1, "published": 1, "failed": 0, "pending": 0 },
      "AMAZON": { "total": 1, "published": 0, "failed": 1, "pending": 0 }
    }
  }
}
```

### `GET /api/admin/artisans`
List all artisans (with their linked user).

### `GET /api/admin/products`
List all products (with their artisan).

### `GET /api/admin/inquiries`
List all B2B inquiries.

### `GET /api/admin/revenue`
Economics stats: `estimatedRevenue`, `avgListingPrice`, `matchedInquiries`.

### `GET /api/admin/regional`
Onboarding stats grouped by state.

### `GET /api/admin/marketplaces`
Marketplace connection + listing health.

---

## 12. i18n (Multilingual)

### `GET /api/i18n/:lang`
Get the translation bundle for a language. **Public.**

Supported langs: `en`, `hi`, `bn`, `ta`, `te`, `mr`, `gu`, `kn`.

**Example:** `GET /api/i18n/hi`

**Response 200**
```json
{
  "lang": "hi",
  "translations": {
    "appName": "शिल्पसेतु",
    "storefront": "स्टोरफ्रंट",
    "products": "उत्पाद",
    "welcome": "शिल्पसेतु में आपका स्वागत है",
    "price": "मूल्य",
    "...": "..."
  }
}
```

**Errors:** `404` for unsupported languages (e.g. `/api/i18n/fr`).

---

## Common Error Format
Every non-2xx response uses this shape:
```json
{ "error": "A human-readable message" }
```
Common codes:
- `400` — bad input / validation / missing field
- `401` — missing or invalid token (must sign in)
- `403` — authenticated but wrong role (e.g. non-admin on admin route)
- `404` — resource not found (or wrong URL path)
- `409` — duplicate (e.g. phone already registered)
- `413` — file too large (max 10 MB per image)
- `500` — server error

---

## Route Summary Table

| Method | Path | Auth | Body |
|---|---|---|---|
| GET | `/health` | – | – |
| POST | `/api/auth/signup` | – | name, phone, password |
| POST | `/api/auth/signin` | – | phone, password |
| POST | `/api/auth/send-otp` | – | phone |
| POST | `/api/auth/verify-otp` | – | phone, code [, name] |
| GET | `/api/studio-styles` | – | – |
| GET | `/api/studio-styles/:styleId/preview` | – | – |
| GET | `/api/public/stores/:slug` | – | – |
| GET | `/api/public/stores/:slug/qr.png` | – | – |
| POST | `/api/public/inquiries` | – | artisanId, productId, quantity, ... |
| GET | `/api/artisan/inquiries` | ✅ | – |
| PATCH | `/api/inquiries/:id/status` | ✅ | status |
| GET | `/api/marketplaces/connections` | ✅ | – |
| POST | `/api/marketplaces/:marketplace/connect` | ✅ | per-marketplace |
| POST | `/api/marketplaces/:marketplace/disconnect` | ✅ | – |
| POST | `/api/products/:id/publish` | ✅ | marketplaces[] |
| GET | `/api/products/:id/marketplaces` | ✅ | – |
| GET | `/api/exports/ondc/:productId` | ✅ | – |
| GET | `/api/exports/gem/:productId` | ✅ | – |
| GET | `/api/catalog/:artisanId/pdf` | ✅ | – |
| POST | `/api/image-batches/upload` | ✅ | multipart (images) |
| POST | `/api/image-batches` | ✅ | imageCount [, productId, style] |
| POST | `/api/image-batches/:batchId/complete` | ✅ | – |
| GET | `/api/image-batches/:batchId` | ✅ | – |
| POST | `/api/image-batches/:batchId/cancel` | ✅ | – |
| POST | `/api/image-batches/:batchId/images/:imageId/retry` | ✅ | – |
| GET | `/api/image-batches/:batchId/images/:imageId` | ✅ | – |
| GET | `/api/image-batches/:batchId/images/:imageId/download` | ✅ | – |
| GET | `/api/admin/dashboard` | ✅ admin | – |
| GET | `/api/admin/artisans` | ✅ admin | – |
| GET | `/api/admin/products` | ✅ admin | – |
| GET | `/api/admin/inquiries` | ✅ admin | – |
| GET | `/api/admin/revenue` | ✅ admin | – |
| GET | `/api/admin/regional` | ✅ admin | – |
| GET | `/api/admin/marketplaces` | ✅ admin | – |
| GET | `/api/i18n/:lang` | – | – |
