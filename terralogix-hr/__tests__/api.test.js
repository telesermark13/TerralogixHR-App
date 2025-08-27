import { login, getProfile, fetchWithAuth } from '../api';
import AsyncStorage from '@react-native-async-storage/async-storage';

global.fetch = jest.fn();

beforeEach(() => {
  fetch.mockClear();
  AsyncStorage.clear();
});

describe('login', () => {
  it('should return tokens on successful login', async () => {
    const mockTokens = { access: 'fake_access_token', refresh: 'fake_refresh_token' };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockTokens,
    });

    const result = await login('testuser', 'password');
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8000/api/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'password' }),
    });
    expect(result).toEqual(mockTokens);
  });

  it('should throw an error on failed login', async () => {
    fetch.mockResolvedValueOnce({ ok: false });
    await expect(login('testuser', 'wrongpassword')).rejects.toThrow('Login failed');
  });
});

describe('fetchWithAuth', () => {
    it('should make a request with an authorization header if a token exists', async () => {
        const mockToken = 'fake_access_token';
        await AsyncStorage.setItem('access_token', mockToken);
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true }),
        });

        await fetchWithAuth('http://127.0.0.1:8000/api/some-protected-endpoint/');

        expect(fetch).toHaveBeenCalledWith(
            'http://127.0.0.1:8000/api/some-protected-endpoint/',
            expect.objectContaining({
                headers: new Headers({
                    'Authorization': `Bearer ${mockToken}`,
                    'Content-Type': 'application/json'
                })
            })
        );
    });
});
