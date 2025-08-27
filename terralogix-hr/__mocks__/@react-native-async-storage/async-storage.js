let store = {};

export default {
  getItem: jest.fn((key) => Promise.resolve(store[key] || null)),
  setItem: jest.fn((key, value) => {
    store[key] = value.toString();
    return Promise.resolve();
  }),
  removeItem: jest.fn((key) => {
    delete store[key];
    return Promise.resolve();
  }),
  clear: jest.fn(() => {
    store = {};
    return Promise.resolve();
  }),
  multiRemove: jest.fn(keys => {
    keys.forEach(key => delete store[key]);
    return Promise.resolve();
  }),
};