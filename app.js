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

// Utility Functions
function formatCurrency(amount) {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

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

async function loadData() {
  try {
    const data = await database.loadDashboard();
    state.clients = data.clients || [];
    state.jobs = data.jobs || [];
    state.timesheets = data.timesheets || [];
    state.invoices = data.invoices || [];
    state.profile = data.business;
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

  const defaultCurrency = state.profile?.currency || state.clients[0]?.currency || 'CZK';

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">${t('totalInvoiced')}</div>
        <div class="stat-value">${formatCurrency(totalInvoiced)} ${defaultCurrency}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t('totalReceived')}</div>
        <div class="stat-value">${formatCurrency(totalReceived)} ${defaultCurrency}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t('totalOverdue')}</div>
        <div class="stat-value">${formatCurrency(totalOverdue)} ${defaultCurrency}</div>
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
            <th>${t('client')}</th>
            <th>${t('description')}</th>
            <th>${t('type')}</th>
            <th>${t('amount')}</th>
            <th>${t('status')}</th>
            <th>${t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          ${state.invoices.length === 0 ? `
            <tr><td colspan="8" class="text-center text-muted">${t('noData')}</td></tr>
          ` : state.invoices.map((inv, i) => {
            const client = state.clients.find(c => c.id === inv.client_id);
            const currency = client?.currency || 'CZK';
            const items = typeof inv.items === 'string' ? JSON.parse(inv.items || '[]') : (inv.items || []);
            const description = items.length > 0 ? items[0].description : '';
            const truncatedDesc = description.length > 30 ? description.substring(0, 30) + '...' : description;
            return `
            <tr>
              <td>${i + 1}</td>
              <td>${formatDate(inv.created_at)}</td>
              <td>${client?.name || '-'}</td>
              <td title="${description}">${truncatedDesc || '-'}</td>
              <td>${t('invoice')}</td>
              <td>${formatCurrency(inv.total || 0)} ${currency}</td>
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
            `;
          }).join('')}
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
            <h3 class="mb-2">${t('bankAccounts')}</h3>
            ${[1,2,3].map(i => {
              const bank = profile.bank_entries?.[i-1] || {};
              return `
              <div class="form-grid">
                <div class="form-group">
                  <label>${t('bankLabel')} ${i}</label>
                  <input type="text" name="bank_label_${i}" value="${bank.label || ''}">
                </div>
                <div class="form-group">
                  <label>${t('bankNumber')} ${i}</label>
                  <input type="text" name="bank_number_${i}" value="${bank.number || ''}">
                </div>
              </div>
              `;
            }).join('')}
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
      // The onSave function will handle form data collection and submission
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
          ${[1, 2, 3, 4].map(i => `
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

    // inherit client rate/currency if blank
    if (data.client_id) {
      const client = state.clients.find(c => c.id === data.client_id);
      if (client) {
        if (!data.rate || data.rate === '') data.rate = client.rate || 0;
        if (!data.currency || data.currency === '') data.currency = client.currency || 'USD';
      }
    }

    if (!data.id) delete data.id;
    if (data.client_id === '') delete data.client_id;
    if (data.rate === '') delete data.rate;
    if (data.hours === '') delete data.hours;
    if (data.start_date === '') delete data.start_date;
    if (data.end_date === '') delete data.end_date;

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

// Job Forms
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
          <input type="text" name="name" value="${job.name || ''}" required autocomplete="off">
        </div>

      </div>

      <div class="form-grid">
        <div class="form-group">
          <label>${t('jobDescription')}</label>
          <textarea name="description" rows="3">${job.description || ''}</textarea>
        </div>

        <div class="form-group">
          <label>${t('address')}</label>
          <textarea name="address" rows="3">${job.address || ''}</textarea>
        </div>
      </div>

      <div class="form-grid">

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
          <input type="number" name="rate" value="${job.rate || (job.client_id ? (state.clients.find(c => c.id === job.client_id)?.rate || '') : '')}" step="0.01">
        </div>

        <div class="form-group">
          <label>${t('currency')}</label>
          <select name="currency">
            ${(() => {
              const client = job.client_id ? state.clients.find(c => c.id === job.client_id) : null;
              const cur = job.currency || client?.currency || '';
              return `
                <option value="USD" ${cur === 'USD' ? 'selected' : ''}>USD</option>
                <option value="EUR" ${cur === 'EUR' ? 'selected' : ''}>EUR</option>
                <option value="CZK" ${cur === 'CZK' ? 'selected' : ''}>CZK</option>
                <option value="GBP" ${cur === 'GBP' ? 'selected' : ''}>GBP</option>
              `;
            })()}
          </select>
        </div>

      </div>

      <div class="form-section">
        <h4>${t('expenses')}</h4>
        <div id="expensesList"></div>
        <button type="button" class="btn btn-secondary" onclick="addExpenseLine()">${t('addExpense')}</button>
      </div>

      <div class="form-section">
        <h4>${t('deposits')}</h4>
        <div id="depositsList"></div>
        <button type="button" class="btn btn-secondary" onclick="addDepositLine()">${t('addDeposit')}</button>
      </div>

      <div class="totals-display" style="background: #e8f4fd; border: 2px solid #0066cc; padding: 15px; margin: 15px 0;">
        <h4 style="color: #0066cc; margin-top: 0;">${t('calculatedTotals')}</h4>
        <div class="total-row">
          <span>${t('jobAmount')}:</span>
          <span id="displayJobAmount">0.00</span>
        </div>
        <div class="total-row">
          <span>${t('totalExpenses')}:</span>
          <span id="displayTotalExpenses">0.00</span>
        </div>
        <div class="total-row" style="border-top: 1px solid #0066cc; padding-top: 5px; font-weight: bold;">
          <span>${t('totalInvoice')}:</span>
          <span id="displayTotalInvoice">0.00</span>
        </div>
        <div class="total-row">
          <span>${t('totalDeposits')}:</span>
          <span id="displayTotalDeposits" style="color: #d63384;">0.00</span>
        </div>
        <div class="total-row" style="border-top: 2px solid #0066cc; padding-top: 5px; font-weight: bold; font-size: 1.1em;">
          <span>${t('amountDue')}:</span>
          <span id="displayAmountDue" style="color: #198754;">0.00</span>
        </div>
      </div>

      <input type="hidden" name="id" value="${job.id || ''}">
    </form>
    `, async () => {
      const form = document.getElementById('jobForm');
      const formData = new FormData(form);
      const data = Object.fromEntries(formData);

      if (data.client_id) {
        const client = state.clients.find(c => c.id === data.client_id);
        if (client) {
          if (!data.rate || data.rate === '') data.rate = client.rate ?? '';
          if (!data.currency || data.currency === '') data.currency = client.currency ?? '';
        }
      }

      if (!data.id) delete data.id;
      if (data.client_id === '') delete data.client_id;
      if (data.rate === '') delete data.rate;
      if (data.hours === '') delete data.hours;
      if (data.start_date === '') delete data.start_date;
      if (data.end_date === '') delete data.end_date;

      // Collect expenses and deposits
      const expenses = collectLineItems('expense');
      const deposits = collectLineItems('deposit');

      try {
        const savedJob = await database.saveJob(data);
        const jobId = savedJob.id || data.id;

        // Save expenses and deposits to job_lines table
        await database.saveJobLines(jobId, expenses, deposits);

        state.jobs = await database.getJobs();
        showView('jobs');
        showToast(t('saveSuccess'));
      } catch (err) {
        console.error('Save failed:', err);
        showToast('Save failed', 'error');
      }
    });

    const clientSelect = document.querySelector('#jobForm select[name="client_id"]');
    const rateInput = document.querySelector('#jobForm input[name="rate"]');
    const currencySelect = document.querySelector('#jobForm select[name="currency"]');

    if (clientSelect && rateInput && currencySelect) {
      const applyClientDefaults = () => {
        const client = state.clients.find(c => c.id === clientSelect.value);
        if (!client) {
          rateInput.value = '';
          currencySelect.value = '';
          return;
        }
        rateInput.value = client.rate || '';
        currencySelect.value = client.currency || 'CZK';
      };

      // FIX: Complete the addEventListener call
      clientSelect.addEventListener('change', applyClientDefaults);
      // Optional: Call immediately if editing an existing job to load defaults
      if (jobId) applyClientDefaults();
    }
}

// Timesheet Forms
function showTimesheetForm(timesheetId = null) {
  const ts = timesheetId ? state.timesheets.find(t => t.id === timesheetId) : {};

  showModal(timesheetId ? t('editLog') : t('addLog'), `
    <form id="timesheetForm">
      <div class="form-grid">
        <div class="form-group">
          <label>${t('date')} *</label>
          <input type="date" name="date" value="${ts.date || new Date().toISOString().substring(0, 10)}" required>
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
          <input type="number" name="hours" value="${ts.hours || ''}" step="0.01" required>
        </div>

        <div class="form-group full-width">
          <label>${t('notes')}</label>
          <textarea name="notes">${ts.notes || ''}</textarea>
        </div>
      </div>
      <input type="hidden" name="id" value="${ts.id || ''}">
    </form>
  `, async () => {
    const form = document.getElementById('timesheetForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    if (!data.id) delete data.id;
    if (data.client_id === '') delete data.client_id;
    if (data.hours === '') delete data.hours;

    try {
      await database.saveTimesheet(data);
      state.timesheets = await database.getTimesheets();
      showView('worklogs');
      showToast(t('saveSuccess'));
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Save failed', 'error');
    }
  });
}

// Profile Save
async function saveProfile(e) {
  e.preventDefault();
  const form = document.getElementById('profileForm');
  const formData = new FormData(form);
  const data = Object.fromEntries(formData);

  // Group bank accounts
  const bank_entries = [];
  for (let i = 1; i <= 3; i++) {
    const label = data[`bank_label_${i}`];
    const number = data[`bank_number_${i}`];
    delete data[`bank_label_${i}`];
    delete data[`bank_number_${i}`];

    if (label || number) {
      bank_entries.push({ label, number });
    }
  }

  // Remove empty ID fields
  for (let i = 1; i <= 4; i++) {
    if (data[`id_label_${i}`] === '') delete data[`id_label_${i}`];
    if (data[`id_number_${i}`] === '') delete data[`id_number_${i}`];
  }

  data.bank_entries = bank_entries;

  try {
    await database.saveBusiness(data);
    state.profile = await database.getBusiness();
    showView('profile');
    showToast(t('saveSuccess'));
  } catch (err) {
    console.error('Save failed:', err);
    showToast('Save failed', 'error');
  }
}

// Invoice Generation
async function generateInvoice() {
  const clientId = document.getElementById('invoiceClient').value;
  const month = document.getElementById('invoiceMonth').value;

  if (!clientId || !month) {
    showToast(t('selectClientAndMonth'), 'warning');
    return;
  }

  // Generate date range for the month
  const [year, mo] = month.split('-');
  const startDate = `${year}-${mo}-01`;
  const endDate = new Date(year, parseInt(mo), 0).toISOString().substring(0, 10);

  // Filter timesheets for the selected client and month that haven't been billed
  const worklogs = state.timesheets.filter(ts =>
    ts.client_id === clientId &&
    !ts.billed &&
    ts.date >= startDate &&
    ts.date <= endDate
  );

  if (worklogs.length === 0) {
    showToast(t('noUnbilledWorklogs'), 'warning');
    return;
  }

  const client = state.clients.find(c => c.id === clientId);
  const rate = client.rate || 0;
  const rateType = client.rate_type || 'hourly';

  let totalHours = 0;
  worklogs.forEach(ts => totalHours += parseFloat(ts.hours));

  const amount = totalHours * rate;

  const invoiceData = {
    client_id: clientId,
    invoice_number: `INV-${Date.now()}`,
    created_at: new Date().toISOString().substring(0, 10),
    due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10), // 14 days later
    status: 'unpaid',
    total: amount,
    items: JSON.stringify([
      {
        description: `Work logs for ${client.name} from ${formatDate(startDate)} to ${formatDate(endDate)}`,
        quantity: totalHours,
        unit_price: rate,
        unit: rateType,
        total: amount
      }
    ]),
    linked_worklogs: JSON.stringify(worklogs.map(ts => ts.id))
  };

  try {
    await database.saveInvoice(invoiceData);

    // Mark timesheets as billed
    await database.markTimesheetsBilled(worklogs.map(ts => ts.id));

    await loadData(); // Reload all data
    showView('dashboard');
    showToast(t('invoiceSuccess'));
  } catch (err) {
    console.error('Invoice generation failed:', err);
    showToast('Invoice generation failed', 'error');
  }
}

// Job to Invoice
window.createInvoiceFromJob = async (jobId) => {
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) {
    showToast(t('jobNotFound'), 'error');
    return;
  }
  if (job.billed) {
    showToast(t('jobAlreadyBilled'), 'warning');
    return;
  }

  const client = state.clients.find(c => c.id === job.client_id);
  if (!client) {
    showToast(t('clientNotFound'), 'error');
    return;
  }

  const jobLines = await database.getJobLines(jobId);
  const expenses = jobLines.filter(l => l.type === 'expense');
  const deposits = jobLines.filter(l => l.type === 'deposit');

  const rate = parseFloat(job.rate || client.rate || 0);
  const hours = parseFloat(job.hours || 0);

  const jobAmount = rate * hours;
  const totalExpenses = expenses.reduce((sum, item) => sum + parseFloat(item.amount), 0);
  const totalDeposits = deposits.reduce((sum, item) => sum + parseFloat(item.amount), 0);
  const totalInvoice = jobAmount + totalExpenses;

  const invoiceItems = [];

  if (jobAmount > 0) {
    invoiceItems.push({
      description: job.name,
      quantity: hours,
      unit_price: rate,
      unit: client.rate_type || 'hourly',
      total: jobAmount
    });
  }

  expenses.forEach(exp => {
    invoiceItems.push({
      description: `${t('expense')}: ${exp.description}`,
      quantity: 1,
      unit_price: exp.amount,
      unit: 'item',
      total: exp.amount,
      is_expense: true
    });
  });

  const invoiceData = {
    client_id: job.client_id,
    job_id: job.id,
    invoice_number: `INV-${Date.now()}`,
    created_at: new Date().toISOString().substring(0, 10),
    due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
    status: 'unpaid',
    total: totalInvoice - totalDeposits,
    items: JSON.stringify(invoiceItems),
    linked_deposits: JSON.stringify(deposits.map(d => d.id)),
    deposit_amount: totalDeposits
  };

  try {
    await database.saveInvoice(invoiceData);
    await database.markJobBilled(job.id);

    await loadData();
    showView('jobs');
    showToast(t('invoiceSuccess'));
  } catch (err) {
    console.error('Invoice generation failed:', err);
    showToast('Invoice generation failed', 'error');
  }
}

// Line Item Functions (used in showJobForm)
function collectLineItems(type) {
  const items = [];
  document.querySelectorAll(`#${type}sList .line-item`).forEach(div => {
    const description = div.querySelector('input[name^="description_"]').value;
    const amount = div.querySelector('input[name^="amount_"]').value;
    const id = div.dataset.id;
    if (description && amount) {
      items.push({ id, type, description, amount: parseFloat(amount) });
    }
  });
  return items;
}

window.addExpenseLine = function(description = '', amount = '', id = null) {
  const list = document.getElementById('expensesList');
  const uid = id || `new-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  list.insertAdjacentHTML('beforeend', `
    <div class="line-item" data-id="${id || ''}">
      <div class="form-group">
        <label>${t('expenseDescription')}</label>
        <input type="text" name="description_expense_${uid}" value="${description}" required>
      </div>
      <div class="form-group">
        <label>${t('lineAmount')}</label>
        <input type="number" name="amount_expense_${uid}" value="${amount}" step="0.01" required>
      </div>
      <button type="button" class="btn-icon delete-line" onclick="this.closest('.line-item').remove()">❌</button>
    </div>
  `);
}

window.addDepositLine = function(description = '', amount = '', id = null) {
  const list = document.getElementById('depositsList');
  const uid = id || `new-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  list.insertAdjacentHTML('beforeend', `
    <div class="line-item" data-id="${id || ''}">
      <div class="form-group">
        <label>${t('depositDescription')}</label>
        <input type="text" name="description_deposit_${uid}" value="${description}" required>
      </div>
      <div class="form-group">
        <label>${t('lineAmount')}</label>
        <input type="number" name="amount_deposit_${uid}" value="${amount}" step="0.01" required>
      </div>
      <button type="button" class="btn-icon delete-line" onclick="this.closest('.line-item').remove()">❌</button>
    </div>
  `);
}

// CRUD Wrappers
window.editClient = (id) => showClientForm(id);
window.editJob = (id) => showJobForm(id);
window.editTimesheet = (id) => showTimesheetForm(id);

window.deleteClient = async (id) => {
  if (confirm(t('confirmDelete'))) {
    await database.delete('clients', id);
    await loadData();
    showView('clients');
    showToast(t('deleteSuccess'));
  }
};

window.deleteJob = async (id) => {
  if (confirm(t('confirmDelete'))) {
    await database.delete('jobs', id);
    await loadData();
    showView('jobs');
    showToast(t('deleteSuccess'));
  }
};

window.deleteTimesheet = async (id) => {
  if (confirm(t('confirmDelete'))) {
    await database.delete('timesheets', id);
    await loadData();
    showView('worklogs');
    showToast(t('deleteSuccess'));
  }
};

// Data Management
async function backupData() {
  showToast(t('loading'), 'warning');
  const data = await database.exportData();
  const jsonString = JSON.stringify(data, null, 2);
  downloadFile(jsonString, `bizzhub_backup_${new Date().toISOString().substring(0, 10)}.json`, 'application/json');
  showToast(t('saveSuccess'));
}

async function restoreData(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      showToast(t('loading'), 'warning');
      const data = JSON.parse(e.target.result);
      await database.importData(data);
      await loadData();
      showView('dashboard');
      showToast(t('restoreSuccess'));
    } catch (error) {
      console.error('Restore failed:', error);
      showToast('Restore failed: Invalid file format or data structure.', 'error');
    }
  };
  reader.readAsText(file);
}

// PDF and XLSX Exports
window.viewInvoice = async (id) => {
  const inv = state.invoices.find(i => i.id === id);
  if (!inv) return;
  const url = await generateInvoicePdf(inv);
  window.open(url, '_blank');
};

window.downloadInvoice = async (id) => {
  const inv = state.invoices.find(i => i.id === id);
  if (!inv) return;
  await generateInvoicePdf(inv, true); // true for download
};

async function generateInvoicePdf(inv, download = false) {
  // Ensure jspdf is available globally (from app.html script tag)
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const client = state.clients.find(c => c.id === inv.client_id);
  const profile = state.profile || {};
  const items = typeof inv.items === 'string' ? JSON.parse(inv.items || '[]') : (inv.items || []);
  const currency = client?.currency || 'CZK';

  doc.setFontSize(18);
  doc.text(t('invoice'), 20, 20);

  doc.setFontSize(10);
  doc.text(`${t('invoiceNumber')}: ${inv.invoice_number}`, 150, 20);
  doc.text(`${t('issueDate')}: ${formatDate(inv.created_at)}`, 150, 25);
  doc.text(`${t('dueDate')}: ${formatDate(inv.due_date)}`, 150, 30);

  // Business Info (left side)
  doc.setFontSize(12);
  doc.text(profile.name || 'My Business', 20, 40);
  doc.setFontSize(10);
  let y = 45;
  if (profile.address) { doc.text(profile.address, 20, y); y += 5; }
  if (profile.email) { doc.text(profile.email, 20, y); y += 5; }
  y += 2;
  for (let i = 1; i <= 4; i++) {
    const label = profile[`id_label_${i}`] || '';
    const number = profile[`id_number_${i}`] || '';
    if (label && number) {
      doc.text(`${label}: ${number}`, 20, y); y += 4;
    }
  }

  // Client Info (right side)
  doc.setFontSize(12);
  doc.text(t('client'), 150, 40);
  doc.setFontSize(10);
  y = 45;
  doc.text(client?.name || '-', 150, y); y += 5;
  if (client?.address) { doc.text(client.address, 150, y); y += 5; }
  if (client?.invoice_email) { doc.text(client.invoice_email, 150, y); y += 5; }
  y += 2;
  for (let i = 1; i <= 4; i++) {
    const label = client[`id_label_${i}`] || '';
    const number = client[`id_number_${i}`] || '';
    if (label && number) {
      doc.text(`${label}: ${number}`, 150, y); y += 4;
    }
  }

  // Items Table
  y = Math.max(y + 10, 80);
  const startY = y;
  const tableRows = [];

  items.forEach(item => {
    tableRows.push([
      item.description,
      item.quantity.toLocaleString(),
      `${formatCurrency(item.unit_price)} ${currency}`,
      `${formatCurrency(item.total)} ${currency}`
    ]);
  });

  doc.autoTable({
    startY: startY,
    head: [[t('description'), t('quantity'), t('unitPrice'), t('lineTotal')]],
    body: tableRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1, overflow: 'linebreak' },
    headStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0] },
    columnStyles: {
      1: { halign: 'right', cellWidth: 15 },
      2: { halign: 'right', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 20 },
    },
    didDrawPage: function(data) {
      y = data.cursor.y + 10;
    }
  });

  // Totals
  const totalAmount = inv.total || 0;
  const depositAmount = inv.deposit_amount || 0;
  const amountDue = totalAmount - depositAmount;

  doc.setFontSize(10);
  doc.text(`${t('subtotal')}:`, 150, y);
  doc.text(`${formatCurrency(inv.total_before_deposit || inv.total || 0)} ${currency}`, 180, y, null, null, 'right');
  y += 5;

  if (depositAmount > 0) {
    doc.text(`-${t('totalDeposits')}:`, 150, y);
    doc.text(`${formatCurrency(depositAmount)} ${currency}`, 180, y, null, null, 'right');
    y += 5;
  }

  doc.setFontSize(14);
  doc.text(`${t('amountDue')}:`, 150, y);
  doc.text(`${formatCurrency(amountDue)} ${currency}`, 180, y, null, null, 'right');
  y += 10;

  // Footer / Status
  doc.setFontSize(10);
  doc.text(`Status: ${t(inv.status)}`, 20, y);
  y += 5;

  if (profile.bank_entries && profile.bank_entries.length > 0) {
    doc.setFontSize(12);
    doc.text(t('bankInfo'), 20, y);
    doc.setFontSize(10);
    y += 4;
    profile.bank_entries.forEach(acc => { doc.text(`${acc.label}: ${acc.number}`, 20, y); y += 4; });
  }

  // Save or return for viewing
  if (download) {
    doc.save(`invoice-${inv.invoice_number}.pdf`);
  } else {
    // Return a data URL for viewing
    return doc.output('datauristring');
  }
}

async function exportLedger(type) {
  showToast(t('loading'), 'warning');

  // Prepare data for ledger
  const ledgerData = state.invoices.map(inv => {
    const client = state.clients.find(c => c.id === inv.client_id);
    const currency = client?.currency || 'CZK';
    const items = typeof inv.items === 'string' ? JSON.parse(inv.items || '[]') : (inv.items || []);
    const description = items.length > 0 ? items[0].description : '';

    return {
      'Date': inv.created_at,
      'Client': client?.name || '-',
      'Description': description,
      'Type': t('invoice'),
      'Amount': inv.total || 0,
      'Currency': currency,
      'Status': t(inv.status || 'pending'),
    };
  });

  if (type === 'csv') {
    const csvContent = arrayToCsv(ledgerData);
    downloadFile(csvContent, 'bizzhub_ledger.csv', 'text/csv;charset=utf-8;');
  } else if (type === 'xlsx') {
    const ws = XLSX.utils.json_to_sheet(ledgerData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    downloadFile(wbout, 'bizzhub_ledger.xlsx', 'application/octet-stream');
  }

  showToast(t('saveSuccess'));
}

function arrayToCsv(data) {
  const header = Object.keys(data[0]);
  const csv = [
    header.join(','),
    ...data.map(row => header.map(fieldName => JSON.stringify(row[fieldName])).join(','))
  ].join('\n');
  return csv;
}

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
  toast.className = `toast show toast-${type}`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Start the app
init();
