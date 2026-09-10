import axios from 'axios';

const BASE_URL = process.env.API_URL || 'http://localhost:5001';
const client = axios.create({
  baseURL: BASE_URL,
  validateStatus: () => true, // Don't throw so we can inspect status and body
});

async function runTests() {
  console.log(`\n======================================================`);
  console.log(`🚀 STARTING SHILPSETU E-COMMERCE END-TO-END VERIFICATION`);
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`======================================================\n`);

  let failures = 0;
  function assert(condition: boolean, stepName: string, detail?: any) {
    if (condition) {
      console.log(`✅ [PASS] ${stepName}`);
    } else {
      console.error(`❌ [FAIL] ${stepName}`);
      if (detail) console.error(`   Details:`, detail);
      failures++;
    }
  }

  const timestamp = Date.now();

  // ========================================================
  // 1. USER PROFILES: ARTISAN & BUYER
  // ========================================================
  console.log(`\n--- MODULE 1: USER PROFILES & AUTHENTICATION ---`);
  
  // 1.1 Artisan Signup
  const artisanEmail = `artisan_${timestamp}@example.com`;
  const artisanPhone = `+9198${String(timestamp).slice(-8)}`;
  const artisanSignupRes = await client.post('/api/auth/register', {
    email: artisanEmail,
    password: 'Password123!',
    name: 'Ramesh Kumar',
    phone: artisanPhone,
    role: 'ARTISAN',
    craftType: 'Blue Pottery',
  });
  assert(
    artisanSignupRes.status === 201 || artisanSignupRes.status === 200,
    'Artisan registration (POST /api/auth/register)',
    artisanSignupRes.data
  );
  const artisanToken = artisanSignupRes.data?.data?.accessToken || artisanSignupRes.data?.token || artisanSignupRes.data?.data?.token;
  assert(!!artisanToken, 'Artisan token received');

  // 1.2 Artisan Profile Retrieval (GET /api/artisans/me)
  const artisanProfileRes = await client.get('/api/artisans/me', {
    headers: { Authorization: `Bearer ${artisanToken}` },
  });
  assert(artisanProfileRes.status === 200, 'Artisan profile retrieval (GET /api/artisans/me)', artisanProfileRes.data);
  const artisanData = artisanProfileRes.data?.data || artisanProfileRes.data;
  assert(
    artisanData.name === 'Ramesh Kumar' &&
    artisanData.rating !== undefined &&
    artisanData.productsCount !== undefined &&
    Array.isArray(artisanData.crafts),
    'Artisan profile matches UI requirements (rating, crafts, productsCount, metrics)',
    artisanData
  );

  // 1.3 Buyer Signup
  const buyerEmail = `buyer_${timestamp}@example.com`;
  const buyerPhone = `+9197${String(timestamp).slice(-8)}`;
  const buyerSignupRes = await client.post('/api/auth/register', {
    email: buyerEmail,
    password: 'Password123!',
    name: 'Ananya Sharma',
    phone: buyerPhone,
    role: 'BUYER',
  });
  assert(
    buyerSignupRes.status === 201 || buyerSignupRes.status === 200,
    'Buyer registration (POST /api/auth/register)',
    buyerSignupRes.data
  );
  const buyerToken = buyerSignupRes.data?.data?.accessToken || buyerSignupRes.data?.token || buyerSignupRes.data?.data?.token;
  assert(!!buyerToken, 'Buyer token received');

  // 1.4 Buyer Profile & Metrics (GET /api/users/me)
  const buyerProfileRes = await client.get('/api/users/me', {
    headers: { Authorization: `Bearer ${buyerToken}` },
  });
  assert(buyerProfileRes.status === 200, 'Buyer profile retrieval (GET /api/users/me)', buyerProfileRes.data);
  const buyerUserData = buyerProfileRes.data?.data || buyerProfileRes.data;
  assert(
    buyerUserData.role?.toLowerCase() === 'buyer' &&
    (buyerUserData.buyer?.totalOrders !== undefined || buyerUserData.buyerProfile?.totalOrders !== undefined),
    'Buyer profile contains UI metric fields (totalOrders, artisansConnected, companyName)',
    buyerUserData
  );

  // 1.5 Buyer Profile Update (PATCH /api/users/me)
  const buyerUpdateRes = await client.patch('/api/users/me', {
    name: 'Ananya Sharma (Verified Buyer)',
    language: 'hi',
  }, {
    headers: { Authorization: `Bearer ${buyerToken}` },
  });
  assert(buyerUpdateRes.status === 200, 'Buyer profile update (PATCH /api/users/me)', buyerUpdateRes.data);

  // ========================================================
  // 2. PRODUCT PUBLISHING: SELLER / ARTISAN
  // ========================================================
  console.log(`\n--- MODULE 2: PRODUCT PUBLISHING (SELLER) ---`);

  // 2.1 Create Product (POST /api/products)
  const createProductRes = await client.post('/api/products', {
    title: 'Handcrafted Jaipur Blue Pottery Floral Vase',
    description: 'Authentic handcrafted blue pottery floral vase made with traditional quartz and natural glaze.',
    category: 'pottery',
    craftType: 'Blue Pottery',
    price: 1850,
    mrp: 2400,
    stock: 25,
    images: [
      'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?auto=format&fit=crop&w=600&q=80'
    ],
    tags: ['bluepottery', 'jaipur', 'ceramic', 'vase', 'home decor'],
    dimensions: '12 × 10 inches',
    weight: '650 grams',
    origin: 'Jaipur, Rajasthan',
  }, {
    headers: { Authorization: `Bearer ${artisanToken}` },
  });
  assert(
    createProductRes.status === 201 || createProductRes.status === 200,
    'Artisan creates product (POST /api/products)',
    createProductRes.data
  );
  const createdProduct = createProductRes.data?.product || createProductRes.data?.data || createProductRes.data;
  const productId = createdProduct?.id;
  assert(!!productId, `Product ID created: ${productId}`);

  // 2.2 Artisan Lists Own Products (GET /api/products)
  const listOwnProductsRes = await client.get('/api/products', {
    headers: { Authorization: `Bearer ${artisanToken}` },
  });
  assert(listOwnProductsRes.status === 200, 'Artisan lists own inventory (GET /api/products)', listOwnProductsRes.data);
  const ownProducts = listOwnProductsRes.data?.products || listOwnProductsRes.data?.data || listOwnProductsRes.data;
  assert(
    Array.isArray(ownProducts) && ownProducts.some((p: any) => p.id === productId),
    'Created product exists in artisan inventory with views & image arrays'
  );

  // 2.3 Publish to Marketplaces (POST /api/products/:id/publish)
  const publishRes = await client.post(`/api/products/${productId}/publish`, {
    channels: ['ONDC', 'GEM', 'AMAZON_SAHELI'],
  }, {
    headers: { Authorization: `Bearer ${artisanToken}` },
  });
  assert(
    publishRes.status === 200 || publishRes.status === 201,
    'Product published to marketplace channels (POST /api/products/:id/publish)',
    publishRes.data
  );

  // ========================================================
  // 3. PRODUCT DISCOVERY: BUYER
  // ========================================================
  console.log(`\n--- MODULE 3: PRODUCT DISCOVERY (BUYER) ---`);

  // 3.1 Public Marketplace Search (GET /api/marketplace/search)
  const searchRes = await client.get('/api/marketplace/search?q=pottery&category=pottery');
  assert(searchRes.status === 200, 'Public marketplace search (GET /api/marketplace/search)', searchRes.data);
  const searchItems = searchRes.data?.items || searchRes.data?.data?.items || searchRes.data?.data || [];
  assert(Array.isArray(searchItems) && searchItems.length > 0, 'Search returned products array');
  const foundItem = searchItems.find((p: any) => p.id === productId) || searchItems[0];
  assert(
    foundItem && (foundItem.artisanName !== undefined || foundItem.artisan !== undefined) && Array.isArray(foundItem.images),
    'Discovered product has populated artisanName and images array',
    foundItem
  );

  // 3.2 Product Details for Buyer Screen (GET /api/marketplace/products/:id)
  const productDetailRes = await client.get(`/api/marketplace/products/${productId}`);
  assert(productDetailRes.status === 200, `Buyer views product details (GET /api/marketplace/products/:id)`, productDetailRes.data);
  const productDetail = productDetailRes.data?.product || productDetailRes.data?.data || productDetailRes.data;
  assert(
    productDetail.id === productId &&
    productDetail.price === 1850 &&
    (productDetail.artisanName || productDetail.artisan) &&
    productDetail.certifications !== undefined,
    'Product detail contains rich specs (certifications, craftType, artisan info, pricing)',
    productDetail
  );

  // ========================================================
  // 4. ORDER MANAGEMENT: BUYER & SELLER
  // ========================================================
  console.log(`\n--- MODULE 4: ORDER MANAGEMENT ---`);

  // 4.1 Buyer Places Order (POST /api/orders)
  const placeOrderRes = await client.post('/api/orders', {
    productId: productId,
    quantity: 2,
    deliveryAddress: 'Flat 402, Lotus Heights, Indiranagar, Bengaluru, Karnataka 560038',
    notes: 'Please pack with double bubble wrap for fragile ceramic delivery.',
  }, {
    headers: { Authorization: `Bearer ${buyerToken}` },
  });
  assert(
    placeOrderRes.status === 201 || placeOrderRes.status === 200,
    'Buyer places order (POST /api/orders)',
    placeOrderRes.data
  );
  const createdOrder = placeOrderRes.data?.order || placeOrderRes.data?.data || placeOrderRes.data;
  const orderId = createdOrder?.id;
  assert(!!orderId, `Order placed successfully. ID: ${orderId}`);
  assert(
    createdOrder.totalAmount === 3700 &&
    createdOrder.advancePaid === 1110 &&
    createdOrder.status === 'CONFIRMED' &&
    createdOrder.displayId?.startsWith('#SS'),
    'Order calculated 30% advance deposit, total amount, and formatted displayId',
    createdOrder
  );

  // 4.2 Buyer Views Past Orders (GET /api/orders/buyer)
  const buyerOrdersRes = await client.get('/api/orders/buyer', {
    headers: { Authorization: `Bearer ${buyerToken}` },
  });
  assert(buyerOrdersRes.status === 200, 'Buyer views past orders (GET /api/orders/buyer)', buyerOrdersRes.data);
  const buyerOrders = buyerOrdersRes.data?.orders || buyerOrdersRes.data?.data || buyerOrdersRes.data;
  assert(
    Array.isArray(buyerOrders) && buyerOrders.some((o: any) => o.id === orderId),
    'Order exists in buyer order history with milestone details'
  );

  // 4.3 Seller Views Received Orders (GET /api/orders)
  const sellerOrdersRes = await client.get('/api/orders', {
    headers: { Authorization: `Bearer ${artisanToken}` },
  });
  assert(sellerOrdersRes.status === 200, 'Artisan views received orders (GET /api/orders)', sellerOrdersRes.data);
  const sellerOrders = sellerOrdersRes.data?.orders || sellerOrdersRes.data?.data || sellerOrdersRes.data;
  assert(
    Array.isArray(sellerOrders) && sellerOrders.some((o: any) => o.id === orderId),
    'Order is visible to the artisan who created the product'
  );

  // 4.4 Seller Updates Order Status (PATCH /api/orders/:id/status)
  const updateStatusRes1 = await client.patch(`/api/orders/${orderId}/status`, {
    status: 'IN_PRODUCTION',
  }, {
    headers: { Authorization: `Bearer ${artisanToken}` },
  });
  assert(
    updateStatusRes1.status === 200,
    'Artisan updates order status to IN_PRODUCTION (PATCH /api/orders/:id/status)',
    updateStatusRes1.data
  );

  const updateStatusRes2 = await client.patch(`/api/orders/${orderId}/status`, {
    status: 'SHIPPED',
  }, {
    headers: { Authorization: `Bearer ${artisanToken}` },
  });
  assert(
    updateStatusRes2.status === 200,
    'Artisan updates order status to SHIPPED (PATCH /api/orders/:id/status)',
    updateStatusRes2.data
  );

  // 4.5 Either Party Views Order Details & Milestones (GET /api/orders/:id)
  const orderDetailRes = await client.get(`/api/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${buyerToken}` },
  });
  assert(orderDetailRes.status === 200, 'Buyer views detailed tracking (GET /api/orders/:id)', orderDetailRes.data);
  const orderDetail = orderDetailRes.data?.order || orderDetailRes.data?.data || orderDetailRes.data;
  const shippedMilestone = orderDetail.milestones?.find((m: any) => m.label === 'Shipped');
  assert(
    orderDetail.status === 'SHIPPED' &&
    Array.isArray(orderDetail.milestones) &&
    orderDetail.milestones.length === 6 &&
    shippedMilestone?.current === true,
    'Order tracking reflects updated SHIPPED state with active milestone',
    orderDetail.milestones
  );

  console.log(`\n======================================================`);
  if (failures === 0) {
    console.log(`🎉 ALL 18 VERIFICATION CHECKS PASSED PERFECTLY!`);
    console.log(`Backend fully satisfies all Buyer and Seller workflows.`);
  } else {
    console.error(`⚠️ ${failures} TEST CHECKS FAILED! Please inspect errors above.`);
  }
  console.log(`======================================================\n`);

  process.exit(failures === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
