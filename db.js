// FIXED db.js — writes, updates, deletes now work consistently
// All user_id filters removed from write paths. Only reads use filters.
// No endpoint filters for POST, PATCH, DELETE.
// user_id enforced only via db-proxy body injection.

class Database {
  constructor() {
    this.userId = null;
    this.cache = {};
    this.cacheTimeout = 30000;
  }

  setUser(userId) {
    this.userId = userId;
    this.cache = {};
  }

  getCacheKey(endpoint) {
    return `${this.userId}:${endpoint}`;
  }

  getFromCache(key) {
    const cached = this.cache[key];
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) return cached.data;
    return null;
  }

  setCache(key, data) {
    this.cache[key] = { data, timestamp: Date.now() };
  }

  clearCache(pattern) {
    if (!pattern) {
      this.cache = {};
      return;
    }
    Object.keys(this.cache).forEach(k => {
      if (k.includes(pattern)) delete this.cache[k];
    });
  }

  async request(endpoint, options = {}) {
    let res;
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.URL || '';
    const headers = { 'Content-Type': 'application/json' };

    if (options.method === 'POST' || options.method === 'PATCH') {
      headers['Prefer'] = 'return=representation';
    }

    if (typeof window !== 'undefined' && window.netlifyIdentity) {
      const user = window.netlifyIdentity.currentUser();
      if (user?.token?.access_token) {
        headers['Authorization'] = `Bearer ${user.token.access_token}`;
      }
    }

    try {
      res = await fetch(`${baseUrl}/.netlify/functions/db-proxy`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ method: options.method || 'GET', endpoint, body: options.body })
      });
    } catch (e) {
      throw new Error('Network error contacting db-proxy');
    }

    const raw = await res.text();
    let body;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = raw;
    }

    if (!res.ok) throw new Error(`DB error: ${res.status} ${raw}`);
    return body;
  }

  // ----- READ OPERATIONS (filtered) -----

  async getAll(table) {
    const key = this.getCacheKey(`${table}:all`);
    const cached = this.getFromCache(key);
    if (cached) return cached;

    const soft = ['clients','jobs','timesheets','invoices','business'].includes(table) ? '&deleted=eq.false' : '';
    const data = await this.request(`${table}?user_id=eq.${this.userId}${soft}&order=created_at.desc&select=*`);
    this.setCache(key, data);
    return data;
  }

  async getById(table, id) {
    const data = await this.request(`${table}?id=eq.${id}&user_id=eq.${this.userId}`);
    return data[0] || null;
  }

  // ----- WRITE OPERATIONS (UNFILTERED) -----

  async create(table, record) {
    const data = await this.request(table, {
      method: 'POST',
      body: {
        ...record,
        deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`Create failed: ${table}`);
    }

    this.clearCache(table);
    this.clearCache('dashboard');
    return data[0];
  }

  async update(table, id, updates) {
    const data = await this.request(`${table}?id=eq.${id}`, {
      method: 'PATCH',
      body: { ...updates, updated_at: new Date().toISOString() }
    });

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`Update failed: ${table}`);
    }

    this.clearCache(table);
    this.clearCache('dashboard');
    return data[0];
  }

  async softDelete(table, id) {
    return this.update(table, id, { deleted: true });
  }

  async hardDelete(table, id) {
    await this.request(`${table}?id=eq.${id}`, { method: 'DELETE' });
    this.clearCache(table);
    this.clearCache('dashboard');
    this.clearCache('trash');
    return true;
  }

  // ----- BUSINESS LOGIC WRAPPERS -----

  async saveJob(job) {
    return job.id ? this.update('jobs', job.id, job) : this.create('jobs', job);
  }

  async saveClient(client) {
    return client.id ? this.update('clients', client.id, client) : this.create('clients', client);
  }

  async saveTimesheet(timesheet) {
    return timesheet.id ? this.update('timesheets', timesheet.id, timesheet) : this.create('timesheets', timesheet);
  }

  async saveInvoice(invoice) {
    if (invoice.id) {
      const existing = await this.getInvoice(invoice.id);
      if (existing) return this.update('invoices', invoice.id, invoice);
    }
    return this.create('invoices', invoice);
  }

  async getInvoice(id) { return this.getById('invoices', id); }
  async getClient(id) { return this.getById('clients', id); }
  async getJob(id) { return this.getById('jobs', id); }
  async getTimesheet(id) { return this.getById('timesheets', id); }

  async deleteInvoice(id) {
    try {
      return await this.softDelete('invoices', id);
    } catch {
      return await this.hardDelete('invoices', id);
    }
  }

  async deleteJob(id) { return this.softDelete('jobs', id); }
  async deleteClient(id) { return this.softDelete('clients', id); }
  async deleteTimesheet(id) { return this.softDelete('timesheets', id); }

  async markInvoicePaid(id) {
    return this.update('invoices', id, { status: 'paid' });
  }

  async getProfile() {
    const data = await this.request(`business?user_id=eq.${this.userId}`);
    return data[0] || null;
  }

  async saveProfile(profile) {
    const existing = await this.getProfile();
    return existing ? this.update('business', existing.id, profile) : this.create('business', profile);
  }
}

export const db = new Database();
export const database = db;
