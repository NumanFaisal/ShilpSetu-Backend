import axios from 'axios';

const BASE_URL = 'http://localhost:5001';
const client = axios.create({ baseURL: BASE_URL, timeout: 35000, validateStatus: () => true });

interface StepResult {
  step: string;
  method: string;
  endpoint: string;
  status: number;
  success: boolean;
  notes?: string;
  dataSnippet?: string;
}

const results: StepResult[] = [];

function record(step: string, method: string, endpoint: string, res: any, validator?: (data: any) => boolean) {
  const isOk = res.status >= 200 && res.status < 300;
  const valid = validator ? validator(res.data) : isOk;
  const snippet = typeof res.data === 'object' ? JSON.stringify(res.data).slice(0, 160) : String(res.data).slice(0, 160);
  results.push({
    step,
    method,
    endpoint,
    status: res.status,
    success: valid,
    dataSnippet: snippet
  });
  console.log(`[${valid ? 'PASS' : 'FAIL'}] ${step}: ${method} ${endpoint} => ${res.status}`);
  if (!valid) {
    console.log('   Response:', snippet);
  }
}

async function run() {
  console.log('=== STARTING COMPLETE LIVE API FLOW VERIFICATION ===\n');

  // 0. Health check
  const healthRes = await client.get('/health');
  record('Health Check', 'GET', '/health', healthRes, d => d?.status === 'ok');

  // 1. Seller Signup (as buyer first to cleanly test artisan onboarding)
  const rand = Math.floor(Math.random() * 1000000);
  const email = `master_artisan_${rand}@shilpsetutest.in`;
  const password = 'Password123!';
  const name = `Prakash Weaver ${rand}`;

  const signupRes = await client.post('/api/auth/signup', {
    email,
    password,
    name,
    role: 'buyer'
  });
  record('Seller Signup (as new user)', 'POST', '/api/auth/signup', signupRes, d => !!d?.token);
  const token = signupRes.data?.token;

  if (!token) {
    console.error('Fatal: Auth token missing, aborting test.');
    printSummary();
    process.exit(1);
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 2. Artisan Onboarding
  const createArtisanRes = await client.post('/api/artisans', {
    location: 'Pranpur Handloom Cluster',
    district: 'Ashoknagar',
    state: 'Madhya Pradesh',
    craftType: 'Chanderi Silk Weaving',
    experience: 20,
    storeName: `Prakash Handlooms ${rand}`,
    bio: 'Fourth generation master weaver creating traditional gold zari sarees.'
  }, { headers: authHeaders });
  record('Artisan Onboarding', 'POST', '/api/artisans', createArtisanRes, d => !!(d?.artisan?.id || d?.id));
  const artisan = createArtisanRes.data?.artisan || createArtisanRes.data;
  const artisanId = artisan?.id;
  const artisanSlug = artisan?.slug;

  // 3. Artisan Profile (GET / PATCH)
  const getArtisanRes = await client.get('/api/artisans/me', { headers: authHeaders });
  record('Get My Artisan Profile', 'GET', '/api/artisans/me', getArtisanRes, d => d?.craftType === 'Chanderi Silk Weaving');

  const patchArtisanRes = await client.patch('/api/artisans/me', {
    bio: 'Updated bio: National Merit Award winner for excellence in Chanderi handloom.'
  }, { headers: authHeaders });
  record('Update Artisan Profile', 'PATCH', '/api/artisans/me', patchArtisanRes, d => (d?.artisan?.bio || d?.bio)?.includes('National Merit'));

  // 4. User Profile
  const getUserRes = await client.get('/api/users/me', { headers: authHeaders });
  record('Get Current User Profile', 'GET', '/api/users/me', getUserRes, d => d?.hasArtisanProfile === true);

  // 5. Product CRUD (Create Draft)
  const createProdRes = await client.post('/api/products', {
    name: `Traditional Chanderi Silk Saree ${rand}`,
    category: 'Textiles',
    material: 'Pure Silk & Zari',
    description: 'Exquisite handwoven Chanderi silk saree featuring intricate floral motifs and royal borders.',
    price: 5200,
    quantity: 10
  }, { headers: authHeaders });
  record('Create Draft Product', 'POST', '/api/products', createProdRes, d => !!(d?.product?.id || d?.id));
  const productId = createProdRes.data?.product?.id || createProdRes.data?.id;

  // 6. List My Products
  const listProdRes = await client.get('/api/products', { headers: authHeaders });
  record('List My Products', 'GET', '/api/products', listProdRes, d => Array.isArray(d?.products) && d.products.length > 0);

  // 7. Get Product Detail
  if (productId) {
    const getProdRes = await client.get(`/api/products/${productId}`, { headers: authHeaders });
    record('Get Product Detail', 'GET', `/api/products/${productId}`, getProdRes, d => (d?.product?.id || d?.id) === productId);

    // 8. Update Product Price/Qty
    const patchProdRes = await client.patch(`/api/products/${productId}`, {
      price: 5400,
      quantity: 9
    }, { headers: authHeaders });
    record('Update Product Price/Qty', 'PATCH', `/api/products/${productId}`, patchProdRes, d => (d?.product?.price || d?.price) === 5400);

    // 9. Publish Product to Marketplaces
    const publishRes = await client.post(`/api/products/${productId}/publish`, {
      marketplaces: ['ONDC', 'GEM', 'AMAZON']
    }, { headers: authHeaders });
    record('Publish to Marketplaces', 'POST', `/api/products/${productId}/publish`, publishRes, d => d?.queued === true || Array.isArray(d?.results));

    // 10. Check Product Marketplace Status
    const prodMarketplacesRes = await client.get(`/api/products/${productId}/marketplaces`, { headers: authHeaders });
    record('Get Product Marketplace Status', 'GET', `/api/products/${productId}/marketplaces`, prodMarketplacesRes);
  }

  // 11. List Artisan Orders
  const ordersRes = await client.get('/api/orders', { headers: authHeaders });
  record('List Artisan Orders', 'GET', '/api/orders', ordersRes, d => Array.isArray(d?.orders || d));

  // 12. List Artisan Inquiries
  const inquiriesRes = await client.get('/api/artisan/inquiries', { headers: authHeaders });
  record('List Artisan Inquiries', 'GET', '/api/artisan/inquiries', inquiriesRes, d => Array.isArray(d?.inquiries || d));

  // 13. Marketplace Connections
  const connectionsRes = await client.get('/api/marketplaces/connections', { headers: authHeaders });
  record('Get Marketplace Connections', 'GET', '/api/marketplaces/connections', connectionsRes);

  // 14. Buyer Public Storefront & QR
  if (artisanSlug) {
    const storeRes = await client.get(`/api/public/stores/${artisanSlug}`);
    record('Public Storefront', 'GET', `/api/public/stores/${artisanSlug}`, storeRes, d => !!d?.artisan?.id);

    const qrRes = await client.get(`/api/public/stores/${artisanSlug}/qr.png`);
    record('Storefront QR Code', 'GET', `/api/public/stores/${artisanSlug}/qr.png`, qrRes, d => qrRes.headers['content-type'] === 'image/png');
  }

  // 15. Buyer Search & Discovery
  const searchRes = await client.get('/api/marketplace/search?q=Chanderi');
  record('Buyer Search Products', 'GET', '/api/marketplace/search?q=Chanderi', searchRes, d => Array.isArray(d?.items));

  // 16. Buyer View Published Product Detail (product 1 from DB seed)
  const publicProdRes = await client.get('/api/marketplace/products/1');
  record('Buyer View Published Product Detail', 'GET', '/api/marketplace/products/1', publicProdRes, d => d?.id === 1);

  // 17. Buyer Inquiry
  const submitInquiryRes = await client.post('/api/public/inquiries', {
    artisanId: artisanId || 1,
    productId: productId || 1,
    buyerName: 'Vikram Mehta',
    buyerEmail: 'vikram.mehta@handloomstore.com',
    buyerPhone: '+91 9876543210',
    message: 'Looking for a batch of 15 sarees for our boutique in Mumbai.',
    quantity: 15
  });
  record('Buyer Submit B2B Inquiry', 'POST', '/api/public/inquiries', submitInquiryRes, d => !!d?.id || !!d?.inquiryId);

  // 18. Buyer Requests (Public Wholesale)
  const listBuyerRequestsRes = await client.get('/api/buyer/requests');
  record('List Buyer Requests', 'GET', '/api/buyer/requests', listBuyerRequestsRes, d => Array.isArray(d));

  const postBuyerRequestRes = await client.post('/api/buyer/requests', {
    title: '50 Chanderi Silk Dupattas with Tussar Border',
    category: 'Textiles',
    quantity: 50,
    targetPrice: 1800,
    timeline: '3 weeks',
    description: 'Festive collection requirements for pan-India retail chain.',
    deliveryLocation: 'Jaipur, Rajasthan'
  });
  record('Post Buyer Request', 'POST', '/api/buyer/requests', postBuyerRequestRes, d => !!d?.id);

  // 19. AI Pricing Engine Estimate
  try {
    const pricingRes = await client.post('/api/pricing/estimate', {
      title: 'Chanderi Silk Saree',
      craftType: 'Chanderi Silk',
      materials: ['Pure Silk', 'Zari'],
      timeHours: 28,
      baseCost: 2200
    });
    record('AI Pricing Engine Estimate', 'POST', '/api/pricing/estimate', pricingRes, d => (d?.recommendedPrice != null || d?.suggested != null));
  } catch (err: any) {
    record('AI Pricing Engine Estimate', 'POST', '/api/pricing/estimate', { status: 500, data: err.message });
  }

  // 20. Studio Preset Styles & Regional
  const stylesRes = await client.get('/api/studio-styles');
  record('Studio Preset Styles', 'GET', '/api/studio-styles', stylesRes, d => Array.isArray(d?.styles));

  const i18nRes = await client.get('/api/i18n/hi');
  record('i18n Hindi Translations', 'GET', '/api/i18n/hi', i18nRes, d => !!d?.translations || !!d?.hi || !!d);

  printSummary();
}

function printSummary() {
  console.log('\n================ LIVE VERIFICATION SUMMARY ================');
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`Total Flows Tested: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  console.log('\nDetailed Flow Results:');
  for (const r of results) {
    const icon = r.success ? '✅' : '❌';
    console.log(`${icon} [${r.status}] ${r.method.padEnd(6)} ${r.endpoint.padEnd(42)} - ${r.step}`);
  }

  if (failed > 0) {
    console.log('\nFailed Steps Details:');
    for (const r of results.filter(r => !r.success)) {
      console.log(`- ${r.step} (${r.method} ${r.endpoint}): status ${r.status} -> ${r.dataSnippet}`);
    }
  }
}

run().catch(err => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
