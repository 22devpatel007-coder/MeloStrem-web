const { verifyToken, verifyTokenStrict } = require('../middleware/verifyToken');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Auth middleware', () => {
  test('verifyToken: missing Authorization header returns 401', async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('verifyToken: malformed token returns 401', async () => {
    const req = { headers: { authorization: 'Bearer not-a-real-token' } };
    const res = mockRes();
    const next = jest.fn();
    await verifyToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('verifyTokenStrict: missing token returns 401', async () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();
    await verifyTokenStrict(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});