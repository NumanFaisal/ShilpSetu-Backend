import app from '../src/app';
import http from 'http';
import axios from 'axios';
import sharp from 'sharp';

let server: http.Server;
const PORT = 4599;
const BASE_URL = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;
function ok(name: string) {
  passed++;
  console.log(`  ✅ ${name}`);
}
function fail(name: string, detail?: any) {
  failed++;
  console.log(`  ❌ ${name}${detail ? ' — ' + JSON.stringify(detail).slice(0, 200) : ''}`);
}

async function expectStatus(promise: Promise<any>, expected: number, name: string) {
  try {
    const r = await promise;
    if (r.status === expected) ok(name);
    else fail(name, { got: r.status, data: r.data });
    return r;
  } catch (e: any) {
    if (e.response?.status === expected) {
      ok(name);
      return e.response;
    }
    fail(name, { got: e.response?.status, data: e.response?.data, err: e.message });
    return e.response;
  }
}

async function run() {
  console.log('🔍 Verifying ShilpSetu Backend features against the ACTUAL current API...\n');

  server = app.listen(PORT);
  await new Promise((r) => setTimeout(r, 500));

  try {
    // ── Public: Health ──
    console.log('\n[1] Health check (GET /health)');
    await expectStatus(axios.get(`${BASE_URL}/health`), 200, 'GET /health returns 200 ok');

    // ── Public: Studio styles ──
    console.log('\n[2] Studio styles (public)');
    const stylesRes = await expectStatus(
      axios.get(`${BASE_URL}/api/studio-styles`),
      200,
      'GET /api/studio-styles returns 200'
    );
    if (stylesRes?.data?.styles) {
      const ids = stylesRes.data.styles.map((s: any) => s.id);
      ok(`styles list has ${ids.length} entries: ${ids.join(', ')}`);
      const allHavePreview = stylesRes.data.styles.every((s: any) => typeof s.preview === 'string' && s.preview.startsWith('data:image/jpeg'));
      allHavePreview ? ok('every style has a base64 JPEG preview') : fail('some style missing base64 preview');
    }

    // ── Public: single style preview ──
    console.log('\n[3] Single style preview (public)');
    const prevRes = await expectStatus(
      axios.get(`${BASE_URL}/api/studio-styles/white_studio/preview`),
      200,
      'GET /api/studio-styles/white_studio/preview returns 200'
    );
    if (prevRes?.headers?.['content-type']?.includes('image/jpeg')) ok('preview is image/jpeg');
    else fail('preview content-type not image/jpeg', prevRes?.headers?.['content-type']);
    await expectStatus(
      axios.get(`${BASE_URL}/api/studio-styles/unknown_style/preview`),
      404,
      'unknown style returns 404'
    );

    // ── Auth ──
    console.log('\n[4] Auth (signup / signin)');
    const phone = `9${String(Math.floor(100000000 + Math.random() * 899999999))}`;
    const signupRes = await expectStatus(
      axios.post(`${BASE_URL}/api/auth/signup`, { name: 'Feature Test', phone, password: 'testpass123' }),
      201,
      'POST /api/auth/signup returns 201'
    );
    let token = signupRes?.data?.token;
    token ? ok('signup returns JWT token') : fail('signup missing token', signupRes?.data);

    const signinRes = await expectStatus(
      axios.post(`${BASE_URL}/api/auth/signin`, { phone, password: 'testpass123' }),
      200,
      'POST /api/auth/signin returns 200'
    );
    token = signinRes?.data?.token || token;
    token ? ok('signin returns JWT token') : fail('signin missing token', signinRes?.data);

    await expectStatus(
      axios.post(`${BASE_URL}/api/auth/signin`, { phone, password: 'wrongpass' }),
      401,
      'signin with wrong password returns 401'
    );

    // ── Auth enforcement on protected routes ──
    console.log('\n[5] Auth enforcement (protected image routes)');
    await expectStatus(
      axios.post(`${BASE_URL}/api/image-batches`, { imageCount: 1 }),
      401,
      'POST /api/image-batches without token returns 401'
    );
    await expectStatus(
      axios.get(`${BASE_URL}/api/studio-styles`), // not needed, public
      200,
      'studio-styles stays public'
    );

    // ── Image batch flow (authenticated) ──
    console.log('\n[6] Image batch flow (authenticated)');
    const authHeaders = { Authorization: `Bearer ${token}` };

    // validation: 0 and 5 images rejected
    await expectStatus(
      axios.post(`${BASE_URL}/api/image-batches`, { imageCount: 0 }, { headers: authHeaders }),
      400,
      'batch with 0 images rejected (400)'
    );
    await expectStatus(
      axios.post(`${BASE_URL}/api/image-batches`, { imageCount: 5 }, { headers: authHeaders }),
      400,
      'batch with 5 images rejected (400)'
    );

    // create a valid 2-image batch → presigned R2 URLs
    const createRes = await axios.post(
      `${BASE_URL}/api/image-batches`,
      { imageCount: 2, style: 'wooden_surface' },
      { headers: authHeaders }
    );
    if (createRes.status === 201 && createRes.data.batchId && createRes.data.images?.length === 2) {
      ok(`batch created: ${createRes.data.batchId} with 2 presigned URLs`);
    } else {
      fail('batch creation', { status: createRes.status, data: createRes.data });
    }
    const { batchId, images } = createRes.data || {};

    if (batchId) {
      // get batch details
      const getRes = await axios.get(`${BASE_URL}/api/image-batches/${batchId}`, { headers: authHeaders });
      getRes.status === 200 && getRes.data.batchId === batchId
        ? ok(`GET batch details returns batch ${batchId}`)
        : fail('GET batch details', { status: getRes.status, data: getRes.data });

      // get single image details
      if (images?.[0]?.imageId) {
        const imgRes = await axios.get(
          `${BASE_URL}/api/image-batches/${batchId}/images/${images[0].imageId}`,
          { headers: authHeaders }
        );
        imgRes.status === 200 ? ok('GET single image details returns 200') : fail('GET single image', { status: imgRes.status });
      }

      // cancel batch
      const cancelRes = await axios.post(`${BASE_URL}/api/image-batches/${batchId}/cancel`, {}, { headers: authHeaders });
      cancelRes.status === 200 && cancelRes.data.status === 'CANCELLED'
        ? ok('batch cancelled successfully')
        : fail('cancel batch', { status: cancelRes.status, data: cancelRes.data });

      // 404 for non-existent batch
      await expectStatus(
        axios.get(`${BASE_URL}/api/image-batches/nonexistent-batch-id`, { headers: authHeaders }),
        404,
        'GET unknown batch returns 404'
      );
    }

    // ── Direct multipart upload (authenticated) ──
    console.log('\n[7] Direct multipart upload (authenticated)');
    try {
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      const buf = await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 200, g: 150, b: 100 } } }).jpeg().toBuffer();
      form.append('images', buf, { filename: 'p.jpg', contentType: 'image/jpeg' });
      form.append('style', 'white_studio');
      const upRes = await axios.post(`${BASE_URL}/api/image-batches/upload`, form, {
        headers: { ...form.getHeaders(), ...authHeaders },
      });
      upRes.status === 201 ? ok('direct multipart upload returns 201') : fail('direct upload', { status: upRes.status, data: upRes.data });
    } catch (e: any) {
      fail('direct upload', { status: e.response?.status, data: e.response?.data, err: e.message });
    }

    // ── 404 for unknown routes ──
    console.log('\n[8] Unknown route handling');
    await expectStatus(axios.get(`${BASE_URL}/api/does-not-exist`), 404, 'unknown route returns 404');

    console.log(`\n${'='.repeat(50)}`);
    console.log(`RESULT: ${passed} passed, ${failed} failed`);
    process.exitCode = failed > 0 ? 1 : 0;
  } finally {
    server.close();
  }
}

run().catch((e) => {
  console.error('Fatal test error:', e);
  if (server) server.close();
  process.exit(1);
});
