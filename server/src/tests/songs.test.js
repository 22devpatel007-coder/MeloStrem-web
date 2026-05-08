const request = require('supertest');
const app = require('../index');

describe('Songs', () => {
  test('GET /api/songs returns correct envelope shape', async () => {
    const res = await request(app).get('/api/songs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('songs');
    expect(res.body).toHaveProperty('nextCursor');
    expect(res.body).toHaveProperty('hasMore');
    expect(Array.isArray(res.body.songs)).toBe(true);
  });

  test('GET /api/songs respects limit cap at 50', async () => {
    const res = await request(app).get('/api/songs?limit=999');
    expect(res.status).toBe(200);
    expect(res.body.songs.length).toBeLessThanOrEqual(50);
  });

  test('GET /api/songs/:id returns 404 with code for unknown id', async () => {
    const res = await request(app).get('/api/songs/nonexistent-song-id-xyz');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('code', 'NOT_FOUND');
  });

  test('POST /api/songs (admin create) rejects unauthenticated', async () => {
    const res = await request(app).post('/api/songs').send({ title: 'Test' });
    expect(res.status).toBe(401);
  });

  test('DELETE /api/songs/:id rejects non-admin', async () => {
    const res = await request(app)
      .delete('/api/songs/some-id')
      .set('Authorization', 'Bearer fake-non-admin-token');
    expect([401, 403]).toContain(res.status);
  });
});