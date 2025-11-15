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
        total: type === 'deposit' ? -amount : amount // Store deposits as negative
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
  if (!client) {
    showToast('Client not found', 'error');
    return;
  }

  // Get job lines (expenses and deposits)
  const jobLines = await database.getJobLines(jobId);
  const expenses = jobLines.filter(line => line.type === 'expense');
  const deposits = jobLines.filter(line => line.type === 'deposit');

  const hours = parseFloat(job.hours) || 0;
  const rate = parseFloat(job.rate) || parseFloat(client.rate) || 0;
  const currency = job.currency || client.currency || 'CZK';
  const jobAmount = hours * rate;

  // Calculate totals
  const totalExpenses = expenses.reduce((sum, exp) => sum + parseFloat(exp.total || 0), 0);
  const totalDeposits = Math.abs(deposits.reduce((sum, dep) => sum + parseFloat(dep.total || 0), 0));
  const totalInvoice = jobAmount + totalExpenses;
  const amountDue = totalInvoice - totalDeposits;

  let dateRange = '';
  if (job.start_date && job.end_date) {
    dateRange = `${formatDate(job.start_date)} - ${formatDate(job.end_date)}`;
  } else if (job.start_date) {
    dateRange = formatDate(job.start_date);
  }

  const descParts = [job.name];
  if (job.description) descParts.push(job.description);
  if (job.address) descParts.push(job.address);
  if (dateRange) descParts.push(dateRange);
  const fullDescription = descParts.join('\n');

  // Build items array with job, expenses, and deposits
  const items = [];

  // Main job item
  items.push({
    description: fullDescription,
    hours: hours,
    rate: rate,
    amount: jobAmount
  });

  // Add expenses
  expenses.forEach(expense => {
    items.push({
      description: `${t('expenses')}: ${expense.description}`,
      amount: parseFloat(expense.total || 0)
    });
  });

  // Add deposits (shown as negative)
  deposits.forEach(deposit => {
    items.push({
      description: `${t('deposits')}: ${deposit.description}`,
      amount: parseFloat(deposit.total || 0)
    });
  });

  // Generate invoice ID in format YYMMDD-II
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

  const invoiceData = {
    id: invoiceId,
    client_id: job.client_id,
    job_id: jobId,
    items: JSON.stringify(items),
    subtotal: totalInvoice,
    total: amountDue,
    currency: currency,
    status: 'unpaid',
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    meta: JSON.stringify({
      jobAmount: jobAmount,
      totalExpenses: totalExpenses,
      totalDeposits: totalDeposits,
      totalInvoice: totalInvoice,
      amountDue: amountDue
    })
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

// Replace the two functions `window.viewInvoice` and `window.downloadInvoice` in app.js
// This version forces a bilingual template: Czech first, English second. Layout and logic unchanged.

window.viewInvoice = async (id) => {
  const inv = state.invoices.find(i => i.id === id);
  if (!inv) return;

  const client = state.clients.find(c => c.id === inv.client_id);
  const items = typeof inv.items === 'string' ? JSON.parse(inv.items || '[]') : (inv.items || []);

  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>FAKTURA / INVOICE #${inv.id}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 50px; max-width: 900px; margin: 0 auto; color: #000; background: #fff; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
        .invoice-title { font-size: 36px; font-weight: bold; }
        .invoice-meta { text-align: right; font-size: 14px; line-height: 1.8; }
        .invoice-meta div { margin-bottom: 2px; }
        .separator { border-bottom: 2px solid #000; margin: 25px 0; }
        .parties { display: flex; justify-content: space-between; margin: 30px 0 40px 0; }
        .party { width: 48%; }
        .party h3 { font-size: 15px; font-weight: bold; margin-bottom: 8px; }
        .party p { margin: 0; font-size: 14px; line-height: 1.5; }
        table { width: 100%; border-collapse: collapse; margin: 30px 0; }
        th { background: #f8f8f8; padding: 12px; text-align: left; font-weight: bold; font-size: 13px; border-bottom: 2px solid #333; }
        th.right { text-align: right; }
        td { padding: 12px; font-size: 14px; border-bottom: 1px solid #e0e0e0; }
        td:first-child { max-width: 400px; word-wrap: break-word; white-space: normal; }
        td.right { text-align: right; }
        .total-section { text-align: right; margin-top: 30px; }
        .total-line { font-size: 20px; font-weight: bold; padding: 15px 0; border-top: 2px solid #000; }
        .footer-info { margin-top: 50px; font-size: 13px; line-height: 1.8; }
        .footer-info p { margin: 3px 0; }
        @media print { body { padding: 30px; } .no-print { display: none; } }
        .print-btn { padding: 14px 28px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 15px; margin-top: 40px; font-weight: 500; }
        .print-btn:hover { background: #4f46e5; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 class="invoice-title">FAKTURA / INVOICE</h1>
        <div class="invoice-meta">
          <div><strong>Číslo faktury / Invoice #:</strong> ${inv.id}</div>
          <div><strong>Datum vystavení / Issue date:</strong> ${formatDate(inv.created_at)}</div>
          <div><strong>Datum splatnosti / Due date:</strong> ${formatDate(inv.due_date)}</div>
          <div><strong>Forma úhrady / Payment Method:</strong> Bankovní převod / Bank transfer</div>
        </div>
      </div>

      <div class="separator"></div>

      <div class="parties">
        <div class="party">
          <h3>Dodavatel / Supplier</h3>
          <p>
            <strong>${state.profile?.name || 'Your Business'}</strong><br>
            ${state.profile?.address || ''}<br>
            ${(() => {
              const parts = [];
              const ids = state.profile?.id_entries || [];
              if (Array.isArray(ids) && ids.length) return ids.map(id => `${id.label}: ${id.number}`).join('<br>');
              for (let i=1;i<=4;i++){
                const label = state.profile?.[`id_label_${i}`];
                const num = state.profile?.[`id_number_${i}`];
                if (label || num) parts.push(`${label || 'ID'}: ${num || ''}`);
              }
              return parts.join('<br>');
            })() || ''}
          </p>
        </div>

        <div class="party">
          <h3>Odběratel / Customer</h3>
          <p>
            <strong>${client?.name || '-'}</strong><br>
            ${client?.address || ''}<br>
            ${(() => {
              const parts = [];
              const ids = client?.id_entries || [];
              if (Array.isArray(ids) && ids.length) return ids.map(id => `${id.label}: ${id.number}`).join('<br>');
              for (let i=1;i<=4;i++){
                const label = client?.[`id_label_${i}`];
                const num = client?.[`id_number_${i}`];
                if (label || num) parts.push(`${label || 'ID'}: ${num || ''}`);
              }
              return parts.join('<br>');
            })() || ''}
          </p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Položka / Description</th>
            <th class="right">Počet hodin / Hours</th>
            <th class="right">Sazba/hod. / Rate</th>
            <th class="right">Částka / Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${item.description}</td>
              <td class="right">${(item.hours || 0).toFixed(2)}</td>
              <td class="right">${formatCurrency(item.rate || 0)} ${client?.currency || 'CZK'}</td>
              <td class="right">${formatCurrency((item.hours * item.rate) || 0)} ${client?.currency || 'CZK'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="total-section">
        <div class="total-line">CELKEM K ÚHRADĚ / TOTAL DUE: ${formatCurrency(inv.total || 0)} ${client?.currency || 'CZK'}</div>
      </div>

      <div class="footer-info">
        <p><strong>Bankovní spojení / Bank Details:</strong></p>
        ${state.profile?.bank_entries?.map(acc => `<p>${acc.label}: ${acc.number}</p>`).join('') || '<p>Nezadáno / Not specified</p>'}
        <p style="margin-top: 15px;">Nejsem plátce DPH. / Not a VAT payer.</p>
      </div>

      <div class="no-print">
        <button class="print-btn" onclick="window.print()">Tisk / Print</button>
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
  const items = typeof inv.items === 'string' ? JSON.parse(inv.items || '[]') : (inv.items || []);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ putOnlyUsedFonts: true, compress: true, orientation: 'p', unit: 'mm', format: 'a4' });

  // Set font that supports Czech characters
  doc.setFont('Helvetica', 'normal');

  // Remove auto header/date metadata entirely
  doc.setProperties({ title: `invoice-${inv.id}` });

  doc.setFontSize(24);
  doc.text('FAKTURA / INVOICE', 20, 20);

  doc.setFontSize(11);
  doc.text(`Číslo faktury / Invoice #: ${inv.id}`, 20, 35);
  doc.text(`Datum vystavení / Issue date: ${formatDate(inv.created_at)}`, 20, 42);
  doc.text(`Datum splatnosti / Due date: ${formatDate(inv.due_date)}`, 20, 49);
  doc.text('Forma úhrady / Payment: Bankovní převod / Bank transfer', 20, 56);

  doc.setLineWidth(0.5);
  doc.line(20, 62, 190, 62);

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('Dodavatel / Supplier', 20, 72);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  let y = 78;
  doc.text(state.profile?.name || 'Your Business', 20, y);

  if (state.profile?.address) {
    y += 5;
    const addressLines = doc.splitTextToSize(state.profile.address, 80);
    doc.text(addressLines, 20, y);
    y += (addressLines.length * 4);
  }

  const supplierIds = Array.isArray(state.profile?.id_entries) && state.profile.id_entries.length
    ? state.profile.id_entries
    : Array.from({length: 4}, (_, i) => ({
        label: state.profile?.[`id_label_${i+1}`],
        number: state.profile?.[`id_number_${i+1}`]
      })).filter(e => e.label || e.number);
  supplierIds.forEach(id => { y += 5; doc.text(`${id.label}: ${id.number}`, 20, y); });

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('Odběratel / Customer', 110, 72);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  y = 78;
  doc.text(client?.name || '-', 110, y);
  if (client?.address) { y += 5; doc.text(client.address, 110, y); }
  if (client?.invoice_email) { y += 5; doc.text(client.invoice_email, 110, y); }
  const clientIds = Array.isArray(client?.id_entries) && client.id_entries.length
    ? client.id_entries
    : Array.from({length: 4}, (_, i) => ({
        label: client?.[`id_label_${i+1}`],
        number: client?.[`id_number_${i+1}`]
      })).filter(e => e.label || e.number);
  clientIds.forEach(id => { y += 5; doc.text(`${id.label}: ${id.number}`, 110, y); });

  y = Math.max(y, 95) + 10;

  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('Položka / Description', 20, y);
  doc.text('Částka / Amount', 190, y, { align: 'right' });

  y += 2;
  doc.setLineWidth(0.3);
  doc.line(20, y, 190, y);
  y += 7;

  doc.setFont(undefined, 'normal');

  // Separate job items from expenses/deposits
  const jobItems = items.filter(item => item.hours !== undefined);
  const expenseItems = items.filter(item => item.description?.startsWith(t('expenses') + ':'));
  const depositItems = items.filter(item => item.description?.startsWith(t('deposits') + ':'));

  // Show job items with hours/rate columns
  jobItems.forEach(item => {
    if (y > 270) { doc.addPage(); y = 20; }

    const descWidth = 90;
    const descLines = doc.splitTextToSize(item.description, descWidth);

    doc.text(descLines, 20, y);
    doc.text(`${(item.hours || 0).toFixed(2)} hod × ${formatCurrency(item.rate || 0)} ${client?.currency || 'CZK'}`, 120, y);
    doc.text(`${formatCurrency(item.amount || 0)} ${client?.currency || 'CZK'}`, 190, y, { align: 'right' });

    y += Math.max(7, descLines.length * 5);
  });

  // Show expenses
  if (expenseItems.length > 0) {
    y += 5;
    doc.setFont(undefined, 'bold');
    doc.text(`${t('expenses')}:`, 20, y);
    doc.setFont(undefined, 'normal');
    y += 7;

    expenseItems.forEach(item => {
      if (y > 270) { doc.addPage(); y = 20; }
      const description = item.description.replace(t('expenses') + ': ', '');
      doc.text(`  ${description}`, 20, y);
      doc.text(`${formatCurrency(item.amount || 0)} ${client?.currency || 'CZK'}`, 190, y, { align: 'right' });
      y += 7;
    });
  }

  // Show deposits
  if (depositItems.length > 0) {
    y += 5;
    doc.setFont(undefined, 'bold');
    doc.text(`${t('deposits')}:`, 20, y);
    doc.setFont(undefined, 'normal');
    y += 7;

    depositItems.forEach(item => {
      if (y > 270) { doc.addPage(); y = 20; }
      const description = item.description.replace(t('deposits') + ': ', '');
      doc.text(`  ${description}`, 20, y);
      doc.text(`${formatCurrency(item.amount || 0)} ${client?.currency || 'CZK'}`, 190, y, { align: 'right' });
      y += 7;
    });
  }

  y += 5;
  doc.setLineWidth(0.5);
  doc.line(120, y, 190, y);
  y += 8;

  // Get meta data for totals
  const meta = inv.meta ? (typeof inv.meta === 'string' ? JSON.parse(inv.meta) : inv.meta) : {};

  // Show detailed totals if we have meta data
  if (meta.jobAmount !== undefined) {
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`${t('jobAmount')}:`, 120, y);
    doc.text(`${formatCurrency(meta.jobAmount || 0)} ${client?.currency || 'CZK'}`, 190, y, { align: 'right' });
    y += 6;

    if (meta.totalExpenses > 0) {
      doc.text(`${t('totalExpenses')}:`, 120, y);
      doc.text(`${formatCurrency(meta.totalExpenses || 0)} ${client?.currency || 'CZK'}`, 190, y, { align: 'right' });
      y += 6;
    }

    doc.setFont(undefined, 'bold');
    doc.text(`${t('totalInvoice')}:`, 120, y);
    doc.text(`${formatCurrency(meta.totalInvoice || 0)} ${client?.currency || 'CZK'}`, 190, y, { align: 'right' });
    y += 6;

    if (meta.totalDeposits > 0) {
      doc.setFont(undefined, 'normal');
      doc.text(`${t('totalDeposits')}:`, 120, y);
      doc.text(`-${formatCurrency(meta.totalDeposits || 0)} ${client?.currency || 'CZK'}`, 190, y, { align: 'right' });
      y += 6;
    }

    y += 3;
    doc.setLineWidth(1);
    doc.line(120, y, 190, y);
    y += 8;
  }

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('CELKEM K ÚHRADĚ / TOTAL DUE:', 20, y);
  doc.text(`${formatCurrency(inv.total || 0)} ${client?.currency || 'CZK'}`, 190, y, { align: 'right' });
  y += 8;

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('CELKEM K ÚHRADĚ / TOTAL DUE:', 20, y);
  doc.text(`${formatCurrency(inv.total || 0)} ${client?.currency || 'CZK'}`, 190, y, { align: 'right' });

  y += 15;
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  if (state.profile?.bank_entries?.length) {
    doc.text('Bankovní spojení / Bank Details:', 20, y);
    y += 6;
    state.profile.bank_entries.forEach(acc => { doc.text(`${acc.label}: ${acc.number}`, 20, y); y += 5; });
  }
  y += 6;
  doc.text('Nejsem plátce DPH. / Not a VAT payer.', 20, y);

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
