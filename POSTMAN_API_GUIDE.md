# ShilpSetu — Complete Postman API Testing Guide

This guide gives you copy-pasteable requests and expected responses for **every endpoint across all 5 components** in `ShilpSetu-Backend`.

---

## ⚡ Quick Start & Configuration

| Parameter | Default Value | Notes |
|---|---|---|
| **Base URL** | `http://localhost:5001` | If running on port 4000, change to `http://localhost:4000` |
| **Default Admin Phone** | `+919999999999` | Password: `MoSJE@Admin2026` |
| **Auth Header** | `Authorization: Bearer <TOKEN>` | Required on routes marked with 🔒 |

> [!TIP]
> **Postman Environment Variable**: Set a variable `baseUrl = http://localhost:5001`. Once you sign in, copy the returned `token` into a variable `token` so you can use `Authorization: Bearer {{token}}` across all requests.

---

## 📋 Table of Contents
1. [Authentication & Onboarding](#1-authentication--onboarding)
2. [Component 1: AI Image Enhancer & Studio](#2-component-1-ai-image-enhancer--studio)
3. [Component 2: Multilingual Auto-Cataloger (Voice-to-Listing)](#3-component-2-multilingual-auto-cataloger-voice-to-listing)
4. [Component 3: Dynamic ML Pricing Assistant](#4-component-3-dynamic-ml-pricing-assistant)
5. [Component 4: Storefront & Market Linkage](#5-component-4-storefront--market-linkage)
6. [Component 5: MoSJE Admin & Impact Analytics](#6-component-5-mosje-admin--impact-analytics)
7. [Health & System Check](#7-health--system-check)

---

## 1. Authentication & Onboarding

### 1.1 Sign In (Get JWT Token)
* **Method:** `POST`
* **URL:** `{{baseUrl}}/api/auth/signin`
* **Headers:** `Content-Type: application/json`
* **Body (raw JSON):**
```json
{
  "phone": "+919999999999",
  "password": "MoSJE@Admin2026"
}
```
* **Response (200 OK):**
```json
{
  "message": "Signed in successfully.",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "name": "MoSJE Admin",
    "phone": "+919999999999",
    "role": "admin",
    "language": "en"
  }
}
```
*(Copy the `token` for subsequent authenticated requests)*

---

### 1.2 Sign Up (Register New Artisan)
* **Method:** `POST`
* **URL:** `{{baseUrl}}/api/auth/signup`
* **Headers:** `Content-Type: application/json`
* **Body (raw JSON):**
```json
{
  "name": "Sita Devi",
  "phone": "+919876543210",
  "password": "Artisan@123"
}
```
* **Response (201 Created):**
```json
{
  "message": "Account created successfully.",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 2,
    "name": "Sita Devi",
    "phone": "+919876543210",
    "role": "user"
  }
}
```

---

### 1.3 Send OTP
* **Method:** `POST`
* **URL:** `{{baseUrl}}/api/auth/send-otp`
* **Headers:** `Content-Type: application/json`
* **Body (raw JSON):**
```json
{
  "phone": "+919876543210"
}
```
* **Response (200 OK):**
```json
{
  "message": "OTP sent successfully.",
  "sent": true,
  "phone": "+919876543210"
}
```
*(In development, check the server terminal logs for the 6-digit OTP code)*

---

### 1.4 Verify OTP
* **Method:** `POST`
* **URL:** `{{baseUrl}}/api/auth/verify-otp`
* **Headers:** `Content-Type: application/json`
* **Body (raw JSON):**
```json
{
  "phone": "+919876543210",
  "code": "123456",
  "name": "Sita Devi"
}
```

---

## 2. Component 1: AI Image Enhancer & Studio

### 2.1 List Studio Styles
* **Method:** `GET`
* **URL:** `{{baseUrl}}/api/studio-styles`
* **Headers:** None (Public)
* **Response (200 OK):**
```json
[
  {
    "id": "white_studio",
    "name": "White Studio",
    "preview": "data:image/png;base64,..."
  },
  {
    "id": "wooden_surface",
    "name": "Wooden Surface",
    "preview": "data:image/png;base64,..."
  },
  {
    "id": "marble_surface",
    "name": "Marble Surface",
    "preview": "data:image/png;base64,..."
  },
  {
    "id": "luxury",
    "name": "Luxury Studio",
    "preview": "data:image/png;base64,..."
  }
]
```

---

### 2.2 Get Style Preview Image
* **Method:** `GET`
* **URL:** `{{baseUrl}}/api/studio-styles/white_studio/preview`
* **Response (200 OK):** Raw PNG preview image.

---

### 2.3 Upload Batch Direct (AI Background Removal & Studio Lighting) 🔒
* **Method:** `POST`
* **URL:** `{{baseUrl}}/api/image-batches/upload`
* **Headers:**
  - `Authorization: Bearer {{token}}`
* **Body (`form-data`):**
  - `images`: Select 1 to 4 image files (`.jpg`, `.png`, `.webp`)
  - `style`: `white_studio` (or `wooden_surface`, `marble_surface`, `luxury`)
* **Response (201 Created):**
```json
{
  "message": "Batch created and 1 images queued for AI processing.",
  "batchId": "b182fb04-5147-4e6a-bf0c-e2f9d6c79a95",
  "totalImages": 1
}
```

---

### 2.4 Get Batch Processing Status 🔒
* **Method:** `GET`
* **URL:** `{{baseUrl}}/api/image-batches/:batchId`
* **Headers:**
  - `Authorization: Bearer {{token}}`

---

## 3. Component 2: Multilingual Auto-Cataloger (Voice-to-Listing)

### 3.1 Process Voice Note Recording
* **Method:** `POST`
* **URL:** `{{baseUrl}}/api/voice/process`
* **Headers:** None (Public / Hybrid)
* **Body (`form-data`):**
  - `audio`: Select an audio file (`.m4a`, `.mp3`, `.wav`, `.webm`, `.ogg`)
  - `productId`: `1` *(optional: links recording to product in database)*
* **Description:** Employs Whisper STT to transcribe regional speech (Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Hinglish) and extracts structured craft attributes via NLP.
* **Response (200 OK):**
```json
{
  "transcription": "यह शुद्ध हाथ से बना मिट्टी का फूलदान है जिस पर पारंपरिक नक्काशी की गई है",
  "englishTranscription": "This is a pure handmade terracotta flower vase with traditional carving work.",
  "detectedLanguage": "hi",
  "extractedAttributes": {
    "productName": "Handcrafted Terracotta Flower Vase",
    "material": "Terracotta Clay",
    "craftType": "Terracotta Pottery",
    "size": "12 inches height",
    "description": "Handmade terracotta flower vase featuring traditional Indian hand-carved floral patterns."
  },
  "voiceInputId": 1
}
```

---

### 3.2 Generate Smart Bilingual Catalog
* **Method:** `POST`
* **URL:** `{{baseUrl}}/api/catalog/generate`
* **Headers:** `Content-Type: application/json`
* **Body (raw JSON):**
```json
{
  "voiceTranscription": "यह शुद्ध चंदेरी सिल्क साड़ी है जिस पर सुनहरी जरी का बॉर्डर है। इसकी लंबाई साढ़े छह मीटर है।",
  "manualDescription": "Pure Chanderi silk saree with golden zari border and handwoven pallu.",
  "attributes": {
    "productName": "Chanderi Silk Saree",
    "material": "Chanderi Silk",
    "craftType": "Handloom Weaving",
    "size": "6.5 meters"
  }
}
```
* **Response (200 OK):**
```json
{
  "name": "Handcrafted Chanderi Silk Saree with Zari Border",
  "titleEn": "Handcrafted Chanderi Silk Saree with Zari Border",
  "titleHi": "जरी बॉर्डर युक्त हस्तनिर्मित चंदेरी सिल्क साड़ी",
  "aiDescription": "Authentic handloom Chanderi silk saree woven by master weavers, featuring a delicate shimmering zari border and sheer lightweight texture.",
  "descriptionEn": "Authentic handloom Chanderi silk saree woven by master weavers, featuring a delicate shimmering zari border and sheer lightweight texture.",
  "descriptionHi": "मास्टर बुनकरों द्वारा बुनी गई प्रामाणिक हथकरघा चंदेरी रेशमी साड़ी, जिसमें आकर्षक जरी बॉर्डर और पारंपरिक सुंदरता समाहित है।",
  "category": "Textiles & Apparel",
  "craftType": "Chanderi Handloom Weaving",
  "material": "Pure Chanderi Silk & Metallic Zari",
  "dimensions": "6.5 meters (including unstitched blouse piece)",
  "careInstructions": "Dry clean only. Store wrapped in soft cotton fabric away from direct sunlight.",
  "tags": [
    "chanderi",
    "silk-saree",
    "handloom",
    "zari-border",
    "indian-handicraft",
    "traditional-wear"
  ],
  "keywords": [
    "chanderi",
    "silk-saree",
    "handloom",
    "zari-border",
    "indian-handicraft",
    "traditional-wear"
  ]
}
```

---

### 3.3 Save Catalog to Product 🔒
* **Method:** `POST`
* **URL:** `{{baseUrl}}/api/catalog/1/save`
* **Headers:**
  - `Authorization: Bearer {{token}}`
  - `Content-Type: application/json`
* **Body (raw JSON):**
```json
{
  "titleEn": "Handcrafted Chanderi Silk Saree with Zari Border",
  "titleHi": "जरी बॉर्डर युक्त हस्तनिर्मित चंदेरी सिल्क साड़ी",
  "descriptionEn": "Authentic handloom Chanderi silk saree woven by master weavers.",
  "descriptionHi": "मास्टर बुनकरों द्वारा बुनी गई प्रामाणिक हथकरघा चंदेरी रेशमी साड़ी।",
  "keywords": ["chanderi", "silk-saree", "handloom", "zari-border"],
  "careInstructions": "Dry clean only.",
  "material": "Pure Silk & Zari",
  "category": "Textiles"
}
```
* **Response (200 OK):**
```json
{
  "message": "Catalog details saved successfully.",
  "catalogue": {
    "id": 1,
    "productId": 1,
    "titleEn": "Handcrafted Chanderi Silk Saree with Zari Border",
    "titleHi": "जरी बॉर्डर युक्त हस्तनिर्मित चंदेरी सिल्क साड़ी",
    "descriptionEn": "Authentic handloom Chanderi silk saree woven by master weavers.",
    "descriptionHi": "मास्टर बुनकरों द्वारा बुनी गई प्रामाणिक हथकरघा चंदेरी रेशमी साड़ी।",
    "keywords": ["chanderi", "silk-saree", "handloom", "zari-border"],
    "careInstructions": "Dry clean only."
  }
}
```

---

### 3.4 Get Product Catalog
* **Method:** `GET`
* **URL:** `{{baseUrl}}/api/catalog/1`
* **Response (200 OK):** Saved `Catalogue` object.

---

### 3.5 Get Product Voice History
* **Method:** `GET`
* **URL:** `{{baseUrl}}/api/voice/1`
* **Response (200 OK):** Array of voice recordings for this product.

---

### 3.6 Download Printable Artisan PDF Catalog 🔒
* **Method:** `GET`
* **URL:** `{{baseUrl}}/api/catalog/1/pdf`
* **Headers:**
  - `Authorization: Bearer {{token}}`
* **Postman Instructions:** Click the arrow next to the blue **Send** button and select **Send and Download**. Postman will save the generated PDF file directly to your computer!

---

## 4. Component 3: Dynamic ML Pricing Assistant

### 4.1 Estimate Dynamic Pricing & Margin Breakdown
* **Method:** `POST`
* **URL:** `{{baseUrl}}/api/pricing/estimate`
* **Headers:** `Content-Type: application/json`
* **Body (raw JSON):**
```json
{
  "name": "Chanderi Silk Handloom Saree",
  "category": "Textiles",
  "material": "Chanderi Silk",
  "craftComplexity": "high",
  "materialCost": 800,
  "labourHours": 14,
  "wageRate": 100,
  "quantity": 1,
  "debug": true
}
```
* **Field Explanation:**
  - `materialCost`: Raw material expenses in ₹.
  - `labourHours`: Total crafting hours.
  - `wageRate`: Hourly fair wage (defaults to ₹100/hr).
  - `craftComplexity`: `"low"`, `"medium"`, `"high"`, `"intricate"` (or `1` to `5`).
* **Response (200 OK):**
```json
{
  "baseCost": 2690,
  "minimumBaseCost": 2690,
  "marketMin": 3363,
  "marketMax": 9500,
  "suggested": 4800,
  "recommendedPrice": 4800,
  "reasoning": "A recommended retail price of ₹4,800 provides a healthy 34.0% artisan profit margin (₹1,630) above your ₹2,690 production cost, positioning comfortably within market benchmarks for authentic handloom silk.",
  "marginBreakdown": {
    "materialCost": 800,
    "materialPercentage": 16.7,
    "laborCost": 1400,
    "laborPercentage": 29.2,
    "complexityPremium": 490,
    "complexityPercentage": 10.2,
    "baseCost": 2690,
    "packagingAndBuffer": 480,
    "artisanProfit": 1630,
    "profitPercentage": 34.0,
    "recommendedPrice": 4800
  },
  "marketplaceBreakdown": [
    { "marketplace": "Amazon", "avgPrice": 5520, "listingsFound": 14 },
    { "marketplace": "Flipkart", "avgPrice": 4896, "listingsFound": 11 },
    { "marketplace": "Meesho", "avgPrice": 3744, "listingsFound": 18 },
    { "marketplace": "IndiaMART", "avgPrice": 3120, "listingsFound": 7 },
    { "marketplace": "Etsy", "avgPrice": 7920, "listingsFound": 6 }
  ],
  "sources": []
}
```

---

### 4.2 Estimate Pricing (Terracotta Pottery Example)
* **Method:** `POST`
* **URL:** `{{baseUrl}}/api/pricing/estimate`
* **Headers:** `Content-Type: application/json`
* **Body (raw JSON):**
```json
{
  "name": "Handmade Terracotta Floral Vase",
  "category": "Terracotta Pottery",
  "material": "Terracotta Clay",
  "craftComplexity": "medium",
  "materialCost": 150,
  "labourHours": 5,
  "wageRate": 90,
  "quantity": 1
}
```

---

### 4.3 Save Pricing to Product 🔒
* **Method:** `POST`
* **URL:** `{{baseUrl}}/api/pricing/1/save`
* **Headers:**
  - `Authorization: Bearer {{token}}`
  - `Content-Type: application/json`
* **Body (raw JSON):**
```json
{
  "name": "Chanderi Silk Handloom Saree",
  "category": "Textiles",
  "material": "Chanderi Silk",
  "craftComplexity": "high",
  "materialCost": 800,
  "labourHours": 14,
  "wageRate": 100
}
```
* **Response (200 OK):**
```json
{
  "message": "Pricing saved successfully.",
  "pricing": {
    "baseCost": 2690,
    "minimumBaseCost": 2690,
    "marketMin": 3363,
    "marketMax": 9500,
    "suggested": 4800,
    "recommendedPrice": 4800,
    "pricingId": 1
  }
}
```

---

### 4.4 Get Product Pricing
* **Method:** `GET`
* **URL:** `{{baseUrl}}/api/pricing/1`
* **Response (200 OK):** Saved `Pricing` record from database.

---

## 5. Component 4: Storefront & Market Linkage

### 5.1 View Public Storefront
* **Method:** `GET`
* **URL:** `{{baseUrl}}/api/public/stores/master-artisan`
* **Headers:** None (Public)
* **Response (200 OK):** Artisan profile and their published products with images, catalog details, and pricing.

---

### 5.2 Storefront QR Code Image
* **Method:** `GET`
* **URL:** `{{baseUrl}}/api/public/stores/master-artisan/qr.png`
* **Response (200 OK):** Raw PNG QR code that points directly to the artisan's public store.

---

### 5.3 Submit B2B Wholesale Inquiry
* **Method:** `POST`
* **URL:** `{{baseUrl}}/api/public/inquiries`
* **Headers:** `Content-Type: application/json`
* **Body (raw JSON):**
```json
{
  "artisanId": 1,
  "productId": 1,
  "quantity": 100,
  "buyerName": "FabIndia Retail Chain",
  "buyerEmail": "buyer@fabindia.com",
  "buyerPhone": "+919811122233",
  "targetPrice": 3800,
  "deliveryLocation": "New Delhi",
  "message": "Interested in bulk order of authentic Chanderi sarees for festive collection."
}
```
* **Response (201 Created):**
```json
{
  "id": 1,
  "buyerId": 0,
  "artisanId": 1,
  "productId": 1,
  "quantity": 100,
  "targetPrice": 3800,
  "status": "PENDING"
}
```

---

### 5.4 View Artisan Inquiries 🔒
* **Method:** `GET`
* **URL:** `{{baseUrl}}/api/artisan/inquiries`
* **Headers:**
  - `Authorization: Bearer {{token}}`

---

### 5.5 Export to ONDC RET10 Catalog 🔒
* **Method:** `GET`
* **URL:** `{{baseUrl}}/api/exports/ondc/1`
* **Headers:**
  - `Authorization: Bearer {{token}}`
* **Response (200 OK):** Product translated to standard ONDC `bpp/providers` schema for direct integration with the Open Network for Digital Commerce.

---

### 5.6 Export to GeM Schema 🔒
* **Method:** `GET`
* **URL:** `{{baseUrl}}/api/exports/gem/1`
* **Headers:**
  - `Authorization: Bearer {{token}}`
* **Response (200 OK):** Product translated into Government e-Marketplace (GeM) schema with SKU, unit, tax and delivery specifications.

---

### 5.7 Publish Everywhere (Queue Multi-Marketplace Sync) 🔒
* **Method:** `POST`
* **URL:** `{{baseUrl}}/api/products/1/publish`
* **Headers:**
  - `Authorization: Bearer {{token}}`
  - `Content-Type: application/json`
* **Body (raw JSON):**
```json
{
  "marketplaces": ["ONDC", "GEM", "AMAZON"]
}
```
* **Response (200 OK):**
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

---

## 6. Component 5: MoSJE Admin & Impact Analytics

*(All Admin endpoints require an admin JWT token, e.g. signed in with `+919999999999`)*

### 6.1 Admin Dashboard Summary 🔒
* **Method:** `GET`
* **URL:** `{{baseUrl}}/api/admin/dashboard`
* **Headers:**
  - `Authorization: Bearer {{token}}`
* **Response (200 OK):**
```json
{
  "totalArtisans": 12,
  "activeProducts": 48,
  "totalB2BInquiries": 15,
  "estimatedEconomicUplift": 384000
}
```

---

### 6.2 Regional Upliftment Breakdown 🔒
* **Method:** `GET`
* **URL:** `{{baseUrl}}/api/admin/regional`
* **Headers:**
  - `Authorization: Bearer {{token}}`
* **Response (200 OK):** State & district distribution of onboarded artisans and crafts.

---

### 6.3 Multilingual Dictionary
* **Method:** `GET`
* **URL:** `{{baseUrl}}/api/i18n/hi`
* **Headers:** None (Public)
* **Supported Languages:** `hi` (Hindi), `bn` (Bengali), `ta` (Tamil), `te` (Telugu), `mr` (Marathi), `gu` (Gujarati), `kn` (Kannada), `en` (English).

---

## 7. Health & System Check

### 7.1 Server Health
* **Method:** `GET`
* **URL:** `{{baseUrl}}/health`
* **Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2026-09-07T00:25:00.000Z"
}
```

---

## 🛠️ Postman Collection Quick Import

You can also import the pre-built Postman collection file directly:
* **Collection File:** [`ShilpSetu.postman_collection.json`](file:///d:/ShilpSetu-Backend/ShilpSetu.postman_collection.json)
* Click **Import** in Postman and select the file above. All folders, requests, bodies, and auto-saving auth token test scripts are pre-configured!
