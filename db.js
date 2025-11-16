// Supabase Database Adapter for BizzHub - COMPLETE and SECURE

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

  /**
   * Universal request handler. Always POSTs to the secure Netlify proxy function.
   * @param {string} endpoint - The Supabase table endpoint (e.g., 'clients?select=*').
   * @param {object} options - Request options including method and body.
   */
  async request(endpoint, options = {}) {
    console.info('[DB] REQUEST ->', { endpoint, options });

    const token = window.netlifyIdentity.currentUser()?.token?.access_token;
    if (!token) throw new Error('Authentication token not available. User must log in.');

    const cacheKey = this.getCacheKey(endpoint);
    const method = options.method || 'GET';

    if (method === 'GET') {
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;
    }

    let res;
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` // Netlify Identity token for proxy validation
      };

      const proxyPayload = {
          endpoint: endpoint, // Supabase endpoint
          method: method,     // Intended Supabase method (GET, POST, PATCH, DELETE)
          body: options.body  // The data payload
      };

      const url = `${baseUrl}/.netlify/functions/db-proxy`;

      res = await fetch(url, {
        method: 'POST', // The actual method for the proxy function
        headers: headers,
        body: JSON.stringify(proxyPayload)
      });

      if (!res.ok) {
        let errorData;
        try {
            errorData = await res.json();
        } catch (e) {
            throw new Error(`DB Error: ${res.status} - Failed to parse error response.`);
        }
        throw new Error(`DB Error: ${res.status} - ${errorData.message || res.statusText || 'Unknown Error'}`);
      }

      const data = await res.json();

      if (method === 'GET') {
        this.setCache(cacheKey, data);
      } else {
        // Clear relevant cache on mutation
        this.clearCache(endpoint.split('?')[0]);
      }

      return data;
    } catch (error) {
      console.error('[DB] FAILED REQUEST ->', error);
      throw error;
    }
  }

  // --- Utility Methods ---

  async update(table, id, data) {
    // CRITICAL: Ensure user_id is set before update for RLS and security
    const updateData = Array.isArray(data) ?
      data.map(d => ({ ...d, user_id: this.userId })) :
      { ...data, user_id: this.userId };

    return this.request(`${table}?id=eq.${id}`, { method: 'PATCH', body: updateData });
  }

  async insert(table, data) {
    // CRITICAL: Ensure user_id is set before insert for RLS and security
    const insertData = Array.isArray(data) ?
      data.map(d => ({ ...d, user_id: this.userId })) :
      { ...data, user_id: this.userId };

    return this.request(`${table}`, { method: 'POST', body: insertData });
  }

  async softDelete(table, id) {
    // Moves the item to trash
    return this.update(table, id, { deleted: true, updated_at: new Date().toISOString() });
  }

  async hardDelete(table, id) {
    // Permanently deletes an item
    return this.request(`${table}?id=eq.${id}`, { method: 'DELETE' });
  }

  async restore(table, id) {
    // Restores item from trash
    return this.update(table, id, { deleted: false, updated_at: new Date().toISOString() });
  }

  async requestBatch(requests) {
    const token = window.netlifyIdentity.currentUser()?.token?.access_token;
    if (!token) throw new Error('Authentication token not available.');

    const cacheKey = this.getCacheKey('batch:' + JSON.stringify(requests));
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${baseUrl}/.netlify/functions/db-batch`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requests)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(`Batch Error: ${res.status} - ${errorData.message || res.statusText}`);
      }

      const batchRes = await res.json();
      this.setCache(cacheKey, batchRes);
      return batchRes;
    } catch (error) {
      console.error('[DB] BATCH FAILED ->', error);
      throw error;
    }
  }


  // --- CRUD METHODS (by Table) ---

  // BUSINESS
  async getProfile() {
    const data = await this.requestBatch({ business: `business?select=*` });
    return data.business;
  }

  async upsertProfile(data) {
    // If the data already has an ID, use PATCH, otherwise use POST.
    if (data.id) {
        return this.update('business', data.id, data);
    } else {
        return this.insert('business', data);
    }
  }

  // CLIENTS
  async getAllClients() {
    return this.request(`clients?deleted=eq.false&order=name.asc&select=*`);
  }

  async addClient(data) {
    return this.insert('clients', data);
  }

  async updateClient(id, data) {
    return this.update('clients', id, data);
  }

  async deleteClient(id) {
    return this.softDelete('clients', id);
  }

  // JOBS
  async getAllJobs() {
    return this.request(`jobs?deleted=eq.false&order=created_at.desc&select=*`);
  }

  async getJob(id) {
    const result = await this.request(`jobs?id=eq.${id}&select=*,job_lines(*)`);
    return result[0];
  }

  async addJob(data) {
    const jobData = { ...data };
    const jobLines = jobData.job_lines || [];
    delete jobData.job_lines;

    const newJob = await this.insert('jobs', jobData);

    if (jobLines.length > 0) {
        const linesToInsert = jobLines.map(line => ({ ...line, job_id: newJob[0].id }));
        await this.insert('job_lines', linesToInsert);
    }
    return newJob;
  }

  async updateJob(id, data) {
    const jobData = { ...data };
    const jobLines = jobData.job_lines || [];
    delete jobData.job_lines;

    const updatedJob = await this.update('jobs', id, jobData);

    // Clear all existing job lines and insert new ones (safer for complex updates)
    await this.request(`job_lines?job_id=eq.${id}`, { method: 'DELETE' });

    if (jobLines.length > 0) {
        const linesToInsert = jobLines.map(line => ({ ...line, job_id: id }));
        await this.insert('job_lines', linesToInsert);
    }
    return updatedJob;
  }

  async deleteJob(id) {
    return this.softDelete('jobs', id);
  }

  // TIMESHEETS
  async getAllTimesheets() {
    return this.request(`timesheets?deleted=eq.false&order=date.desc&select=*`);
  }

  async addTimesheet(data) {
    return this.insert('timesheets', data);
  }

  async updateTimesheet(id, data) {
    return this.update('timesheets', id, data);
  }

  async deleteTimesheet(id) {
    return this.softDelete('timesheets', id);
  }

  // INVOICES
  async getAllInvoices() {
    return this.request(`invoices?deleted=eq.false&order=date_issued.desc&select=*`);
  }

  async addInvoice(data) {
    return this.insert('invoices', data);
  }

  async updateInvoice(id, data) {
    return this.update('invoices', id, data);
  }

  async deleteInvoice(id) {
    return this.softDelete('invoices', id);
  }

  async markInvoicePaid(id) {
    return this.update('invoices', id, { status: 'paid', updated_at: new Date().toISOString() });
  }

  // EXPENSES
  async getAllExpenses() {
    return this.request(`expenses?order=date.desc&select=*`);
  }

  async addExpense(data) {
    return this.insert('expenses', data);
  }

  async updateExpense(id, data) {
    return this.update('expenses', id, data);
  }

  async deleteExpense(id) {
    return this.hardDelete('expenses', id); // Expenses typically hard deleted
  }

  // TODOS
  async getAllTodos() {
    return this.request(`todos?order=created_at.desc&select=*`);
  }

  async addTodo(data) {
    return this.insert('todos', data);
  }

  async updateTodo(id, data) {
    return this.update('todos', id, data);
  }

  async deleteTodo(id) {
    return this.hardDelete('todos', id);
  }

  // TRASH
  async getTrash() {
    const cacheKey = this.getCacheKey('trash');
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    // Fetch all soft-deleted items (user_id filter is enforced by the proxy)
    const [clients, jobs, timesheets, invoices] = await Promise.all([
      this.request(`clients?deleted=eq.true&order=updated_at.desc&select=*`),
      this.request(`jobs?deleted=eq.true&order=updated_at.desc&select=*`),
      this.request(`timesheets?deleted=eq.true&order=updated_at.desc&select=*`),
      this.request(`invoices?deleted=eq.true&order=updated_at.desc&select=*`)
    ]);

    const data = [
      ...clients.map(c => ({ ...c, _table: 'clients' })).filter(c => c.deleted),
      ...jobs.map(j => ({ ...j, _table: 'jobs' })).filter(j => j.deleted),
      ...timesheets.map(t => ({ ...t, _table: 'timesheets' })).filter(t => t.deleted),
      ...invoices.map(i => ({ ...i, _table: 'invoices' })).filter(i => i.deleted),
    ];

    this.setCache(cacheKey, data);
    return data;
  }

  // DANGEROUS: For account deletion only
  async deleteAllUserData() {
    const tables = ['invoices','timesheets','jobs','clients','business', 'expenses', 'todos'];

    // WARNING: This depends on RLS allowing deletion by user_id
    await Promise.all(
      tables.map(t => this.request(`${t}?user_id=eq.${this.userId}`, { method: 'DELETE' }))
    );
    this.clearCache();
  }
}

export const database = new Database();
