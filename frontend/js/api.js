// Thin wrapper around fetch so every page talks to the backend the same
// way: attaches the auth token automatically, parses JSON, and throws a
// real Error with the backend's actual message on failure (instead of
// every page reinventing this).
const api = {
  async request(path, { method = 'GET', body, isFormData = false, tokenKey = 'token' } = {}) {
    const headers = {};
    const token = localStorage.getItem(tokenKey);
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: isFormData ? body : body ? JSON.stringify(body) : undefined
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      // response had no JSON body — data stays null
    }

    if (!response.ok) {
      throw new Error(data?.error || `Something went wrong (${response.status}). Please try again.`);
    }

    return data;
  },

  get(path, opts) {
    return this.request(path, { ...opts, method: 'GET' });
  },
  post(path, body, opts) {
    return this.request(path, { ...opts, method: 'POST', body });
  },
  postForm(path, formData, opts) {
    return this.request(path, { ...opts, method: 'POST', body: formData, isFormData: true });
  }
};
