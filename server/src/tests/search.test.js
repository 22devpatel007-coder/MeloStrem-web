const request = require('supertest');
const app = require('../index');

describe('Search', () => {
  test('GET /api/search without q returns 400 or empty', async () => {
    const res = await request(app).get('/api/search');
    expect([400, 200]).toContain(res.status);
  });

  test('GET /api/search with single char returns empty or skips', async () => {
    const res = await request(app).get('/api/search?q=a');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('songs');
    expect(Array.isArray(res.body.songs)).toBe(true);
  });

  test('GET /api/search response shape is correct', async () => {
    const res = await request(app).get('/api/search?q=test');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('songs');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('query');
  });

  test('GET /api/search respects limit cap at 50', async () => {
    const res = await request(app).get('/api/search?q=test&limit=999');
    expect(res.status).toBe(200);
    expect(res.body.songs.length).toBeLessThanOrEqual(50);
  });
});