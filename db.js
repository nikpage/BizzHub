// db.js

// Supabase Database Adapter for BizzHub - OPTIMIZED

class Database {
  constructor() {
    this.userId = null;
    this.cache = {};
    this.cacheTimeout = 30000; // 30 seconds
  }

  setUser(userId) {
    this.userId = userId;
    this.cache = {}; // Clear cache on user change
  }

  getCacheKey(endpoint) {
    return `${this.userId}:${endpoint}`;
  }

  getFromCache(key) {
    const cached = this.cache[key];
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.info('[DB] CACHE HIT ->', key);
      return cached.data;
    }
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
    Object.keys(this.cache).forEach(key => {
      if (key.includes(pattern)) delete this.cache[key];
    });
  }

  async request(endpoint, options = {}) {
    console.info('[DB] REQUEST ->', { endpoint, options });

    let res;
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.URL || '';
      const headers = { 'Content-Type': 'application/json' };

      // CRITICAL FIX: Add Prefer header for POST and PATCH
      if (options.method === 'POST' || options.method === 'PATCH') {
        headers['Prefer'] = 'return=representation';
      }

      // SECURITY: Add Netlify Identity token
      if (typeof window !== 'undefined' && window.netlifyIdentity) {
        const user = window.netlifyIdentity.currentUser();
        if (user && user.token && user.token.access_token) {
          headers['Authorization'] = `Bearer ${user.token.access_token}`;
        }
      }

      // CLOUDFLARE UPDATE: Point to /db-proxy instead of .netlify/functions/db-proxy
      res = await fetch(`${baseUrl}/db-proxy`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          method: options.method || 'GET',
          endpoint: endpoint,
          body: options.body
        })
      });
    } catch (err) {
      console.error('[DB] NETWORK ERROR', err);
      throw new Error('Network connection lost or function unreachable.');
    }

    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch (e) {
      body = text;
    }

    console.info('[DB] RESPONSE <-', { status: res.status, ok: res.ok, body });

    if (!res.ok) {
      throw new Error(`Database error: ${res.status} ${JSON.stringify(body)}`);
    }

    return body;
  }

  // OPTIMIZED: Batch load all dashboard data in one function call
  async batchRequest(requests) {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.URL || '';
    const headers = { 'Content-Type': 'application/json' };

    if (typeof window !== 'undefined' && window.netlifyIdentity) {
      const user = window.netlifyIdentity.currentUser();
      if (user && user.token && user.token.access_token) {
        headers['Authorization'] = `Bearer ${user.token.access_token}`;
      }
    }

    // CLOUDFLARE UPDATE: Point to /db-batch instead of .netlify/functions/db-batch
    const res = await fetch(`${baseUrl}/db-batch`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ requests })
    });

    if (!res.ok) {
      throw new Error(`Batch request failed: ${res.status}`);
    }

    return res.json();
  }

  // OPTIMIZED: Load all dashboard data at once
  async loadDashboard() {
    const cacheKey = this.getCacheKey('dashboard');
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      // Try batch endpoint first (if available)
      const requests = [
        { key: 'clients', endpoint: `clients?user_id=eq.${this.userId}&deleted=eq.false&order=created_at.desc&select=*` },
        { key: 'jobs', endpoint: `jobs?user_id=eq.${this.userId}&deleted=eq.false&order=created_at.desc&select=*` },
        { key: 'timesheets', endpoint: `timesheets?user_id=eq.${this.userId}&deleted=eq.false&order=created_at.desc&select=*` },

        // FIX: include items/meta/subtotal/currency/job_id so invoice PDF has line items + job details
        { key: 'invoices', endpoint: `invoices?user_id=eq.${this.userId}&deleted=eq.false&order=created_at.desc&select=invoice_number,id,client_id,job_id,subtotal,total,currency,status,created_at,due_date,items,meta` },

        { key: 'business', endpoint: `business?user_id=eq.${this.userId}&select=*` }
      ];

      const results = await this.batchRequest(requests);
      this.setCache(cacheKey, results);
      return results;
    } catch (e) {
      // Fallback to parallel requests if batch endpoint doesn't exist
      console.warn('[DB] Batch endpoint unavailable, using parallel requests');
      const [clients, jobs, timesheets, invoices, business] = await Promise.all([
        this.request(`clients?user_id=eq.${this.userId}&deleted=eq.false&order=created_at.desc&select=*`),
        this.request(`jobs?user_id=eq.${this.userId}&deleted=eq.false&order=created_at.desc&select=*`),
        this.request(`timesheets?user_id=eq.${this.userId}&deleted=eq.false&order=created_at.desc&select=*`),

        // FIX: include items/meta/subtotal/currency/job_id so invoice PDF has line items + job details
        this.request(`invoices?user_id=eq.${this.userId}&deleted=eq.false&order=created_at.desc&select=invoice_number,id,client_id,job_id,subtotal,total,currency,status,created_at,due_date,items,meta`),

        this.request(`business?user_id=eq.${this.userId}&select=*`)
      ]);

      const results = { clients, jobs, timesheets, invoices, business: business[0] || null };
      this.setCache(cacheKey, results);
      return results;
    }
  }

  // NEW FUNCTION: Get the highest existing invoice number to ensure we assign a sequential number
  async getNextInvoiceNumber() {
    const today = new Date();
    const yy = today.getFullYear().toString().slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayPrefix = `${yy}${mm}${dd}`; // e.g., 251122

    // Fetch the highest current invoice number for today's date prefix.
    try {
      // Search for invoices that start with today's date prefix
      // Use 'like' query filter for partial string matching
      const data = await this.request(
        `invoices?user_id=eq.${this.userId}&deleted=eq.false&invoice_number=like.${todayPrefix}-*&order=invoice_number.desc&limit=1&select=invoice_number`
      );

      if (data && data.length > 0 && data[0].invoice_number) {
        const lastNumber = data[0].invoice_number.toString();
        // Extract the sequential part (e.g., '01' from '251122-01')
        const parts = lastNumber.split('-');

        if (parts.length === 2 && parts[0] === todayPrefix) {
          const numPart = parseInt(parts[1], 10);
          const nextNum = numPart + 1;
          const padding = parts[1].length;
          const nextNumStr = String(nextNum).padStart(padding, '0');

          return `${todayPrefix}-${nextNumStr}`; // e.g., 251122-02
        }
      }
    } catch (e) {
      console.error("Failed to fetch next invoice number, falling back to default.", e);
    }

    // Default starting number for today if none exist (or if the date changed)
    return `${todayPrefix}-01`;
  }

  async getAll(table) {
    const cacheKey = this.getCacheKey(`${table}:all`);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const softDeleteFilter = ['clients','jobs','timesheets','invoices','business'].includes(table) ? '&deleted=eq.false' : '';
    const data = await this.request(`${table}?user_id=eq.${this.userId}${softDeleteFilter}&order=created_at.desc&select=*`);
    this.setCache(cacheKey, data);
    return data;
  }

  async getById(table, id) {
    const data = await this.request(`${table}?id=eq.${id}&user_id=eq.${this.userId}`);
    return data[0] || null;
  }

  async create(table, record) {
    const data = await this.request(table, {
      method: 'POST',
      body: {
        ...record,
        user_id: this.userId,
        deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    });
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`Failed to create ${table} record - database returned no data`);
    }
    this.clearCache(table);
    this.clearCache('dashboard');
    return data[0];
  }

  async update(table, id, updates) {
    const data = await this.request(`${table}?id=eq.${id}&user_id=eq.${this.userId}`, {
      method: 'PATCH',
      body: {
        ...updates,
        updated_at: new Date().toISOString(),
      }
    });
    this.clearCache(table);
    this.clearCache('dashboard');
    return data[0];
  }

  async softDelete(table, id) {
    const result = await this.update(table, id, { deleted: true });
    this.clearCache('trash');
    return result;
  }

  async hardDelete(table, id) {
    await this.request(`${table}?id=eq.${id}&user_id=eq.${this.userId}`, {
      method: 'DELETE',
    });
    this.clearCache(table);
    this.clearCache('dashboard');
    this.clearCache('trash');
    return true;
  }

  async restore(table, id) {
    const result = await this.update(table, id, { deleted: false });
    this.clearCache('trash');
    return result;
  }

  async getProfile() {
    const data = await this.request(`business?user_id=eq.${this.userId}`);
    return data[0] || null;
  }

  async saveProfile(profile) {
    const existing = await this.getProfile();
    const saved = existing
      ? await this.update('business', existing.id, profile)
      : await this.create('business', profile);
    return saved;
  }

  async getClients() {
    return this.getAll('clients');
  }

  async getClient(id) {
    return this.getById('clients', id);
  }

  async saveClient(client) {
    const saved = client.id
      ? await this.update('clients', client.id, client)
      : await this.create('clients', client);
    return saved;
  }

  async deleteClient(id) {
    return this.softDelete('clients', id);
  }

  async getJobs() {
    return this.getAll('jobs');
  }

  async getJob(id) {
    return this.getById('jobs', id);
  }

  async saveJob(job) {
    const saved = job.id
      ? await this.update('jobs', job.id, job)
      : await this.create('jobs', job);
    return saved;
  }

  async deleteJob(id) {
    return this.softDelete('jobs', id);
  }

  async getTimesheets() {
    return this.getAll('timesheets');
  }

  async getTimesheet(id) {
    return this.getById('timesheets', id);
  }

  async saveTimesheet(timesheet) {
    const saved = timesheet.id
      ? await this.update('timesheets', timesheet.id, timesheet)
      : await this.create('timesheets', timesheet);
    return saved;
  }

  async deleteTimesheet(id) {
    return this.softDelete('timesheets', id);
  }

  async getInvoices() {
    return this.getAll('invoices');
  }

  async getInvoice(id) {
    return this.getById('invoices', id);
  }

  async saveInvoice(invoice) {
    // Check if we need to retrieve the next invoice number *before* creating the record
    if (!invoice.invoice_number) {
        invoice.invoice_number = await this.getNextInvoiceNumber();
    }

    // Always check database first before deciding update vs create
    const existing = invoice.id ? await this.getInvoice(invoice.id) : null;
    if (existing) {
      return this.update('invoices', invoice.id, invoice);
    }
    return this.create('invoices', invoice);
  }

  async deleteInvoice(id) {
    try {
      return await this.softDelete('invoices', id);
    } catch (e) {
      return await this.hardDelete('invoices', id);
    }
  }

  async markInvoicePaid(id) {
    return this.update('invoices', id, { status: 'paid' });
  }

  async deleteAllUserData(userId) {
    const tables = ['invoices','timesheets','jobs','clients','business'];
    await Promise.all(
      tables.map(t => this.request(`${t}?user_id=eq.${userId}`, { method: 'DELETE' }))
    );
    this.clearCache();
  }

  async getTrash() {
    const cacheKey = this.getCacheKey('trash');
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const [clients, jobs, timesheets, invoices] = await Promise.all([
      this.request(`clients?user_id=eq.${this.userId}&deleted=eq.true&order=updated_at.desc&select=*`),
      this.request(`jobs?user_id=eq.${this.userId}&deleted=eq.true&order=updated_at.desc&select=*`),
      this.request(`timesheets?user_id=eq.${this.userId}&deleted=eq.true&order=updated_at.desc&select=*`),
      this.request(`invoices?user_id=eq.${this.userId}&deleted=eq.true&order=updated_at.desc&select=*`)
    ]);

    const data = [
      ...clients.map(c => ({ ...c, _table: 'clients' })),
      ...jobs.map(j => ({ ...j, _table: 'jobs' })),
      ...timesheets.map(t => ({ ...t, _table: 'timesheets' })),
      ...invoices.map(i => ({ ...i, _table: 'invoices' }))
    ];

    this.setCache(cacheKey, data);
    return data;
  }

  async testConnection() {
    try {
      await this.request('business?limit=1');
      return 'ok';
    } catch {
      return 'error';
    }
  }
}

export const db = new Database();
export const database = db;
