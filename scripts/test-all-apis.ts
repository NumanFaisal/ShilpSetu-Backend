/**
 * test-all-apis.ts — Comprehensive End-to-End API Integration Validator
 * 
 * Run via: npx tsx scripts/test-all-apis.ts
 */

const BASE_URL = process.env.API_URL || 'http://localhost:5001';

interface TestResult {
  name: string;
  endpoint: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, endpoint: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, endpoint, status: 'PASS' });
    console.log(`  ✅ PASS: ${name} (${endpoint})`);
  } catch (err: any) {
    results.push({ name, endpoint, status: 'FAIL', details: err.message });
    console.log(`  ❌ FAIL: ${name} (${endpoint}) — ${err.message}`);
  }
}

async function main() {
  console.log('\n🚀 Starting ShilpSetu End-to-End API Health & Integration Suite...');
  console.log(`Target: ${BASE_URL}\n`);

  let authToken = '';

  // 1. Health
  await runTest('Health Check', 'GET /health', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error('Expected status: ok');
  });

  // 2. Auth Signin
  await runTest('Admin Authentication', 'POST /api/auth/signin', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+919999999999', password: 'MoSJE@Admin2026' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.token) throw new Error('No token returned');
    authToken = data.token;
  });

  // 3. Auth Send OTP
  await runTest('Send OTP', 'POST /api/auth/send-otp', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+919876543210' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });

  // 4. Studio Styles
  await runTest('List Studio Styles', 'GET /api/studio-styles', async () => {
    const res = await fetch(`${BASE_URL}/api/studio-styles`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const stylesList = Array.isArray(data) ? data : data?.styles;
    if (!Array.isArray(stylesList) || stylesList.length === 0) throw new Error('Invalid styles');
  });

  // 5. AI Catalog Generation
  await runTest('AI Bilingual Catalog Generator', 'POST /api/catalog/generate', async () => {
    const res = await fetch(`${BASE_URL}/api/catalog/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manualDescription: 'Pure handwoven Chanderi silk saree with zari border.',
        attributes: { material: 'Chanderi Silk', craftType: 'Handloom' },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.name) throw new Error('No catalog name generated');
  });

  // 6. AI Dynamic ML Pricing
  await runTest('AI ML Pricing Assistant', 'POST /api/pricing/estimate', async () => {
    const res = await fetch(`${BASE_URL}/api/pricing/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Handcrafted Terracotta Vase',
        category: 'Pottery',
        material: 'Clay',
        craftComplexity: 'medium',
        materialCost: 150,
        labourHours: 5,
        wageRate: 100,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.recommendedPrice && !data.suggested) throw new Error('No price calculated');
  });

  // 7. Public Storefront
  await runTest('Public Storefront', 'GET /api/public/stores/master-artisan', async () => {
    const res = await fetch(`${BASE_URL}/api/public/stores/master-artisan`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });

  // 8. B2B Wholesale Inquiry
  await runTest('Submit B2B Inquiry', 'POST /api/public/inquiries', async () => {
    const res = await fetch(`${BASE_URL}/api/public/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artisanId: 1,
        productId: 1,
        quantity: 50,
        buyerName: 'Validation Tester',
        buyerEmail: 'test@shilpsetutest.in',
        buyerPhone: '+919999900000',
        message: 'Wholesale inquiry validation test',
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });

  // 9. Admin Dashboard
  if (authToken) {
    await runTest('MoSJE Admin Dashboard KPI', 'GET /api/admin/dashboard', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/dashboard`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (typeof data.totalArtisans === 'undefined') throw new Error('Missing artisan stats');
    });
  }

  console.log('\n========================================');
  const passed = results.filter((r) => r.status === 'PASS').length;
  console.log(`Results: ${passed} / ${results.length} Tests Passed`);
  console.log('========================================\n');
}

main().catch(console.error);
