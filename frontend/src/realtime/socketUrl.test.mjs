import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getSocketUrl } from './socketUrl.js';

describe('getSocketUrl helper', () => {
  test('VITE_SOCKET_URL wins when both are provided', () => {
    const url = getSocketUrl({
      VITE_SOCKET_URL: 'https://socket.example.com',
      VITE_API_URL: 'https://api.example.com/api',
      PROD: true
    });
    assert.equal(url, 'https://socket.example.com');
  });

  test('VITE_SOCKET_URL trims trailing slashes', () => {
    const url = getSocketUrl({
      VITE_SOCKET_URL: 'https://socket.example.com///',
      PROD: true
    });
    assert.equal(url, 'https://socket.example.com');
  });

  test('derived from VITE_API_URL with trailing /api', () => {
    const url = getSocketUrl({
      VITE_API_URL: 'https://paypost.onrender.com/api',
      PROD: true
    });
    assert.equal(url, 'https://paypost.onrender.com');
  });

  test('derived from VITE_API_URL with trailing /api/', () => {
    const url = getSocketUrl({
      VITE_API_URL: 'https://paypost.onrender.com/api/',
      PROD: true
    });
    assert.equal(url, 'https://paypost.onrender.com');
  });

  test('derived from VITE_API_URL without trailing /api', () => {
    const url = getSocketUrl({
      VITE_API_URL: 'https://paypost.onrender.com',
      PROD: true
    });
    assert.equal(url, 'https://paypost.onrender.com');
  });

  test('derived from VITE_API_URL with trailing slash', () => {
    const url = getSocketUrl({
      VITE_API_URL: 'https://paypost.onrender.com/',
      PROD: true
    });
    assert.equal(url, 'https://paypost.onrender.com');
  });

  test('dev fallback to localhost when nothing set and not in production', () => {
    const url = getSocketUrl({
      PROD: false
    });
    assert.equal(url, 'http://localhost:5000');
  });

  test('production returns null when nothing is set', () => {
    const url = getSocketUrl({
      PROD: true
    });
    assert.equal(url, null);
  });

  test('whitespace and empty strings treated as not set (production returns null)', () => {
    const url = getSocketUrl({
      VITE_SOCKET_URL: '   ',
      VITE_API_URL: '',
      PROD: true
    });
    assert.equal(url, null);
  });

  test('whitespace and empty strings treated as not set (development falls back to localhost)', () => {
    const url = getSocketUrl({
      VITE_SOCKET_URL: '',
      VITE_API_URL: '   ',
      PROD: false
    });
    assert.equal(url, 'http://localhost:5000');
  });
});
