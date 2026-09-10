# ShilpSetu API — Postman Testing Guide

This guide explains how to test every route in the **ShilpSetu Backend** using Postman.

A pre-configured Postman Collection file is already prepared in the backend root:
📁 [`ShilpSetu.postman_collection.json`](./ShilpSetu.postman_collection.json)

---

## 🚀 Method 1: 1-Click Import (Recommended)

1. Open **Postman**.
2. Click the **Import** button in the top-left corner.
3. Select or drag-and-drop the file [`ShilpSetu.postman_collection.json`](./ShilpSetu.postman_collection.json) from this repository.
4. The collection **"ShilpSetu API Collection"** will appear in your sidebar with all folders, pre-filled request bodies, headers, and test scripts.
5. Make sure the backend server is running locally:
   ```bash
   npm run dev
   # Running on http://localhost:5001
   ```

---

## 🛠️ Method 2: Manual Environment Setup

If you prefer configuring Postman manually, set up a Postman Environment:

### 1. Create Environment Variables
In Postman, click **Environments** > **Create Environment** (named `ShilpSetu Local`):

| Variable | Initial Value | Current Value |
|---|---|---|
| `baseUrl` | `http://localhost:5001` | `http://localhost:5001` |
| `artisanToken` | *(leave blank initially)* | *(auto-populated)* |
| `buyerToken` | *(leave blank initially)* | *(auto-populated)* |

### 2. Auto-Save Tokens (Postman Tests Script)
In the **Tests** tab of your registration/login requests, paste this snippet so you never have to copy-paste tokens manually:

```javascript
var response = pm.response.json();
var token = response.token || response.accessToken || (response.data && response.data.token);

if (token) {
    if (pm.request.body && pm.request.body.raw.includes('"artisan"')) {
        pm.environment.set("artisanToken", token);
        console.log("Saved artisanToken:", token);
    } else {
        pm.environment.set("buyerToken", token);
        console.log("Saved buyerToken:", token);
    }
}
```

---

## 🔄 End-to-End Testing Workflow

Follow this logical sequence to test all core modules in under 5 minutes:

```
[1. Health Check] ➔ [2. Register Seller & Buyer] ➔ [3. Create & Publish Product]
                         ➔ [4. Discover Product] ➔ [5. Place Order & Track Milestones]
```

---

### Phase 1: Health & Authentication

#### 1. Server Health Check
- **Method**: `GET`
- **URL**: `{{baseUrl}}/health`
- **Headers**: None
- **Expected Response (`200 OK`)**:
  ```json
  {
    "status": "ok",
    "timestamp": "2026-09-10T14:30:00.000Z"
  }
  ```

#### 2. Register Seller (Artisan)
- **Method**: `POST`
- **URL**: `{{baseUrl}}/api/auth/register` (or `/api/auth/signup`)
- **Headers**: `Content-Type: application/json`
- **Body (`raw JSON`)**:
  ```json
  {
    "name": "Ramesh Kumar",
    "email": "ramesh.artisan@example.com",
    "password": "Password123!",
    "role": "artisan"
  }
  ```
- **Expected Response (`201 Created`)**:
  ```json
  {
    "message": "Account created successfully.",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "name": "Ramesh Kumar",
      "role": "artisan"
    }
  }
  ```
  *(The test script automatically copies this into `{{artisanToken}}`)*.

#### 3. Register Buyer
- **Method**: `POST`
- **URL**: `{{baseUrl}}/api/auth/register`
- **Headers**: `Content-Type: application/json`
- **Body (`raw JSON`)**:
  ```json
  {
    "name": "Ananya Sharma",
    "email": "ananya.buyer@example.com",
    "password": "Password123!",
    "role": "buyer"
  }
  ```
  *(The test script automatically copies this into `{{buyerToken}}`)*.

#### 4. Sign In (Alternative to Register)
- **Method**: `POST`
- **URL**: `{{baseUrl}}/api/auth/login` (or `/api/auth/signin`)
- **Body (`raw JSON`)**:
  ```json
  {
    "email": "ramesh.artisan@example.com",
    "password": "Password123!"
  }
  ```

---

### Phase 2: User & Artisan Profiles

#### 1. Get Artisan Profile & Live Metrics
- **Method**: `GET`
- **URL**: `{{baseUrl}}/api/artisans/me`
- **Headers**: `Authorization: Bearer {{artisanToken}}`
- **Expected Response (`200 OK`)**:
  ```json
  {
    "id": 1,
    "userId": 1,
    "name": "Ramesh Kumar",
    "storeName": "Ramesh Kumar's Studio",
    "craftType": "Handicrafts",
    "crafts": ["Handicrafts"],
    "rating": 4.8,
    "reviewCount": 124,
    "productsCount": 0,
    "activeOrders": 0,
    "totalEarnings": 0,
    "verified": true,
    "portfolio": []
  }
  ```

#### 2. Get Buyer Profile & Activity Summary
- **Method**: `GET`
- **URL**: `{{baseUrl}}/api/users/me`
- **Headers**: `Authorization: Bearer {{buyerToken}}`
- **Expected Response (`200 OK`)**:
  ```json
  {
    "id": 2,
    "name": "Ananya Sharma",
    "role": "buyer",
    "buyerProfile": {
      "companyName": "Ananya Sharma",
      "location": "New Delhi, India",
      "totalOrders": 0,
      "artisansConnected": 0,
      "activeRequests": 0,
      "preferences": ["Eco-friendly", "Handloom Textiles"]
    }
  }
  ```

#### 3. Update Profile (Name / Language)
- **Method**: `PATCH`
- **URL**: `{{baseUrl}}/api/users/me`
- **Headers**: 
  - `Authorization: Bearer {{buyerToken}}`
  - `Content-Type: application/json`
- **Body (`raw JSON`)**:
  ```json
  {
    "name": "Ananya Sharma (Verified Buyer)",
    "language": "hi"
  }
  ```

---

### Phase 3: Product Publishing (Seller / Artisan)

#### 1. Create a Draft Product
- **Method**: `POST`
- **URL**: `{{baseUrl}}/api/products`
- **Headers**: 
  - `Authorization: Bearer {{artisanToken}}`
  - `Content-Type: application/json`
- **Body (`raw JSON`)**:
  ```json
  {
    "name": "Handcrafted Jaipur Blue Pottery Floral Vase",
    "category": "pottery",
    "craftType": "Blue Pottery",
    "description": "Authentic Jaipur floral vase handmade with quartz and natural cobalt glaze.",
    "price": 1850,
    "quantity": 25,
    "material": "Quartz, Raw Glaze",
    "origin": "Jaipur, Rajasthan",
    "dimensions": "12 × 10 inches",
    "weight": "650 grams",
    "images": [
      "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=600"
    ]
  }
  ```
- **Expected Response (`201 Created`)**:
  ```json
  {
    "message": "Product created as a draft.",
    "product": {
      "id": 1,
      "name": "Handcrafted Jaipur Blue Pottery Floral Vase",
      "price": 1850,
      "quantity": 25,
      "status": "draft"
    }
  }
  ```

#### 2. List Artisan's Own Products
- **Method**: `GET`
- **URL**: `{{baseUrl}}/api/products`
- **Headers**: `Authorization: Bearer {{artisanToken}}`

#### 3. Update Product Stock or Price
- **Method**: `PATCH`
- **URL**: `{{baseUrl}}/api/products/1`
- **Headers**: 
  - `Authorization: Bearer {{artisanToken}}`
  - `Content-Type: application/json`
- **Body (`raw JSON`)**:
  ```json
  {
    "price": 1950,
    "quantity": 30
  }
  ```

#### 4. Publish Product to External Channels (ONDC / GeM)
- **Method**: `POST`
- **URL**: `{{baseUrl}}/api/products/1/publish`
- **Headers**: 
  - `Authorization: Bearer {{artisanToken}}`
  - `Content-Type: application/json`
- **Body (`raw JSON`)**:
  ```json
  {
    "marketplaces": ["ONDC", "GEM", "AMAZON_SAHELI"]
  }
  ```

---

### Phase 4: Product Discovery (Buyer)

#### 1. Public Cross-Store Search
- **Method**: `GET`
- **URL**: `{{baseUrl}}/api/marketplace/search?q=pottery&category=pottery&minPrice=500&maxPrice=3000&page=1&pageSize=10`
- **Headers**: None *(Public endpoint)*
- **Expected Response (`200 OK`)**:
  ```json
  {
    "total": 1,
    "page": 1,
    "pageSize": 10,
    "items": [
      {
        "id": 1,
        "name": "Handcrafted Jaipur Blue Pottery Floral Vase",
        "price": 1950,
        "artisanName": "Ramesh Kumar",
        "artisanLocation": "Jaipur, Rajasthan",
        "matchScore": 94,
        "images": ["https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=600"]
      }
    ]
  }
  ```

#### 2. View Product Details (with GI Certifications)
- **Method**: `GET`
- **URL**: `{{baseUrl}}/api/marketplace/products/1`
- **Headers**: None *(Public endpoint)*
- **Key Fields Returned**: `origin`, `dimensions`, `weight`, `certifications: ["Handmade in India", "GI Tagged"]`, `artisanName`, `pricing`.

#### 3. Public Artisan Storefront & QR Code
- **Storefront**: `GET {{baseUrl}}/api/public/stores/ramesh-kumar-1`
- **Storefront QR Code Image**: `GET {{baseUrl}}/api/public/stores/ramesh-kumar-1/qr.png`

---

### Phase 5: Order Placement & Milestone Tracking

#### 1. Buyer Places an Order
- **Method**: `POST`
- **URL**: `{{baseUrl}}/api/orders`
- **Headers**: 
  - `Authorization: Bearer {{buyerToken}}`
  - `Content-Type: application/json`
- **Body (`raw JSON`)**:
  ```json
  {
    "productId": 1,
    "quantity": 2,
    "deliveryAddress": "Flat 402, Lotus Heights, Bengaluru, Karnataka 560038",
    "notes": "Please pack with double bubble wrap for fragile ceramic delivery."
  }
  ```
- **Expected Response (`201 Created`)**:
  ```json
  {
    "message": "Order placed successfully.",
    "order": {
      "id": 1,
      "displayId": "#SS1",
      "totalAmount": 3900,
      "advancePaid": 1170,
      "balanceDue": 2730,
      "status": "CONFIRMED",
      "statusLabel": "Order Confirmed",
      "expectedDeliveryLabel": "Expected by 24 Sept",
      "milestones": [
        { "label": "Order Confirmed", "done": true, "current": true },
        { "label": "Materials Sourced", "done": false, "current": false },
        { "label": "Production Started", "done": false, "current": false },
        { "label": "Quality Check & Packed", "done": false, "current": false },
        { "label": "Shipped", "done": false, "current": false },
        { "label": "Delivered", "done": false, "current": false }
      ]
    }
  }
  ```

#### 2. Buyer Views Past Orders
- **Method**: `GET`
- **URL**: `{{baseUrl}}/api/orders/buyer`
- **Headers**: `Authorization: Bearer {{buyerToken}}`

#### 3. Artisan Views Incoming Orders
- **Method**: `GET`
- **URL**: `{{baseUrl}}/api/orders`
- **Headers**: `Authorization: Bearer {{artisanToken}}`

#### 4. Seller Advances Order Status
- **Method**: `PATCH`
- **URL**: `{{baseUrl}}/api/orders/1/status`
- **Headers**: 
  - `Authorization: Bearer {{artisanToken}}`
  - `Content-Type: application/json`
- **Body (`raw JSON`)**:
  ```json
  {
    "status": "IN_PRODUCTION"
  }
  ```
  *(Then later set `"status": "SHIPPED"` or `"status": "DELIVERED"`)*.

#### 5. Track Order Detail & Live Milestones
- **Method**: `GET`
- **URL**: `{{baseUrl}}/api/orders/1`
- **Headers**: `Authorization: Bearer {{buyerToken}}` (or `Bearer {{artisanToken}}`)
- Verifies that `status` updated to `IN_PRODUCTION`, and milestone index 2 is now `current: true`.

---

### Phase 6: AI Services & Value-Add Tools

#### 1. AI Pricing Estimate (Live Market Search via Tavily)
- **Method**: `POST`
- **URL**: `{{baseUrl}}/api/pricing/estimate`
- **Headers**: `Content-Type: application/json`
- **Body (`raw JSON`)**:
  ```json
  {
    "title": "Chanderi Silk Handloom Saree",
    "category": "textile",
    "material": "Pure Silk and Zari",
    "hoursSpent": 36,
    "materialCost": 2800
  }
  ```
- **Expected Response**:
  Calculates suggested retail price, artisan wage, profit margins, and price points from live web benchmark comparisons.

#### 2. Submit B2B Custom Quote Inquiry
- **Method**: `POST`
- **URL**: `{{baseUrl}}/api/public/inquiries`
- **Body (`raw JSON`)**:
  ```json
  {
    "artisanId": 1,
    "productId": 1,
    "buyerName": "FabIndia Sourcing Desk",
    "buyerPhone": "+919811223344",
    "quantity": 100,
    "targetPrice": 1600,
    "message": "Bulk wholesale festive stock inquiry."
  }
  ```

#### 3. List Studio Preset Styles
- **Method**: `GET`
- **URL**: `{{baseUrl}}/api/studio-styles`
- **Expected Response**:
  Array of preset photoshoot background styles (e.g. `minimalist`, `festive_diwali`, `rustic_wood`, `marble_luxury`).

---

## 📋 Complete Route Reference Table (71 Unique Routes)

| # | Method | Path | Auth | Purpose |
|---|---|---|---|---|
| 1 | `GET` | `/health` | None | Server health status |
| 2 | `POST` | `/api/auth/register` | None | Create account (`artisan` or `buyer`) |
| 3 | `POST` | `/api/auth/login` | None | Sign in with password |
| 4 | `POST` | `/api/auth/send-otp` | None | Send OTP to mobile phone |
| 5 | `POST` | `/api/auth/verify-otp` | None | Verify mobile OTP and auto-login |
| 6 | `POST` | `/api/auth/profile` | Bearer | Setup profile after signup |
| 7 | `GET` | `/api/users/me` | Bearer | Current user profile with buyer context |
| 8 | `PATCH` | `/api/users/me` | Bearer | Update profile name and language |
| 9 | `POST` | `/api/artisans` | Bearer | Onboard artisan profile |
| 10 | `GET` | `/api/artisans/me` | Bearer | Get seller metrics, rating, earnings |
| 11 | `PATCH` | `/api/artisans/me` | Bearer | Update seller store bio and location |
| 12 | `POST` | `/api/products` | Bearer | Create new draft product |
| 13 | `GET` | `/api/products` | Bearer | List artisan's own inventory |
| 14 | `GET` | `/api/products/:id` | Bearer | Get single product owned by artisan |
| 15 | `PATCH` | `/api/products/:id` | Bearer | Update product details or stock |
| 16 | `DELETE` | `/api/products/:id` | Bearer | Delete product |
| 17 | `POST` | `/api/products/:id/publish` | Bearer | Publish to external marketplaces |
| 18 | `GET` | `/api/products/:id/marketplaces` | Bearer | Get sync status on channels |
| 19 | `POST` | `/api/orders` | Bearer | Buyer places a new order |
| 20 | `GET` | `/api/orders/buyer` | Bearer | Buyer past order history |
| 21 | `GET` | `/api/orders` | Bearer | Artisan incoming orders |
| 22 | `GET` | `/api/orders/:id` | Bearer | Dual-role order details & 6 milestones |
| 23 | `PATCH` | `/api/orders/:id/status` | Bearer | Update fulfillment status |
| 24 | `GET` | `/api/marketplace/search` | None | Public search across published items |
| 25 | `GET` | `/api/marketplace/products/:id` | None | Public product detail with GI specs |
| 26 | `GET` | `/api/public/stores/:slug` | None | Public artisan storefront |
| 27 | `GET` | `/api/public/stores/:slug/qr.png` | None | Storefront QR code image |
| 28 | `POST` | `/api/public/inquiries` | None | Public buyer B2B inquiry |
| 29 | `GET` | `/api/artisan/inquiries` | Bearer | Artisan views received inquiries |
| 30 | `PATCH` | `/api/inquiries/:id/status` | Bearer | Accept or reject B2B inquiry |
| 31 | `GET` | `/api/marketplaces/connections` | Bearer | List active channel connections |
| 32 | `POST` | `/api/marketplaces/:marketplace/connect` | Bearer | Connect ONDC/GeM credentials |
| 33 | `POST` | `/api/marketplaces/:marketplace/disconnect` | Bearer | Disconnect marketplace channel |
| 34 | `GET` | `/api/buyer/requests` | None | Browse public bulk buyer requests |
| 35 | `POST` | `/api/buyer/requests` | Bearer | Post a custom wholesale request |
| 36 | `GET` | `/api/buyer/requests/:id` | None | View buyer custom request detail |
| 37 | `POST` | `/api/offers` | Bearer | Artisan submits quote on buyer request |
| 38 | `POST` | `/api/pricing/estimate` | None | AI price recommendation algorithm |
| 39 | `GET` | `/api/pricing/:productId` | None | Retrieve pricing data for product |
| 40 | `POST` | `/api/pricing/:productId/save` | Bearer | Save finalized pricing to product |
| 41 | `POST` | `/api/voice/process` | None | Audio speech-to-text processing |
| 42 | `GET` | `/api/voice/:productId` | None | Voice metadata for product |
| 43 | `POST` | `/api/catalog/generate` | None | Generate AI product description |
| 44 | `GET` | `/api/catalog/:productId` | None | Get generated catalog entry |
| 45 | `POST` | `/api/catalog/:productId/save` | Bearer | Save AI catalog entry |
| 46 | `GET` | `/api/catalog/:artisanId/pdf` | Bearer | Download PDF product catalog |
| 47 | `GET` | `/api/studio-styles` | None | List studio photoshoot presets |
| 48 | `GET` | `/api/studio-styles/:styleId/preview` | None | Thumbnail for preset background |
| 49 | `POST` | `/api/image-batches/upload` | Optional | Upload single base64 image |
| 50 | `POST` | `/api/image-batches` | Optional | Create multipart image batch |
| 51 | `GET` | `/api/image-batches/:batchId` | Optional | Poll status of image batch |
| 52 | `POST` | `/api/image-batches/:batchId/complete` | Optional | Mark image batch completed |
| 53 | `POST` | `/api/image-batches/:batchId/cancel` | Optional | Cancel processing batch |
| 54 | `GET` | `/api/image-batches/:batchId/images/:imageId` | Optional | Get single image item details |
| 55 | `GET` | `/api/image-batches/:batchId/images/:imageId/download` | Optional | Download high-res output image |
| 56 | `POST` | `/api/image-batches/:batchId/images/:imageId/retry` | Optional | Retry enhancement job |
| 57 | `GET` | `/api/exports/ondc/:productId` | Bearer | Export schema for ONDC protocol |
| 58 | `GET` | `/api/exports/gem/:productId` | Bearer | Export schema for GeM portal |
| 59 | `GET` | `/api/i18n/:lang` | None | UI translation strings dictionary |
| 60 | `GET` | `/api/admin/dashboard` | Admin | Overall marketplace GMV & stats |
| 61 | `GET` | `/api/admin/artisans` | Admin | List all registered artisans |
| 62 | `GET` | `/api/admin/products` | Admin | Review all platform products |
| 63 | `GET` | `/api/admin/revenue` | Admin | Commission & payout analytics |
| 64 | `GET` | `/api/admin/inquiries` | Admin | Track platform-wide B2B quotes |
| 65 | `GET` | `/api/admin/regional` | Admin | Geographical distribution stats |
| 66 | `GET` | `/api/admin/marketplaces` | Admin | Multi-channel sync health |
| 67 | `POST` | `/api/auth/signup` | None | Alias for `/api/auth/register` |
| 68 | `POST` | `/api/auth/signin` | None | Alias for `/api/auth/login` |
| 69 | `POST` | `/api/estimate` | None | Alias for `/api/pricing/estimate` |
| 70 | `POST` | `/api/process` | None | Alias for `/api/voice/process` |
| 71 | `POST` | `/api/generate` | None | Alias for `/api/catalog/generate` |

---

## 💡 Tips & Common Gotchas

1. **Authentication Token**:
   - In Postman, requests that require login need the header:
     `Authorization: Bearer <your_token>`
   - If using the collection, `{{artisanToken}}` and `{{buyerToken}}` are auto-injected.

2. **CORS & Headers**:
   - The backend includes global CORS support, meaning you can also test requests directly from the browser Console via `fetch()`.

3. **Case-Insensitive Roles**:
   - The backend accepts `"artisan"`, `"ARTISAN"`, `"buyer"`, `"BUYER"`.

4. **Temporal Polyfill Dates**:
   - Dates returned by the backend adhere to ISO-8601 formatting (`YYYY-MM-DDTHH:mm:ss.sssZ`), matching standard JavaScript `Date` and React Native state parsers.
