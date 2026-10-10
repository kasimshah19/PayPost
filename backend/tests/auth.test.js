const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../src/config/env', () => ({
  PORT: 5000,
  MONGODB_URI: 'mongodb://localhost:27017/test',
  JWT_SECRET: 'testsecret',
  CLIENT_URL: 'http://localhost:5173'
}));

const app = require('../src/app');
const User = require('../src/models/User');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
});

describe('Auth API', () => {
  const brandData = {
    name: 'Test Brand',
    email: 'brand@test.com',
    password: 'password123',
    role: 'brand'
  };

  const creatorData = {
    name: 'Test Creator',
    email: 'creator@test.com',
    password: 'password123',
    role: 'creator'
  };

  let brandToken;
  let creatorToken;

  it('should signup a new brand user and not return password hash', async () => {
    const res = await request(app).post('/api/auth/signup').send(brandData);
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('name', brandData.name);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('should signup a new creator user', async () => {
    const res = await request(app).post('/api/auth/signup').send(creatorData);
    expect(res.statusCode).toBe(201);
    expect(res.body.user).toHaveProperty('role', 'creator');
  });

  it('should return 409 for duplicate email signup', async () => {
    await request(app).post('/api/auth/signup').send(brandData);
    const res = await request(app).post('/api/auth/signup').send(brandData);
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/Email already registered/i);
  });

  it('should return 400 for invalid input on signup', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: 'T',
      email: 'notanemail',
      password: 'short',
      role: 'admin'
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  describe('Login & Authorization', () => {
    beforeEach(async () => {
      const bRes = await request(app).post('/api/auth/signup').send(brandData);
      brandToken = bRes.body.token;
      const cRes = await request(app).post('/api/auth/signup').send(creatorData);
      creatorToken = cRes.body.token;
    });

    it('should login successfully', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: brandData.email,
        password: brandData.password
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe(brandData.email);
    });

    it('should return 401 for wrong password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: brandData.email,
        password: 'wrongpassword'
      });
      expect(res.statusCode).toBe(401);
      expect(res.body.message).toMatch(/Invalid email or password/i);
    });

    it('should return 401 for unknown email', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nobody@test.com',
        password: 'password123'
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return current user on /me with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${brandToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.user.email).toBe(brandData.email);
    });

    it('should return 401 on /me without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.statusCode).toBe(401);
    });

    it('should return 401 on /me with garbage token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer garbagesdfgsdfg');
      expect(res.statusCode).toBe(401);
    });

    it('should allow brand on /api/brand/ping and block creator', async () => {
      const bRes = await request(app)
        .get('/api/brand/ping')
        .set('Authorization', `Bearer ${brandToken}`);
      expect(bRes.statusCode).toBe(200);
      expect(bRes.body.message).toBe('brand ok');

      const cRes = await request(app)
        .get('/api/brand/ping')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(cRes.statusCode).toBe(403);
    });

    it('should allow creator on /api/creator/ping and block brand', async () => {
      const cRes = await request(app)
        .get('/api/creator/ping')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(cRes.statusCode).toBe(200);

      const bRes = await request(app)
        .get('/api/creator/ping')
        .set('Authorization', `Bearer ${brandToken}`);
      expect(bRes.statusCode).toBe(403);
    });
  });
});
