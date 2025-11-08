import { t, setLanguage } from './lang.js';
import { database } from './db.js';

// App State
const state = {
  currentView: 'dashboard',
  currentUser: null,
  clients: [],
  jobs: [],
  timesheets: [],
  showBilledJobs: true,
  invoices: [],
  profile: null
};

// Initialize app
async function init() {
  // Wait for Netlify Identity to be ready
  return new Promise((resolve) => {
    if (window.netlifyIdentity) {
      window.netlifyIdentity.init();
      window.netlifyIdentity.on('init', async (user) => {
        if (!user) {
          // Not logged in, redirect to landing page
          window.location.href = '/index.html';
          return;
        }

        state.currentUser = user;
        database.setUser(user.id);
        console.log('APP USER ID:', user.id);

        const savedLang = localStorage.getItem('lang') || 'en';
        document.getElementById('langSelect').value = savedLang;
        setLanguage(savedLang);

        const savedTheme = localStorage.getItem('theme') || 'light';
        document.body.dataset.theme = savedTheme;

        setupEventListeners();
        await loadData();

        document.getElementById('userEmail').textContent = user.email;
        showView('dashboard');

        resolve();
      });
    } else {
      // Netlify Identity not loaded, redirect to index
      window.location.href = '/index.html';
    }
  });
}

// Setup all event listeners
function setupEventListeners() {
  document.getElementById('langSelect').addEventListener('change', (e) => {
    setLanguage(e.target.value);
    location.reload();
  });

  document.getElementById('themeToggle').addEventListener('click', () => {
    const themes = ['light', 'dark', 'retro'];
    const current = document.body.dataset.theme || 'light';
    const nextIndex = (themes.indexOf(current) + 1) % themes.length;
    const next = themes[nextIndex];
    document.body.dataset.theme = next;
    localStorage.setItem('theme', next);
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    netlifyIdentity.logout();
    window.location.href = '/index.html';
  });

  document.getElementById('profileBtn').addEventListener('click', () => {
    showView('profile');
  });

  document.getElementById('backupBtn').addEventListener('click', backupData);
  document.getElementById('restoreBtn').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => restoreData(e.target.files[0]);
    input.click();
  });

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      showView(view);
    });
  });

  // Dropdown toggle on click
  document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = toggle.closest('.dropdown');

      // Close other dropdowns
      document.querySelectorAll('.dropdown').forEach(d => {
        if (d !== dropdown) d.classList.remove('show');
      });

      // Toggle this dropdown
      dropdown.classList.toggle('show');
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown').forEach(d => {
      d.classList.remove('show');
    });
  });
}

// Load all data
async function loadData() {
  try {
    [state.clients, state.jobs, state.timesheets, state.invoices, state.profile] =
      await Promise.all([
        database.getClients(),
        database.getJobs(),
        database.getTimesheets(),
        database.getInvoices(),
        database.getProfile()
      ]);
  } catch (error) {
    showToast(t('error'), 'error');
    console.error('Failed to load data:', error);
  }
}

// Show view
function showView(viewName) {
  state.currentView = viewName;

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === viewName);
  });

  const mainView = document.getElementById('mainView');

  switch(viewName) {
    case 'dashboard':
      renderDashboard(mainView);
      break;
    case 'clients':

      renderClients(mainView);
      break;
    case 'jobs':
      renderJobs(mainView);
      break;
    case 'worklogs':
      renderWorkLogs(mainView);
      break;
    case 'trash':
      renderTrash(mainView);
      break;
    case 'profile':
      renderProfile(mainView);
      break;
  }
}

// Dashboard View
function renderDashboard(container) {
  const totalInvoiced = state.invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalReceived = state.invoices.filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalOverdue = state.invoices.filter(inv =>
    inv.status === 'unpaid' && new Date(inv.due_date) < new Date()
  ).reduce((sum, inv) => sum + (inv.total || 0), 0);

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">${t('totalInvoiced')}</div>
        <div class="stat-value">$${totalInvoiced.toFixed(2)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t('totalReceived')}</div>
        <div class="stat-value">$${totalReceived.toFixed(2)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t('totalOverdue')}</div>
        <div class="stat-value">$${totalOverdue.toFixed(2)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t('clientCount')}</div>
        <div class="stat-value">${state.clients.length}</div>
      </div>
    </div>

    <div class="flex-between mb-3">
      <h2>${t('ledger')}</h2>
      <div class="flex gap-1">
        <button id="exportCsv" class="btn-secondary">${t('exportCsv')}</button>
        <button id="exportXlsx" class="btn-secondary">${t('exportXlsx')}</button>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>${t('date')}</th>
            <th>${t('description')}</th>
            <th>${t('type')}</th>
            <th>${t('amount')}</th>
            <th>${t('status')}</th>
            <th>${t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          ${state.invoices.length === 0 ? `
            <tr><td colspan="7" class="text-center text-muted">${t('noData')}</td></tr>
          ` : state.invoices.map((inv, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${formatDate(inv.created_at)}</td>
              <td>${inv.description || '-'}</td>
              <td>${t('invoice')}</td>
              <td>$${inv.total?.toFixed(2) || '0.00'}</td>
              <td>
                <span class="badge badge-${inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'danger' : 'warning'}">
                  ${t(inv.status || 'pending')}
                </span>
              </td>
              <td>
                <button class="action-btn" onclick="window.viewInvoice('${inv.id}')" title="${t('viewPdf')}">👁️</button>
                <button class="action-btn" onclick="window.downloadInvoice('${inv.id}')" title="${t('downloadPdf')}">⬇️</button>
                <button class="action-btn" onclick="window.markInvoicePaid('${inv.id}')" title="${t('markPaid')}">✓</button>
                <button class="action-btn" onclick="window.deleteInvoice('${inv.id}')" title="${t('delete')}">🗑️</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('exportCsv')?.addEventListener('click', () => exportLedger('csv'));
  document.getElementById('exportXlsx')?.addEventListener('click', () => exportLedger('xlsx'));
}

// Clients View
function renderClients(container) {
  container.innerHTML = `
    <div class="flex-between mb-3">
      <h2>${t('clients')}</h2>
      <button id="addClient" class="btn-primary">${t('addClient')}</button>
    </div>
    <div class="cards-grid">
      ${state.clients.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <p>${t('noData')}</p>
        </div>
      ` : state.clients.map(client => `
        <div class="card">
          <div class="card-header">
            <div class="card-title">${client.name || 'Unnamed'}</div>
            <div class="card-actions">
              <button class="action-btn" onclick="window.editClient('${client.id}')" title="${t('edit')}">✏️</button>
              <button class="action-btn" onclick="window.deleteClient('${client.id}')" title="${t('delete')}">🗑️</button>
            </div>
          </div>
          <div class="card-info">
            <div class="card-info-item">
              <span class="card-info-label">${t('email')}:</span>
              <span>${client.invoice_email || '-'}</span>
            </div>
            <div class="card-info-item">
              <span class="card-info-label">${t('address')}:</span>
              <span>${client.address || '-'}</span>
            </div>
            <div class="card-info-item">
              <span class="card-info-label">${t('rate')}:</span>
              <span>${client.rate || '0'} ${client.currency || 'USD'} / ${t(client.rate_type || 'hourly')}</span>
            </div>
            ${client.id_number_1 ? `
              <div class="card-info-item">
                <span class="card-info-label">${client.id_label_1 || 'ID'}:</span>
                <span>${client.id_number_1}</span>
              </div>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
  document.getElementById('addClient')?.addEventListener('click', () => showClientForm());
}
// Jobs View
function renderJobs(container) {
  const displayJobs = state.showBilledJobs
  ? state.jobs.filter(j => !j.deleted)
  : state.jobs.filter(j => !j.billed && !j.deleted);

  container.innerHTML = `
    <div class="flex-between mb-3">
      <h2>${t('jobs')}</h2>
      <div class="flex gap-1">
        <label class="checkbox-group">
          <input type="checkbox" id="showBilledJobs" ${state.showBilledJobs ? 'checked' : ''}>
          <span>Show Billed Jobs</span>
        </label>
        <button id="addJob" class="btn-primary">${t('addJob')}</button>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>${t('jobName')}</th>
            <th>${t('client')}</th>
            <th>${t('startDate')}</th>
            <th>${t('endDate')}</th>
            <th>${t('hours')}</th>
            <th>${t('rate')}</th>
            <th>Status</th>
            <th>${t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          ${displayJobs.length === 0 ? `
            <tr><td colspan="8" class="text-center text-muted">${t('noData')}</td></tr>
          ` : displayJobs.map(job => {
            const client = state.clients.find(c => c.id === job.client_id);
            return `
              <tr>
                <td>${job.name || '-'}</td>
                <td>${client?.name || '-'}</td>
                <td>${formatDate(job.start_date)}</td>
                <td>${formatDate(job.end_date)}</td>
                <td>${job.hours || 0}</td>
                <td>${job.rate || client?.rate || 0} ${job.currency || client?.currency || 'USD'}</td>
                <td>${job.billed ? '<span class="badge badge-success">Billed ✓</span>' : '<span class="badge badge-warning">Pending</span>'}</td>
                <td>
                  ${!job.billed ? `<button class="action-btn" onclick="window.createInvoiceFromJob('${job.id}')" title="Create Invoice">💰</button>` : ''}
                  <button class="action-btn" onclick="window.editJob('${job.id}')" title="${t('edit')}">✏️</button>
                  <button class="action-btn" onclick="window.deleteJob('${job.id}')" title="${t('delete')}">🗑️</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('addJob')?.addEventListener('click', () => showJobForm());
  document.getElementById('showBilledJobs')?.addEventListener('change', (e) => {
    state.showBilledJobs = e.target.checked;
    showView('jobs');
  });
}

// Work Logs View
function renderWorkLogs(container) {
  container.innerHTML = `
    <div class="form-container mb-3">
      <h3>${t('generateInvoice')}</h3>
      <div class="form-grid">
        <div class="form-group">
          <label>${t('selectClient')}</label>
          <select id="invoiceClient">
            <option value="">${t('selectClient')}</option>
            ${state.clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>${t('selectMonth')}</label>
          <input type="month" id="invoiceMonth" value="${new Date().toISOString().slice(0,7)}">
        </div>
        <div class="form-group">
          <button id="generateInvoice" class="btn-primary">${t('generate')}</button>
        </div>
      </div>
    </div>

    <div class="flex-between mb-3">
      <h2>${t('worklogs')}</h2>
      <button id="addLog" class="btn-primary">${t('addLog')}</button>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>${t('date')}</th>
            <th>${t('client')}</th>
            <th>${t('hours')}</th>
            <th>${t('notes')}</th>
            <th>${t('billed')}</th>
            <th>${t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          ${state.timesheets.length === 0 ? `
            <tr><td colspan="6" class="text-center text-muted">${t('noData')}</td></tr>
          ` : state.timesheets.map(ts => {
            const client = state.clients.find(c => c.id === ts.client_id);
            return `
              <tr>
                <td>${formatDate(ts.date)}</td>
                <td>${client?.name || '-'}</td>
                <td>${ts.hours || 0}</td>
                <td>${ts.notes || '-'}</td>
                <td>${ts.billed ? '✓' : '✗'}</td>
                <td>
                  <button class="action-btn" onclick="window.editTimesheet('${ts.id}')" title="${t('edit')}">✏️</button>
                  <button class="action-btn" onclick="window.deleteTimesheet('${ts.id}')" title="${t('delete')}">🗑️</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('addLog')?.addEventListener('click', () => showTimesheetForm());
  document.getElementById('generateInvoice')?.addEventListener('click', generateInvoice);
}

// Trash View
async function renderTrash(container) {
  const trash = await database.getTrash();

  container.innerHTML = `
    <h2 class="mb-3">${t('trash')}</h2>

    ${trash.length === 0 ? `
      <div class="empty-state">
        <div class="empty-state-icon">🗑️</div>
        <p>${t('emptyTrash')}</p>
      </div>
    ` : `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>${t('itemName')}</th>
              <th>${t('itemType')}</th>
              <th>${t('date')}</th>
              <th>${t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            ${trash.map(item => `
              <tr>
                <td>${item.name || item.description || item.id}</td>
                <td>${item._table}</td>
                <td>${formatDate(item.deleted)}</td>
                <td>
                  <button class="action-btn" onclick="window.restoreItem('${item._table}', '${item.id}')" title="${t('restore')}">↩️</button>
                  <button class="action-btn" onclick="window.deleteForever('${item._table}', '${item.id}')" title="${t('deleteForever')}">❌</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;
}

// Profile View
function renderProfile(container) {
  const profile = state.profile || {};

  container.innerHTML = `
    <h2 class="mb-3">${t('businessProfile')}</h2>

    <div class="form-container">
      <form id="profileForm">
        <div class="form-grid">
          <div class="form-group full-width">
            <label>${t('businessName')}</label>
            <input type="text" name="name" value="${profile.name || ''}" required>
          </div>

          <div class="form-group full-width">
            <label>${t('businessAddress')}</label>
            <textarea name="address">${profile.address || ''}</textarea>
          </div>

          <div class="form-group full-width">
            <label>${t('businessEmail')}</label>
            <input type="email" name="email" value="${profile.email || ''}">
          </div>


          <div class="form-group full-width">
            <h3 class="mb-2">${t('idNumbers')}</h3>
            ${[1,2,3,4].map(i => `
              <div class="form-grid">
                <div class="form-group">
                  <label>${t('idLabel')} ${i}</label>
                  <input type="text" name="id_label_${i}" value="${profile[`id_label_${i}`] || ''}">
                </div>
                <div class="form-group">
                  <label>${t('idNumber')} ${i}</label>
                  <input type="text" name="id_number_${i}" value="${profile[`id_number_${i}`] || ''}">
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="flex gap-2 mt-2">
          <button type="submit" class="btn-primary">${t('save')}</button>
          <button type="button" class="btn-secondary" onclick="window.location.reload()">${t('cancel')}</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('profileForm').addEventListener('submit', saveProfile);
}

// Modal System
function showModal(title, content, onSave) {
  const modal = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">${title}</h2>
          <button class="modal-close" onclick="window.closeModal()">×</button>
        </div>
        <div class="modal-body">
          ${content}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="window.closeModal()">${t('cancel')}</button>
          <button class="btn-primary" id="modalSave">${t('save')}</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modalContainer').innerHTML = modal;

  if (onSave) {
    document.getElementById('modalSave').addEventListener('click', async () => {
      await onSave();
      window.closeModal();
    });
  }
}

window.closeModal = function() {
  document.getElementById('modalContainer').innerHTML = '';
};

// Client Forms
function showClientForm(clientId = null) {
  const client = clientId ? state.clients.find(c => c.id === clientId) : {};

  showModal(clientId ? t('editClient') : t('addClient'), `
    <form id="clientForm">
      <div class="form-grid">
        <div class="form-group">
          <label>${t('clientName')} *</label>
          <input type="text" name="name" value="${client.name || ''}" required>
        </div>

        <div class="form-group">
          <label>${t('adminEmail')}</label>
          <input type="email" name="admin_email" value="${client.admin_email || ''}">
        </div>

        <div class="form-group">
          <label>${t('invoiceEmail')}</label>
          <input type="email" name="invoice_email" value="${client.invoice_email || ''}">
        </div>

        <div class="form-group full-width">
          <label>${t('address')}</label>
          <textarea name="address">${client.address || ''}</textarea>
        </div>

        <div class="form-group">
          <label>${t('rate')}</label>
          <input type="number" name="rate" value="${client.rate || ''}" step="0.01">
        </div>

        <div class="form-group">
          <label>${t('rateType')}</label>
          <select name="rate_type">
            <option value="hourly" ${client.rate_type === 'hourly' ? 'selected' : ''}>${t('hourly')}</option>
            <option value="daily" ${client.rate_type === 'daily' ? 'selected' : ''}>${t('daily')}</option>
            <option value="task" ${client.rate_type === 'task' ? 'selected' : ''}>${t('task')}</option>
          </select>
        </div>

        <div class="form-group">
          <label>${t('currency')}</label>
          <select name="currency">
            <option value="USD" ${client.currency === 'USD' ? 'selected' : ''}>USD</option>
            <option value="EUR" ${client.currency === 'EUR' ? 'selected' : ''}>EUR</option>
            <option value="CZK" ${client.currency === 'CZK' ? 'selected' : ''}>CZK</option>
            <option value="GBP" ${client.currency === 'GBP' ? 'selected' : ''}>GBP</option>
          </select>
        </div>

        <div class="form-group full-width">
          <h3 class="mb-2">${t('idNumbers')}</h3>
          ${[1,2,3,4].map(i => `
            <div class="form-grid">
              <div class="form-group">
                <label>${t('idLabel')} ${i} (e.g. VAT, Tax ID)</label>
                <input type="text" name="id_label_${i}" value="${client[`id_label_${i}`] || ''}">
              </div>
              <div class="form-group">
                <label>${t('idNumber')} ${i}</label>
                <input type="text" name="id_number_${i}" value="${client[`id_number_${i}`] || ''}">
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <input type="hidden" name="id" value="${client.id || ''}">
    </form>
  `, async () => {
    const form = document.getElementById('clientForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    if (!data.id) delete data.id;
    if (data.rate === '') delete data.rate;
    console.log('Saving client data:', JSON.stringify(data, null, 2));
    try {
      await database.saveClient(data);
      state.clients = await database.getClients();
      showView('clients');
      showToast(t('saveSuccess'));
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Save failed', 'error');
    }
  });
}
function showJobForm(jobId = null) {
  const job = jobId ? state.jobs.find(j => j.id === jobId) : {};

  showModal(jobId ? t('editJob') : t('addJob'), `
    <form id="jobForm">
      <div class="form-grid">
        <div class="form-group">
          <label>${t('client')} *</label>
          <select name="client_id" required>
            <option value="">${t('selectClient')}</option>
            ${state.clients.map(c => `
              <option value="${c.id}" ${job.client_id === c.id ? 'selected' : ''}>${c.name}</option>
            `).join('')}
          </select>
        </div>

        <div class="form-group">
          <label>${t('jobName')} *</label>
          <input type="text" name="name" value="${job.name || ''}" required>
        </div>

        <div class="form-group full-width">
          <label>${t('jobDescription')}</label>
          <textarea name="description">${job.description || ''}</textarea>
        </div>

        <div class="form-group full-width">
          <label>${t('address')}</label>
          <textarea name="address">${job.address || ''}</textarea>
        </div>

        <div class="form-group">
          <label>${t('startDate')}</label>
          <input type="date" name="start_date" value="${job.start_date || ''}">
        </div>

        <div class="form-group">
          <label>${t('endDate')}</label>
          <input type="date" name="end_date" value="${job.end_date || ''}">
        </div>

        <div class="form-group">
          <label>${t('hours')}</label>
          <input type="number" name="hours" value="${job.hours || ''}" step="0.01">
        </div>

        <div class="form-group">
          <label>${t('rate')}</label>
          <input type="number" name="rate" value="${job.rate || ''}" step="0.01">
        </div>

        <div class="form-group">
          <label>${t('currency')}</label>
          <select name="currency">
            <option value="USD" ${job.currency === 'USD' ? 'selected' : ''}>USD</option>
            <option value="EUR" ${job.currency === 'EUR' ? 'selected' : ''}>EUR</option>
            <option value="CZK" ${job.currency === 'CZK' ? 'selected' : ''}>CZK</option>
          </select>
        </div>
      </div>

      <input type="hidden" name="id" value="${job.id || ''}">
    </form>
  `, async () => {
    const form = document.getElementById('jobForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    if (!data.id) delete data.id;
    if (data.client_id === '') delete data.client_id;
    if (data.rate === '') delete data.rate;
    if (data.hours === '') delete data.hours;
    if (data.start_date === '') delete data.start_date;
    if (data.end_date === '') delete data.end_date;

    try {
      await database.saveJob(data);
      state.jobs = await database.getJobs();
      showView('jobs');
      showToast(t('saveSuccess'));
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Save failed', 'error');
    }
  });
}

function showTimesheetForm(timesheetId = null) {
  const ts = timesheetId ? state.timesheets.find(t => t.id === timesheetId) : {};

  showModal(timesheetId ? t('editLog') : t('addLog'), `
    <form id="timesheetForm">
      <div class="form-grid">
        <div class="form-group">
          <label>${t('date')} *</label>
          <input type="date" name="date" value="${ts.date || new Date().toISOString().split('T')[0]}" required>
        </div>

        <div class="form-group">
          <label>${t('client')} *</label>
          <select name="client_id" required>
            <option value="">${t('selectClient')}</option>
            ${state.clients.map(c => `
              <option value="${c.id}" ${ts.client_id === c.id ? 'selected' : ''}>${c.name}</option>
            `).join('')}
          </select>
        </div>

        <div class="form-group">
          <label>${t('hours')} *</label>
          <input type="number" name="hours" value="${ts.hours || ''}" step="0.25" required>
        </div>

        <div class="form-group full-width">
          <label>${t('notes')}</label>
          <textarea name="notes">${ts.notes || ''}</textarea>
        </div>

        <div class="form-group checkbox-group">
          <input type="checkbox" name="billed" id="billedCheck" ${ts.billed ? 'checked' : ''}>
          <label for="billedCheck">${t('billed')}</label>
        </div>
      </div>

      <input type="hidden" name="id" value="${ts.id || ''}">
    </form>
  `, async () => {
    const form = document.getElementById('timesheetForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    data.billed = document.getElementById('billedCheck').checked;
    if (!data.id) delete data.id;
        if (data.hours === '') delete data.hours;

    await database.saveTimesheet(data);
    await loadData();
    showView('worklogs');
    showToast(t('saveSuccess'));
  });
}

async function createInvoiceFromJob(jobId) {
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) return;

  const client = state.clients.find(c => c.id === job.client_id);
  if (!client) {
    showToast('Client not found', 'error');
    return;
  }

  const descParts = [job.name];
  if (job.description) descParts.push(job.description);
  if (job.address) descParts.push(job.address);
  const description = descParts.join('\n');

  const hours = parseFloat(job.hours) || 0;
  const rate = parseFloat(job.rate) || parseFloat(client.rate) || 0;
  const currency = job.currency || client.currency || 'USD';
  const total = hours * rate;

  let dateRange = '';
  if (job.start_date && job.end_date) {
    dateRange = `${formatDate(job.start_date)} - ${formatDate(job.end_date)}`;
  } else if (job.start_date) {
    dateRange = formatDate(job.start_date);
  }

  // Generate invoice ID in format YYMMDD-II
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePrefix = `${yy}${mm}${dd}`;

  // Find highest increment for today
  const todayInvoices = state.invoices.filter(inv => inv.id && inv.id.startsWith(datePrefix));
  let nextIncrement = 1;
  if (todayInvoices.length > 0) {
    const increments = todayInvoices.map(inv => {
      const parts = inv.id.split('-');
      return parts.length === 2 ? parseInt(parts[1]) : 0;
    });
    nextIncrement = Math.max(...increments) + 1;
  }
  const invoiceId = `${datePrefix}-${String(nextIncrement).padStart(2, '0')}`;

  const invoiceData = {
    id: invoiceId,
    client_id: job.client_id,
    job_id: jobId,
    items: JSON.stringify([{ description: dateRange, hours: hours, rate: rate }]),
    date_issued: new Date().toISOString(),
    due_date: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
    total: total,
    status: 'unpaid',
    meta: JSON.stringify({ description: description, currency: currency })
  };

  try {
    await database.saveInvoice(invoiceData);
    await database.saveJob({ ...job, billed: true });
    await loadData();
    showView('dashboard');
    showToast('Invoice created successfully');
  } catch (err) {
    console.error('Failed to create invoice:', err);
    showToast('Failed to create invoice', 'error');
  }
}

async function saveProfile(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData);


  await database.saveProfile(data);
  state.profile = data;
  showToast(t('saveSuccess'));
}

// Invoice Generation
async function generateInvoice() {
  const clientId = document.getElementById('invoiceClient').value;
  const month = document.getElementById('invoiceMonth').value;

  if (!clientId || !month) {
    showToast(t('error'), 'error');
    return;
  }

  const client = state.clients.find(c => c.id === clientId);
  const [year, monthNum] = month.split('-');

  const timesheets = state.timesheets.filter(ts => {
    const tsDate = new Date(ts.date);
    return ts.client_id === clientId &&
           tsDate.getFullYear() === parseInt(year) &&
           tsDate.getMonth() === parseInt(monthNum) - 1;
  });

  if (timesheets.length === 0) {
    showToast('No work logs found for this period', 'error');
    return;
  }

  const totalHours = timesheets.reduce((sum, ts) => sum + parseFloat(ts.hours || 0), 0);
  const rate = parseFloat(client.rate || 0);
  const total = totalHours * rate;

  const invoice = {
    client_id: clientId,
    description: `Work for ${month}`,
    items: JSON.stringify(timesheets.map(ts => ({
      date: ts.date,
      description: ts.notes || 'Work',
      hours: ts.hours,
      rate: rate
    }))),
    subtotal: total,
    tax: 0,
    total: total,
    status: 'unpaid',
    due_date: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]
  };

  await database.saveInvoice(invoice);
  await loadData();
  showView('dashboard');
  showToast(t('saveSuccess'));
}

// Export Functions
function exportLedger(format) {
  const data = state.invoices.map((inv, i) => ({
    '#': i + 1,
    'Date': formatDate(inv.created_at),
    'Description': inv.description || '-',
    'Type': 'Invoice',
    'Amount': inv.total?.toFixed(2) || '0.00',
    'Status': inv.status || 'pending'
  }));

  if (format === 'csv') {
    const csv = [
      Object.keys(data[0]).join(','),
      ...data.map(row => Object.values(row).join(','))
    ].join('\n');

    downloadFile(csv, 'ledger.csv', 'text/csv');
  } else if (format === 'xlsx') {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
    XLSX.writeFile(wb, 'ledger.xlsx');
  }
}

function backupData() {
  const backup = {
    clients: state.clients,
    jobs: state.jobs,
    timesheets: state.timesheets,
    invoices: state.invoices,
    profile: state.profile,
    date: new Date().toISOString()
  };

  const json = JSON.stringify(backup, null, 2);
  downloadFile(json, `bizzhub-backup-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
  showToast('Backup downloaded successfully');
}

async function restoreData(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const b = JSON.parse(e.target.result);
    if (!confirm('Replace everything?')) return;
    const u = state.currentUser.id;
    await database.saveProfile({...b.profile, user_id: u});
    await Promise.all(b.clients.map(c => database.saveClient({...c, user_id: u})));
    await Promise.all(b.jobs.map(j => database.saveJob({...j, user_id: u})));
    await Promise.all(b.timesheets.map(t => database.saveTimesheet({...t, user_id: u})));
    await Promise.all(b.invoices.map(i => database.saveInvoice({...i, user_id: u})));
    await loadData(); showView('dashboard'); showToast('Restored');
  };

// Global Window Functions for onclick handlers
window.showView = showView;

window.editClient = (id) => showClientForm(id);
window.deleteClient = async (id) => {
  if (confirm(t('confirmDelete'))) {
    await database.deleteClient(id);
    await loadData();
    showView('clients');
    showToast(t('deleteSuccess'));
  }
};

window.editJob = (id) => showJobForm(id);
window.createInvoiceFromJob = createInvoiceFromJob;
window.deleteJob = async (id) => {
  if (confirm(t('confirmDelete'))) {
    await database.deleteJob(id);
    await loadData();
    showView('jobs');
    showToast(t('deleteSuccess'));
  }
};

window.editTimesheet = (id) => showTimesheetForm(id);
window.deleteTimesheet = async (id) => {
  if (confirm(t('confirmDelete'))) {
    await database.deleteTimesheet(id);
    await loadData();
    showView('worklogs');
    showToast(t('deleteSuccess'));
  }
};

window.viewInvoice = async (id) => {
  const inv = state.invoices.find(i => i.id === id);
  if (!inv) return;

  const client = state.clients.find(c => c.id === inv.client_id);
  const items = JSON.parse(inv.items || '[]');
  const lang = localStorage.getItem('lang') || 'en';
  const isCzech = lang === 'cs' || client?.czech_invoice;

  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${isCzech ? 'FAKTURA' : 'INVOICE'} #${inv.id}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: Arial, sans-serif;
          padding: 50px;
          max-width: 900px;
          margin: 0 auto;
          color: #000;
          background: #fff;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 30px;
        }
        .invoice-title {
          font-size: 36px;
          font-weight: bold;
        }
        .invoice-meta {
          text-align: right;
          font-size: 14px;
          line-height: 1.8;
        }
        .invoice-meta div {
          margin-bottom: 2px;
        }
        .separator {
          border-bottom: 2px solid #000;
          margin: 25px 0;
        }
        .parties {
          display: flex;
          justify-content: space-between;
          margin: 30px 0 40px 0;
        }
        .party {
          width: 48%;
        }
        .party h3 {
          font-size: 15px;
          font-weight: bold;
          margin-bottom: 8px;
        }
        .party p {
          margin: 0;
          font-size: 14px;
          line-height: 1.5;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 30px 0;
        }
        th {
          background: #f8f8f8;
          padding: 12px;
          text-align: left;
          font-weight: bold;
          font-size: 13px;
          border-bottom: 2px solid #333;
        }
        th.right { text-align: right; }
        td {
          padding: 12px;
          font-size: 14px;
          border-bottom: 1px solid #e0e0e0;
        }
        td.right { text-align: right; }
        .separator-thin {
          border-bottom: 1px solid #000;
          margin: 20px 0 10px 0;
        }
        .total-section {
          text-align: right;
          margin-top: 30px;
        }
        .total-line {
          font-size: 20px;
          font-weight: bold;
          padding: 15px 0;
          border-top: 2px solid #000;
        }
        .footer-info {
          margin-top: 50px;
          font-size: 13px;
          line-height: 1.8;
        }
        .footer-info p {
          margin: 3px 0;
        }
        @media print {
          body { padding: 30px; }
          .no-print { display: none; }
        }
        .print-btn {
          padding: 14px 28px;
          background: #6366f1;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 15px;
          margin-top: 40px;
          font-weight: 500;
        }
        .print-btn:hover {
          background: #4f46e5;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 class="invoice-title">${isCzech ? 'FAKTURA' : 'INVOICE'}</h1>
        <div class="invoice-meta">
          <div><strong>Invoice #:</strong> ${inv.id}</div>
          <div><strong>${isCzech ? 'Issue date:' : 'Issue date:'}</strong> ${formatDate(inv.created_at)}</div>
          <div><strong>${isCzech ? 'Due date:' : 'Due date:'}</strong> ${formatDate(inv.due_date)}</div>
          <div><strong>${isCzech ? 'Payment Method:' : 'Payment Method:'}</strong> ${isCzech ? 'Bank transfer' : 'Bank transfer'}</div>
        </div>
      </div>

      <div class="separator"></div>

      <div class="parties">
        <div class="party">
          <h3>${isCzech ? 'Dodavatel' : 'Supplier'}</h3>
          <p>
            <strong>${state.profile?.name || 'Your Business'}</strong><br>
            ${state.profile?.address || ''}<br>
            ${state.profile?.id_numbers?.map(id => `${id.label}: ${id.number}`).join('<br>') || ''}
          </p>
        </div>

        <div class="party">
          <h3>${isCzech ? 'Odběratel' : 'Customer'}</h3>
          <p>
            <strong>${client?.name || '-'}</strong><br>
            ${client?.address || ''}<br>
            ${client?.id_numbers?.map(id => `${id.label}: ${id.number}`).join('<br>') || ''}
          </p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>${isCzech ? 'Položka / Description' : 'Description'}</th>
            <th class="right">${isCzech ? 'Počet hodin / Hours' : 'Hours'}</th>
            <th class="right">${isCzech ? 'Sazba/hod. / Rate' : 'Rate'}</th>
            <th class="right">${isCzech ? 'Částka / Amount' : 'Amount'}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${item.description}</td>
              <td class="right">${item.hours.toFixed(2)}</td>
              <td class="right">${item.rate?.toFixed(2)} ${client?.currency || 'USD'}</td>
              <td class="right">${(item.hours * item.rate).toFixed(2)} ${client?.currency || 'USD'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="total-section">
        <div class="total-line">
          ${isCzech ? 'CELKEM K ÚHRADĚ / TOTAL DUE:' : 'TOTAL DUE:'} ${inv.total?.toFixed(2)} ${client?.currency || 'USD'}
        </div>
      </div>

      <div class="footer-info">
        <p><strong>${isCzech ? 'Bankovní spojení / Bank Details:' : 'Bank Details:'}</strong></p>
        ${state.profile?.bank_accounts?.map(acc => `<p>Bank: ${acc.number}</p>`).join('') || '<p>Not specified</p>'}
        <p style="margin-top: 15px;">${isCzech ? 'Nejsem plátce DPH. / Not a VAT payer.' : 'Not a VAT payer.'}</p>
      </div>

      <div class="no-print">
        <button class="print-btn" onclick="window.print()">
          ${isCzech ? 'Print / Save as PDF' : 'Print / Save as PDF'}
        </button>
      </div>
    </body>
    </html>
  `);
  win.document.close();
};

window.downloadInvoice = async (id) => {
  const inv = state.invoices.find(i => i.id === id);
  if (!inv) return;

  const client = state.clients.find(c => c.id === inv.client_id);
  const items = JSON.parse(inv.items || '[]');
  const lang = localStorage.getItem('lang') || 'en';
  const isCzech = lang === 'cs' || client?.czech_invoice;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(24);
  doc.text(isCzech ? 'FAKTURA' : 'INVOICE', 20, 20);

  doc.setFontSize(11);
  doc.text(`Invoice #: ${inv.id}`, 20, 35);
  doc.text(`${isCzech ? 'Datum vystavení / ' : ''}Issue date: ${formatDate(inv.created_at)}`, 20, 42);
  doc.text(`${isCzech ? 'Datum splatnosti / ' : ''}Due date: ${formatDate(inv.due_date)}`, 20, 49);
  doc.text(`${isCzech ? 'Forma úhrady / ' : ''}Payment: ${isCzech ? 'Bankovním převodem' : 'Bank transfer'}`, 20, 56);

  doc.setLineWidth(0.5);
  doc.line(20, 62, 190, 62);

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text(isCzech ? 'Dodavatel' : 'Supplier', 20, 72);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  let y = 78;
  doc.text(state.profile?.name || 'Your Business', 20, y);
  if (state.profile?.address) { y += 5; doc.text(state.profile.address, 20, y); }
  if (state.profile?.email) { y += 5; doc.text(state.profile.email, 20, y); }

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text(isCzech ? 'Odběratel' : 'Customer', 110, 72);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  y = 78;
  doc.text(client?.name || '-', 110, y);
  if (client?.address) { y += 5; doc.text(client.address, 110, y); }
  if (client?.invoice_email) { y += 5; doc.text(client.invoice_email, 110, y); }

  y = Math.max(y, 95) + 10;

  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(isCzech ? 'Položka / Description' : 'Description', 20, y);
  doc.text(isCzech ? 'Hod.' : 'Hours', 120, y, { align: 'right' });
  doc.text(isCzech ? 'Sazba' : 'Rate', 150, y, { align: 'right' });
  doc.text(isCzech ? 'Částka' : 'Amount', 190, y, { align: 'right' });

  y += 2;
  doc.setLineWidth(0.3);
  doc.line(20, y, 190, y);
  y += 7;

  doc.setFont(undefined, 'normal');
  items.forEach(item => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(item.description, 20, y);
    doc.text(item.hours.toFixed(2), 120, y, { align: 'right' });
    doc.text(`${item.rate.toFixed(2)} ${client?.currency || 'USD'}`, 150, y, { align: 'right' });
    doc.text(`${(item.hours * item.rate).toFixed(2)} ${client?.currency || 'USD'}`, 190, y, { align: 'right' });
    y += 7;
  });

  y += 5;
  doc.setLineWidth(0.5);
  doc.line(120, y, 190, y);
  y += 8;

  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text(isCzech ? 'CELKEM / TOTAL:' : 'TOTAL:', 120, y);
  doc.text(`${inv.total?.toFixed(2)} ${client?.currency || 'USD'}`, 190, y, { align: 'right' });

  y += 15;
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  if (state.profile?.bank_accounts?.length) {
    doc.text(isCzech ? 'Bankovní spojení / Bank Details:' : 'Bank Details:', 20, y);
    y += 6;
    state.profile.bank_accounts.forEach(acc => {
      doc.text(`${acc.label}: ${acc.number}`, 20, y);
      y += 5;
    });
  }
  y += 3;
  doc.text(isCzech ? 'Nejsem plátce DPH. / Not a VAT payer.' : 'Not a VAT payer.', 20, y);

  doc.save(`invoice-${inv.id}.pdf`);
};

window.markInvoicePaid = async (id) => {
  await database.markInvoicePaid(id);
  await loadData();
  showView('dashboard');
  showToast(t('saveSuccess'));
};

window.deleteInvoice = async (id) => {
  if (confirm(t('confirmDelete'))) {
    await database.deleteInvoice(id);
    await loadData();
    showView('dashboard');
    showToast(t('deleteSuccess'));
  }
};

window.restoreItem = async (table, id) => {
  await database.restore(table, id);
  await loadData();
  showView('trash');
  showToast(t('restoreSuccess'));
};

window.deleteForever = async (table, id) => {
  if (confirm(t('confirmDeleteForever'))) {
    await database.hardDelete(table, id);
    await loadData();
    showView('trash');
    showToast(t('deleteSuccess'));
  }
};

// Utility Functions
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
