// Supabase Database Adapter for BizzHub

class Database {
  constructor() {
    this.userId = null;
  }

  setUser(userId) {
    this.userId = userId;
  }

  async request(endpoint, options = {}) {
    console.info('[DB] REQUEST ->', { endpoint, options });

    let res;
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.URL || '';
      const headers = { 'Content-Type': 'application/json' };

      if (options.method === 'POST') {
        headers['Prefer'] = 'return=representation';
      }

      res = await fetch(`${baseUrl}/.netlify/functions/db-proxy`, {
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
      throw new Error('Network connection lost or Netlify function unreachable.');
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

  async getAll(table) {
    const softDeleteFilter = ['clients','jobs','timesheets','invoices','business'].includes(table) ? '&deleted=eq.false' : '';
    return this.request(`${table}?user_id=eq.${this.userId}${softDeleteFilter}&order=created_at.desc&select=*`);
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
    return data[0];
  }

  async update(table, id, updates) {
    return this.request(`${table}?id=eq.${id}&user_id=eq.${this.userId}`, {
      method: 'PATCH',
      body: {
        ...updates,
        updated_at: new Date().toISOString(),
      }
    }).then(data => data[0]);
  }

  async softDelete(table, id) {
    return this.update(table, id, { deleted: true });
  }

  async hardDelete(table, id) {
    await this.request(`${table}?id=eq.${id}&user_id=eq.${this.userId}`, {
      method: 'DELETE',
    });
    return true;
  }

  async restore(table, id) {
    return this.update(table, id, { deleted: false });
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
    this.userId && (saved.user_id = this.userId);
    return saved;
  }

  async getClients() {
    return this.getAll('clients');
  }

  async getClient(id) {
    return this.getById('clients', id);
  }

  async saveClient(client) {
    client.user_id = this.userId;
    let saved;
    if (client.id) {
      saved = await this.update('clients', client.id, client);
    } else {
      saved = await this.create('clients', client);
    }
    if (saved && this.userId) {
      saved.user_id = this.userId;
    }
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
    job.user_id = this.userId;
    return job.id
      ? this.update('jobs', job.id, job)
      : this.create('jobs', job);
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
    timesheet.user_id = this.userId;
    return timesheet.id
      ? this.update('timesheets', timesheet.id, timesheet)
      : this.create('timesheets', timesheet);
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
    invoice.user_id = this.userId;
    if (invoice.id) {
      const existing = await this.getInvoice(invoice.id);
      if (existing) {
        return this.update('invoices', invoice.id, invoice);
      }
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
    return this.update('invoices', id, {
      status: 'paid'
    });
  }
  async deleteAllUserData(userId) {
    await this.request('invoices?user_id=eq.'  + userId, { method: 'DELETE' });
    await this.request('timesheets?user_id=eq.'+ userId, { method: 'DELETE' });
    await this.request('jobs?user_id=eq.'      + userId, { method: 'DELETE' });
    await this.request('clients?user_id=eq.'   + userId, { method: 'DELETE' });
    await this.request('business?user_id=eq.'  + userId, { method: 'DELETE' });
  }

  async deleteAllUserData(userId) {
    const tables = ['invoices','timesheets','jobs','clients','business'];
    await Promise.all(
      tables.map(t => this.request(`${t}?user_id=eq.${userId}`, { method: 'DELETE' }))
    );
  }

  async getTrash() {
    const [clients, jobs, timesheets, invoices] = await Promise.all([
      this.request(`clients?user_id=eq.${this.userId}&deleted=eq.true&order=updated_at.desc&select=*`),
      this.request(`jobs?user_id=eq.${this.userId}&deleted=eq.true&order=updated_at.desc&select=*`),
      this.request(`timesheets?user_id=eq.${this.userId}&deleted=eq.true&order=updated_at.desc&select=*`),
      this.request(`invoices?user_id=eq.${this.userId}&deleted=eq.true&order=updated_at.desc&select=*`)
    ]);
    return [
      ...clients.map(c => ({ ...c, _table: 'clients' })),
      ...jobs.map(j => ({ ...j, _table: 'jobs' })),
      ...timesheets.map(t => ({ ...t, _table: 'timesheets' })),
      ...invoices.map(i => ({ ...i, _table: 'invoices' }))
    ];
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
