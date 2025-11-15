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
  amount = Number(amount) || 0;
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateString) {
  if (!dateString || dateString === 'null' || dateString === 'undefined') return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('cs-CZ', { year: 'numeric', month: '2-digit', day: '2-digit' });
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
            let description = '';
            try {
              let items = [];
try {
  items = typeof inv.items === 'string' ? JSON.parse(inv.items || '[]') : (inv.items || []);
} catch (e) {
  items = [];
}
              description = items[0]?.description || '';
            } catch (e) {}
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
    setTimeout(() => {
      const clientSelect = document.querySelector('#jobForm select[name="client_id"]');
      const rateInput = document.querySelector('#jobForm input[name="rate"]');
      const currencySelect = document.querySelector('#jobForm select[name="currency"]');

      if (clientSelect && rateInput && currencySelect) {
        clientSelect.addEventListener('change', () => {
          const client = state.clients.find(c => c.id === clientSelect.value);
          if (client) {
            rateInput.value = client.rate || '';
            currencySelect.value = client.currency || 'CZK';
          }
        });
      }
    }, 0);



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

      <!-- Description and Address on same row -->
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

      <!-- Continue with dates and other fields -->
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

      <!-- Expenses Section -->
      <div class="form-section">
        <h4>${t('expenses')}</h4>
        <div id="expensesList"></div>
        <button type="button" class="btn btn-secondary" onclick="addExpenseLine()">${t('addExpense')}</button>
      </div>

      <!-- Deposits Section -->
      <div class="form-section">
        <h4>${t('deposits')}</h4>
        <div id="depositsList"></div>
        <button type="button" class="btn btn-secondary" onclick="addDepositLine()">${t('addDeposit')}</button>
      </div>

      <!-- Totals Section -->
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

      clientSelect.addEventListener('change', applyClientDefaults);

      if (clientSelect.value && (!rateInput.value || !currencySelect.value)) {
        applyClientDefaults();
      }
    }

    // Initialize expenses and deposits if editing
    if (jobId) {
      loadJobLines(jobId);
    }

    // Setup calculation updates
    setupJobCalculations();
  }

// Helper functions for job form expenses and deposits
function addExpenseLine(description = '', amount = '') {
  const expensesList = document.getElementById('expensesList');
  const lineId = 'expense_' + Date.now();

  const lineHtml = `
    <div class="line-item" id="${lineId}">
      <input type="text" placeholder="${t('expenseDescription')}" value="${description}"
             onchange="window.updateCalculations()" style="flex: 1; margin-right: 10px;">
      <input type="number" step="0.01" placeholder="0.00" value="${amount}"
             onchange="window.updateCalculations()" style="width: 100px; margin-right: 10px;">
      <button type="button" onclick="removeLine('${lineId}')"
              style="padding: 5px 8px; background: #dc3545; color: white; border: none; cursor: pointer;">×</button>
    </div>
  `;

  expensesList.insertAdjacentHTML('beforeend', lineHtml);
  window.updateCalculations();
}

function addDepositLine(description = '', amount = '') {
  const depositsList = document.getElementById('depositsList');
  const lineId = 'deposit_' + Date.now();

  const lineHtml = `
    <div class="line-item" id="${lineId}">
      <input type="text" placeholder="${t('depositDescription')}" value="${description}"
             onchange="window.updateCalculations()" style="flex: 1; margin-right: 10px;">
      <input type="number" step="0.01" placeholder="0.00" value="${amount}"
             onchange="window.updateCalculations()" style="width: 100px; margin-right: 10px;">
      <button type="button" onclick="removeLine('${lineId}')"
              style="padding: 5px 8px; background: #dc3545; color: white; border: none; cursor: pointer;">×</button>
    </div>
  `;

  depositsList.insertAdjacentHTML('beforeend', lineHtml);
  window.updateCalculations();
}

function removeLine(lineId) {
  document.getElementById(lineId)?.remove();
  window.updateCalculations();
}

function collectLineItems(type) {
  const container = type === 'expense' ? 'expensesList' : 'depositsList';
  const lines = document.querySelectorAll(`#${container} .line-item`);
  const items = [];

  lines.forEach(line => {
    const description = line.querySelector('input[type="text"]').value.trim();
    const amount = parseFloat(line.querySelector('input[type="number"]').value) || 0;

    if (description && amount > 0) {
      items.push({
        type: type,
        description: description,
        amount: type === 'deposit' ? -amount : amount // Store deposits as negative
      });
    }
  });

  return items;
}

function setupJobCalculations() {
  const hoursInput = document.querySelector('#jobForm input[name="hours"]');
  const rateInput = document.querySelector('#jobForm input[name="rate"]');

  if (hoursInput && rateInput) {
    hoursInput.addEventListener('input', updateCalculations);
    rateInput.addEventListener('input', updateCalculations);
  }

  updateCalculations();
}

function updateCalculations() {
  const hours = parseFloat(document.querySelector('#jobForm input[name="hours"]')?.value) || 0;
  const rate = parseFloat(document.querySelector('#jobForm input[name="rate"]')?.value) || 0;

  const jobAmount = hours * rate;

  // Calculate expenses total
  const expenseInputs = document.querySelectorAll('#expensesList input[type="number"]');
  let totalExpenses = 0;
  expenseInputs.forEach(input => {
    totalExpenses += parseFloat(input.value) || 0;
  });

  // Calculate deposits total
  const depositInputs = document.querySelectorAll('#depositsList input[type="number"]');
  let totalDeposits = 0;
  depositInputs.forEach(input => {
    totalDeposits += parseFloat(input.value) || 0;
  });

  const totalInvoice = jobAmount + totalExpenses;
  const amountDue = totalInvoice - totalDeposits;

  // Update displays
  const displayJobAmount = document.getElementById('displayJobAmount');
  if (displayJobAmount) {
    displayJobAmount.textContent = formatCurrency(jobAmount);
  }

  const displayTotalExpenses = document.getElementById('displayTotalExpenses');
  if (displayTotalExpenses) {
    displayTotalExpenses.textContent = formatCurrency(totalExpenses);
  }

  const displayTotalInvoice = document.getElementById('displayTotalInvoice');
  if (displayTotalInvoice) {
    displayTotalInvoice.textContent = formatCurrency(totalInvoice);
  }

  const displayTotalDeposits = document.getElementById('displayTotalDeposits');
  if (displayTotalDeposits) {
    displayTotalDeposits.textContent = totalDeposits > 0 ? '-' + formatCurrency(totalDeposits) : '-' + formatCurrency(0);
  }

  const displayAmountDue = document.getElementById('displayAmountDue');
  if (displayAmountDue) {
    displayAmountDue.textContent = formatCurrency(amountDue);
  }
}

async function loadJobLines(jobId) {
  try {
    const lines = await database.getJobLines(jobId);

    lines.forEach(line => {
      if (line.type === 'expense') {
        addExpenseLine(line.description, line.total);
      } else if (line.type === 'deposit') {
        addDepositLine(line.description, Math.abs(line.total)); // Convert back to positive for display
      }
    });

    updateCalculations();
  } catch (err) {
    console.error('Failed to load job lines:', err);
  }
}

// Make functions available globally
window.addExpenseLine = addExpenseLine;
window.addDepositLine = addDepositLine;
window.removeLine = removeLine;
window.updateCalculations = updateCalculations;


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

        <div class="form-group">
          <label>${t('rate')}</label>
          <input type="number" name="rate" value="${ts.rate || ''}" step="0.01">
        </div>

        <div class="form-group">
          <label>${t('currency')}</label>
          <select name="currency">
            ${(() => {
              const client = ts.client_id ? state.clients.find(c => c.id === ts.client_id) : null;
              const cur = ts.currency || client?.currency || 'CZK';
              return `
                <option value="USD" ${cur === 'USD' ? 'selected' : ''}>USD</option>
                <option value="EUR" ${cur === 'EUR' ? 'selected' : ''}>EUR</option>
                <option value="CZK" ${cur === 'CZK' ? 'selected' : ''}>CZK</option>
                <option value="GBP" ${cur === 'GBP' ? 'selected' : ''}>GBP</option>
              `;
            })()}
          </select>
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

  // inherit client rate/currency if missing
  if (data.client_id) {
    const client = state.clients.find(c => c.id === data.client_id);
    if (client) {
      if (!data.rate || data.rate === '') data.rate = client.rate || 0;
      if (!data.currency || data.currency === '') data.currency = client.currency || 'USD';
    }
  }

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
  if (!client) return showToast('Client not found', 'error');

  // Reload invoices to get accurate count for ID generation
  state.invoices = await database.getInvoices();

  const hours = parseFloat(job.hours) || 0;
  const rate = parseFloat(job.rate) || parseFloat(client.rate) || 0;
  const currency = job.currency || client.currency || 'CZK';
  const total = hours * rate;

  const descParts = [job.name];
  if (job.description) descParts.push(job.description);
  if (job.address) descParts.push(job.address);
  if (job.start_date) descParts.push(formatDate(job.start_date));
  if (job.end_date) descParts.push(`– ${formatDate(job.end_date)}`);
  const fullDescription = descParts.filter(Boolean).join('\n');

  const now = new Date();
  const prefix = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const todayInvs = state.invoices.filter(i => i.id?.startsWith(prefix));
  const next = todayInvs.length ? Math.max(...todayInvs.map(i => parseInt(i.id.split('-')[1]) || 0)) + 1 : 1;
  const invoiceId = `${prefix}-${String(next).padStart(2,'0')}`;

  const invoiceData = {
    id: invoiceId,
    user_id: state.currentUser.id,
    client_id: job.client_id,
    job_id: jobId,
    currency,
    items: JSON.stringify([{ description: fullDescription, hours, rate, amount: total }]),
    total,
    status: 'unpaid',
    created_at: now.toISOString(),
    due_date: new Date(Date.now() + 30*86400000).toISOString().split('T')[0]
  };

  try {
    await database.saveInvoice(invoiceData);
    await database.saveJob({ ...job, billed: true });
    await loadData(); // ← This reloads ALL invoices
    showView('dashboard');
    showToast('Invoice created');
  } catch (err) {
    showToast('Failed', 'error');
  }
}

async function saveProfile(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData);

  const bank_entries = [];
  for (let i = 1; i <= 3; i++) {
    const label = data[`bank_label_${i}`];
    const number = data[`bank_number_${i}`];
    if (label || number) {
      bank_entries.push({ label: label || '', number: number || '' });
    }
    delete data[`bank_label_${i}`];
    delete data[`bank_number_${i}`];
  }

  const id_entries = [];
  for (let i = 1; i <= 4; i++) {
    const label = data[`id_label_${i}`];
    const number = data[`id_number_${i}`];
    if (label || number) {
      id_entries.push({ label: label || '', number: number || '' });
    }
  }

  data.bank_entries = bank_entries;
  data.id_entries = id_entries;

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

  // generate invoice id in same format as createInvoiceFromJob
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePrefix = `${yy}${mm}${dd}`;

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

  const invoice = {
    id: invoiceId,
    client_id: clientId,
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
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    meta: JSON.stringify({ month })
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

    // 1. profile
    if (b.profile) await database.saveProfile({...b.profile, user_id: u});
    // 2. clients
    for (const c of b.clients) await database.saveClient({...c, user_id: u});
    // 3. jobs
    for (const j of b.jobs)       await database.saveJob({...j, user_id: u});
    // 4. timesheets
    for (const t of b.timesheets) await database.saveTimesheet({...t, user_id: u});
    // 5. invoices
    for (const i of b.invoices)   await database.saveInvoice({...i, user_id: u});

    await loadData();
    showView('dashboard');
    showToast('Restored');
  };
}


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
  const job = state.jobs.find(j => j.id === inv.job_id);
  const lines = await database.getJobLines(inv.job_id);
  const expenses = lines.filter(l => l.type === 'expense');
  const deposits = lines.filter(l => l.type === 'deposit');
  const currency = client?.currency || 'CZK';

  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>FAKTURA / INVOICE #${inv.id}</title>
    <style>
      body { font-family: Arial; padding: 40px; max-width: 900px; margin: auto; }
      .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
      .title { font-size: 32px; font-weight: bold; }
      .meta { text-align: right; font-size: 14px; line-height: 1.7; }
      .separator { border-bottom: 2px solid #000; margin: 25px 0; }
      .parties { display: flex; justify-content: space-between; margin: 30px 0; }
      .party { width: 48%; }
      .party h3 { font-size: 15px; font-weight: bold; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; margin: 25px 0; }
      th { background: #f8f8f8; padding: 10px; text-align: left; border-bottom: 2px solid #333; }
      td { padding: 10px; border-bottom: 1px solid #ddd; }
      .right { text-align: right; }
      .total-section { margin-top: 20px; text-align: right; }
      .total-line { font-weight: bold; font-size: 18px; padding: 10px 0; border-top: 2px solid #000; }
      .footer { margin-top: 40px; font-size: 13px; }
      .print-btn { margin-top: 30px; padding: 12px 24px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; }
      @media print { .no-print { display: none; } }
    </style>
    </head><body>
      <div class="header">
        <h1 class="title">FAKTURA / INVOICE</h1>
        <div class="meta">
          <div><strong>Číslo / #:</strong> ${inv.id}</div>
          <div><strong>Datum / Date:</strong> ${formatDate(inv.created_at || '')}</div>
          <div><strong>Splatnost / Due:</strong> ${formatDate(inv.due_date)}</div>
        </div>
      </div>
      <div class="separator"></div>
      <div class="parties">
        <div class="party">
          <h3>Dodavatel / Supplier</h3>
          <p><strong>${state.profile?.name || 'Your Business'}</strong><br>
          ${state.profile?.address || ''}<br>
          ${formatIdEntries(state.profile)}</p>
        </div>
        <div class="party">
          <h3>Odběratel / Customer</h3>
          <p><strong>${client?.name || '-'}</strong><br>
          ${client?.address || ''}<br>
          ${formatIdEntries(client)}</p>
        </div>
      </div>

      ${job ? `<p><strong>Projekt / Job:</strong> ${job.name}</p>` : ''}

      <table>
        <thead><tr>
          <th>Položka / Item</th>
          <th class="right">Množství / Qty</th>
          <th class="right">Cena / Price</th>
          <th class="right">Částka / Amount</th>
        </tr></thead>
        <tbody>
          ${expenses.map(line => `
            <tr><td>${line.description}</td>
            <td class="right">1</td>
            <td class="right">${formatCurrency(line.unit_price)} ${currency}</td>
            <td class="right">${formatCurrency(line.unit_price)} ${currency}</td></tr>
          `).join('')}
          ${deposits.length > 0 ? `<tr style="background:#f9f9f9;">
            <td colspan="3" style="font-weight:bold;">Zálohy / Deposits</td>
            <td class="right" style="font-weight:bold;">-${formatCurrency(deposits.reduce((s,d)=>s+d.unit_price,0))} ${currency}</td>
          </tr>` : ''}
        </tbody>
      </table>

      <div class="total-section">
        <div>CELKEM / SUBTOTAL: ${formatCurrency(inv.subtotal || inv.total)} ${currency}</div>
        <div class="total-line">K ÚHRADĚ / TOTAL DUE: ${formatCurrency(inv.total)} ${currency}</div>
      </div>

      <div class="footer">
        <p><strong>Bankovní spojení / Bank:</strong></p>
        ${formatBankEntries(state.profile)}
        <p style="margin-top:15px;">Nejsem plátce DPH. / Not VAT payer.</p>
      </div>

      <div class="no-print"><button class="print-btn" onclick="window.print()">Tisk / Print</button></div>
    </body></html>
  `);
  win.document.close();
};

// Helper functions
function formatIdEntries(obj) {
  const entries = obj?.id_entries || [];
  if (entries.length) return entries.map(e => `${e.label}: ${e.number}`).join('<br>');
  return [1,2,3,4].map(i => obj?.[`id_label_${i}`] ? `${obj[`id_label_${i}`]}: ${obj[`id_number_${i}`] || ''}` : '').filter(Boolean).join('<br>') || '';
}
function formatBankEntries(profile) {
  return (profile?.bank_entries || []).map(e => `<p>${e.label}: ${e.number}</p>`).join('') || '<p>Nezadáno</p>';
}


window.downloadInvoice = async (id) => {
  const inv = state.invoices.find(i => i.id === id);
  if (!inv) return;
  const client = state.clients.find(c => c.id === inv.client_id);
  const job = state.jobs.find(j => j.id === inv.job_id);
  const lines = await database.getJobLines(inv.job_id);
  const expenses = lines.filter(l => l.type === 'expense');
  const deposits = lines.filter(l => l.type === 'deposit');
  const currency = client?.currency || 'CZK';

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(24);
  doc.text('FAKTURA / INVOICE', 20, 20);
  doc.setFontSize(11);
  doc.text(`Číslo / #: ${inv.id}`, 20, 35);
  doc.text(`Datum / Date: ${formatDate(inv.created_at || '')}`, 20, 42);
  doc.text(`Splatnost / Due: ${formatDate(inv.due_date)}`, 20, 49);

  doc.setLineWidth(0.5);
  doc.line(20, 55, 190, 55);

  // Supplier & Client
  doc.setFontSize(12); doc.setFont(undefined, 'bold');
  doc.text('Dodavatel / Supplier', 20, 65); doc.text('Odběratel / Customer', 110, 65);
  doc.setFont(undefined, 'normal'); doc.setFontSize(10);
  let y = 71;
  doc.text(state.profile?.name || 'Your Business', 20, y);
  if (state.profile?.address) { y += 5; doc.text(state.profile.address, 20, y); }
  y += 5; doc.text(formatIdEntries(state.profile), 20, y, { maxWidth: 80 });

  y = 71;
  doc.text(client?.name || '-', 110, y);
  if (client?.address) { y += 5; doc.text(client.address, 110, y); }
  y += 5; doc.text(formatIdEntries(client), 110, y, { maxWidth: 80 });

  if (job) { y += 10; doc.text(`Projekt / Job: ${job.name}`, 20, y); }

  y = Math.max(y, 95) + 10;
  doc.setFontSize(10); doc.setFont(undefined, 'bold');
  doc.text('Položka / Item', 20, y);
  doc.text('Množ. / Qty', 115, y, { align: 'right' });
  doc.text('Cena / Price', 145, y, { align: 'right' });
  doc.text('Částka / Amount', 190, y, { align: 'right' });
  y += 2; doc.line(20, y, 190, y); y += 7;

  doc.setFont(undefined, 'normal');
  expenses.forEach(line => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.text(line.description, 20, y, { maxWidth: 90 });
    doc.text('1', 115, y, { align: 'right' });
    doc.text(`${formatCurrency(line.unit_price)} ${currency}`, 145, y, { align: 'right' });
    doc.text(`${formatCurrency(line.unit_price)} ${currency}`, 190, y, { align: 'right' });
    y += 7;
  });

  if (deposits.length > 0) {
    const depTotal = deposits.reduce((s,d) => s + d.unit_price, 0);
    doc.setFont(undefined, 'bold');
    doc.text('Zálohy / Deposits', 20, y, { maxWidth: 90 });
    doc.text(`-${formatCurrency(depTotal)} ${currency}`, 190, y, { align: 'right' });
    y += 7;
  }

  y += 5; doc.line(120, y, 190, y); y += 8;
  doc.setFontSize(12); doc.setFont(undefined, 'bold');
  doc.text('CELKEM / SUBTOTAL:', 20, y);
  doc.text(`${formatCurrency(inv.subtotal || inv.total)} ${currency}`, 190, y, { align: 'right' });
  y += 8;
  doc.text('K ÚHRADĚ / TOTAL DUE:', 20, y);
  doc.text(`${formatCurrency(inv.total)} ${currency}`, 190, y, { align: 'right' });

  y += 15;
  doc.setFontSize(11);
  if (state.profile?.bank_entries?.length) {
    doc.text('Bankovní spojení / Bank:', 20, y); y += 6;
    state.profile.bank_entries.forEach(acc => { doc.text(`${acc.label}: ${acc.number}`, 20, y); y += 5; });
  }
  y += 6; doc.text('Nejsem plátce DPH. / Not VAT payer.', 20, y);

  doc.save(`invoice-${inv.id}.pdf`);
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
