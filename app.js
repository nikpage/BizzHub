// Utility Functions
function formatCurrency(amount) {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

window.markInvoicePaid = async (id) => {
  await database.markInvoicePaid(id);
  await loadData();
  showView('dashboard');
  showToast('Invoice marked as paid');
};

// Initialize app
async function init() {
// ... (rest of the code)

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

        <div class="form-group">
          <label>${t('dueDateDays')}</label>
          <input type="number" name="due_date_days" value="${client.due_date_days || 30}" min="0">
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

    // Only include due_date_days if it has a value
    if (data.due_date_days === '' || !data.due_date_days) {
      delete data.due_date_days;
    }

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

        <div class="form-group full-width" style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-top: 20px;">
          <h3 style="margin-top: 0; color: #666;">${t('expenses')}</h3>
          <div id="expensesContainer">
            ${(job.expenses || []).map((exp, i) => `
              <div class="expense-row" style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
                <input type="text" placeholder="${t('expenseLabel')}" value="${exp.label || ''}"
                  style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                  data-expense-label="${i}">
                <input type="number" placeholder="${t('expenseAmount')}" value="${exp.amount || ''}" step="0.01"
                  style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                  data-expense-amount="${i}">
                <button type="button" class="remove-expense" data-index="${i}"
                  style="background: #dc3545; color: white; border: none; width: 35px; height: 35px; border-radius: 50%; cursor: pointer; font-size: 18px;">−</button>
              </div>
            `).join('')}
          </div>
          <button type="button" id="addExpense"
            style="background: #28a745; color: white; border: none; width: 35px; height: 35px; border-radius: 50%; cursor: pointer; font-size: 20px; margin-top: 5px;">+</button>
        </div>

        <div class="form-group full-width" style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-top: 15px;">
          <h3 style="margin-top: 0; color: #666;">${t('deposits')}</h3>
          <div id="depositsContainer">
            ${(job.deposits || []).map((dep, i) => `
              <div class="deposit-row" style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
                <input type="number" placeholder="${t('depositAmount')}" value="${dep.amount || ''}" step="0.01"
                  style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                  data-deposit-amount="${i}">
                <button type="button" class="remove-deposit" data-index="${i}"
                  style="background: #dc3545; color: white; border: none; width: 35px; height: 35px; border-radius: 50%; cursor: pointer; font-size: 18px;">−</button>
              </div>
            `).join('')}
          </div>
          <button type="button" id="addDeposit"
            style="background: #28a745; color: white; border: none; width: 35px; height: 35px; border-radius: 50%; cursor: pointer; font-size: 20px; margin-top: 5px;">+</button>
        </div>

        <div class="form-group full-width" style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin-top: 15px;">
          <h3 style="margin-top: 0; color: #1976d2;">${t('invoiceAmount')}</h3>
          <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px;">
            <span>${t('jobTotal')}:</span>
            <span id="summaryJobTotal">0.00</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px;">
            <span>${t('expensesTotal')}:</span>
            <span id="summaryExpensesTotal">0.00</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 15px 0 10px 0; font-weight: bold; font-size: 18px; border-top: 2px solid #1976d2; margin-top: 10px;">
            <span>${t('invoiceAmount')}:</span>
            <span id="summaryInvoiceAmount">0.00</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px; margin-top: 15px;">
            <span>${t('depositsTotal')}:</span>
            <span id="summaryDepositsTotal">0.00</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 15px 0 0 0; font-weight: bold; font-size: 18px; color: #1976d2; border-top: 2px solid #1976d2;">
            <span>${t('dueNow')}:</span>
            <span id="summaryDueNow">0.00</span>
          </div>
        </div>

      </div>

      <input type="hidden" name="id" value="${job.id || ''}">
    </form>
    `, async () => {
      const form = document.getElementById('jobForm');
      const formData = new FormData(form);
      const data = Object.fromEntries(formData);

      // Collect expenses
      const expenses = [];
      document.querySelectorAll('[data-expense-label]').forEach((input, i) => {
        const label = input.value;
        const amount = document.querySelector(`[data-expense-amount="${i}"]`)?.value;
        if (label || amount) {
          expenses.push({ label: label || '', amount: parseFloat(amount) || 0 });
        }
      });
      data.expenses = expenses;

      // Collect deposits
      const deposits = [];
      document.querySelectorAll('[data-deposit-amount]').forEach((input) => {
        const amount = input.value;
        if (amount) {
          deposits.push({ amount: parseFloat(amount) || 0 });
        }
      });
      data.deposits = deposits;

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
    const clientSelect = document.querySelector('#jobForm select[name="client_id"]');
    const rateInput = document.querySelector('#jobForm input[name="rate"]');
    const currencySelect = document.querySelector('#jobForm select[name="currency"]');
    const hoursInput = document.querySelector('#jobForm input[name="hours"]');

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
        updateSummary();
      };

      clientSelect.addEventListener('change', applyClientDefaults);

      if (clientSelect.value && (!rateInput.value || !currencySelect.value)) {
        applyClientDefaults();
      }
    }

    // Add expense row
    document.getElementById('addExpense')?.addEventListener('click', () => {
      const container = document.getElementById('expensesContainer');
      const index = container.children.length;
      const row = document.createElement('div');
      row.className = 'expense-row';
      row.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; align-items: center;';
      row.innerHTML = `
        <input type="text" placeholder="${t('expenseLabel')}"
          style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
          data-expense-label="${index}">
        <input type="number" placeholder="${t('expenseAmount')}" step="0.01"
          style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
          data-expense-amount="${index}">
        <button type="button" class="remove-expense" data-index="${index}"
          style="background: #dc3545; color: white; border: none; width: 35px; height: 35px; border-radius: 50%; cursor: pointer; font-size: 18px;">−</button>
      `;
      container.appendChild(row);
      row.querySelector('[data-expense-amount]').addEventListener('input', updateSummary);
      row.querySelector('.remove-expense').addEventListener('click', (e) => {
        e.target.closest('.expense-row').remove();
        updateSummary();
      });
    });

    // Remove expense handlers
    document.querySelectorAll('.remove-expense').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.target.closest('.expense-row').remove();
        updateSummary();
      });
    });

    // Add deposit row
    document.getElementById('addDeposit')?.addEventListener('click', () => {
      const container = document.getElementById('depositsContainer');
      const index = container.children.length;
      const row = document.createElement('div');
      row.className = 'deposit-row';
      row.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; align-items: center;';
      row.innerHTML = `
        <input type="number" placeholder="${t('depositAmount')}" step="0.01"
          style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
          data-deposit-amount="${index}">
        <button type="button" class="remove-deposit" data-index="${index}"
          style="background: #dc3545; color: white; border: none; width: 35px; height: 35px; border-radius: 50%; cursor: pointer; font-size: 18px;">−</button>
      `;
      container.appendChild(row);
      row.querySelector('[data-deposit-amount]').addEventListener('input', updateSummary);
      row.querySelector('.remove-deposit').addEventListener('click', (e) => {
        e.target.closest('.deposit-row').remove();
        updateSummary();
      });
    });

    // Remove deposit handlers
    document.querySelectorAll('.remove-deposit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.target.closest('.deposit-row').remove();
        updateSummary();
      });
    });

    // Calculate and update summary
    function updateSummary() {
      const hours = parseFloat(hoursInput?.value || 0);
      const rate = parseFloat(rateInput?.value || 0);
      const currency = currencySelect?.value || 'CZK';

      // Job total
      const jobTotal = hours * rate;

      // Expenses total
      let expensesTotal = 0;
      document.querySelectorAll('[data-expense-amount]').forEach(input => {
        expensesTotal += parseFloat(input.value || 0);
      });

      // Invoice amount
      const invoiceAmount = jobTotal + expensesTotal;

      // Deposits total
      let depositsTotal = 0;
      document.querySelectorAll('[data-deposit-amount]').forEach(input => {
        depositsTotal += parseFloat(input.value || 0);
      });

      // Due now
      const dueNow = invoiceAmount - depositsTotal;

      // Update display
      document.getElementById('summaryJobTotal').textContent = `${formatCurrency(jobTotal)} ${currency}`;
      document.getElementById('summaryExpensesTotal').textContent = `${formatCurrency(expensesTotal)} ${currency}`;
      document.getElementById('summaryInvoiceAmount').textContent = `${formatCurrency(invoiceAmount)} ${currency}`;
      document.getElementById('summaryDepositsTotal').textContent = `${formatCurrency(depositsTotal)} ${currency}`;
      document.getElementById('summaryDueNow').textContent = `${formatCurrency(dueNow)} ${currency}`;
    }

    // Add listeners for live calculation
    hoursInput?.addEventListener('input', updateSummary);
    rateInput?.addEventListener('input', updateSummary);
    currencySelect?.addEventListener('change', updateSummary);

    document.querySelectorAll('[data-expense-amount]').forEach(input => {
      input.addEventListener('input', updateSummary);
    });

    document.querySelectorAll('[data-deposit-amount]').forEach(input => {
      input.addEventListener('input', updateSummary);
    });

    // Initial calculation
    updateSummary();
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

  const hours = parseFloat(job.hours) || 0;
  const rate = parseFloat(job.rate) || parseFloat(client.rate) || 0;
  const currency = job.currency || client.currency || 'CZK';
  const jobTotal = hours * rate;

  // Calculate expenses total
  const expenses = job.expenses || [];
  const expensesTotal = expenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);

  // Calculate deposits total
  const deposits = job.deposits || [];
  const depositsTotal = deposits.reduce((sum, dep) => sum + (parseFloat(dep.amount) || 0), 0);

  // Calculate final amounts
  const invoiceAmount = jobTotal + expensesTotal;
  const dueNow = invoiceAmount - depositsTotal;

  // Build items array with job work, expenses, and deposits
  const items = [];

  // Main job line item - use description if available, otherwise name
  items.push({
    description: job.description || job.name || 'Job',
    hours: hours,
    rate: rate,
    amount: jobTotal
  });

  // Add expenses as line items
  expenses.forEach(exp => {
    if (exp.label || exp.amount) {
      items.push({
        description: exp.label || 'Expense',
        hours: null,
        rate: null,
        amount: parseFloat(exp.amount) || 0
      });
    }
  });

  const invoiceNumber = null;


  const invoiceId = crypto.randomUUID();
  const dueDateDays = parseInt(client.due_date_days) || 30;
  const invoiceData = {
    id: invoiceId,
    invoice_number: invoiceNumber,
    client_id: job.client_id,
    job_id: job.id,
    items: JSON.stringify(items),
    subtotal: jobTotal,
    total: dueNow,
    currency: currency,
    status: 'unpaid',
    due_date: new Date(Date.now() + dueDateDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    meta: JSON.stringify({
      job_name: job.name,
      job_description: job.description,
      job_address: job.address,
      job_start_date: job.start_date,
      job_end_date: job.end_date,
      expenses: expenses,
      deposits: deposits,
      expenses_total: expensesTotal,
      deposits_total: depositsTotal,
      invoice_amount: invoiceAmount
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

  const invoiceNumber = null;

  const invoiceId = crypto.randomUUID();
  const invoice = {
    id: invoiceId,
    invoice_number: invoiceNumber,
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

// Replace the two functions `window.viewInvoice` and `window.downloadInvoice` in app.js
// This version forces a bilingual template: Czech first, English second. Layout and logic unchanged.

window.viewInvoice = async (id) => {
  const inv = state.invoices.find(i => i.id === id);
  if (!inv) return;

  const client = state.clients.find(c => c.id === inv.client_id);
  const items = typeof inv.items === 'string' ? JSON.parse(inv.items || '[]') : (inv.items || []);
  const meta = typeof inv.meta === 'string' ? JSON.parse(inv.meta || '{}') : (inv.meta || {});

  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>FAKTURA / INVOICE #${inv.invoice_number || ''}</title>

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
        .job-details { background: #f9f9f9; padding: 20px; margin: 25px 0; border-radius: 8px; }
        .job-details h3 { font-size: 15px; font-weight: bold; margin-bottom: 12px; }
        .job-detail-row { margin: 6px 0; font-size: 14px; }
        .job-detail-row strong { display: inline-block; min-width: 120px; }
        table { width: 100%; border-collapse: collapse; margin: 30px 0; }
        th { background: #f8f8f8; padding: 12px; text-align: left; font-weight: bold; font-size: 13px; border-bottom: 2px solid #333; }
        th.right { text-align: right; }
        td { padding: 12px; font-size: 14px; border-bottom: 1px solid #e0e0e0; }
        td:first-child { max-width: 400px; word-wrap: break-word; white-space: normal; }
        td.right { text-align: right; }
        .totals-section { background: #f0f7ff; padding: 20px; margin: 25px 0; border-radius: 8px; }
        .total-line { display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px; }
        .total-line.main { font-size: 18px; font-weight: bold; border-top: 2px solid #1976d2; padding-top: 12px; margin-top: 10px; }
        .total-line.final { font-size: 20px; font-weight: bold; color: #1976d2; border-top: 2px solid #1976d2; padding-top: 12px; margin-top: 10px; }
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
          <div><strong>Číslo faktury / Invoice #:</strong> ${inv.invoice_number || inv.id}</div>
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

      ${meta.job_name || meta.job_address ? `
        <div class="job-details">
          <h3>Detaily zakázky / Job Details</h3>
          ${meta.job_name ? `<div class="job-detail-row"><strong>Název / Name:</strong> ${meta.job_name}</div>` : ''}
          ${meta.job_address ? `<div class="job-detail-row"><strong>Adresa / Address:</strong> ${meta.job_address}</div>` : ''}
          ${meta.job_start_date || meta.job_end_date ? `
            <div class="job-detail-row">
              <strong>Období / Period:</strong>
              ${meta.job_start_date ? formatDate(meta.job_start_date) : ''}
              ${meta.job_end_date ? '- ' + formatDate(meta.job_end_date) : ''}
            </div>
          ` : ''}
        </div>
      ` : ''}

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
              <td class="right">${item.hours !== null && item.hours !== undefined ? item.hours.toFixed(2) : '-'}</td>
              <td class="right">${item.rate !== null && item.rate !== undefined ? formatCurrency(item.rate) + ' ' + (inv.currency || client?.currency || 'CZK') : '-'}</td>
              <td class="right">${formatCurrency(item.amount || (item.hours * item.rate) || 0)} ${inv.currency || client?.currency || 'CZK'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="totals-section">
        ${meta.expenses_total > 0 || meta.deposits_total > 0 ? `
          <div class="total-line">
            <span>Celkem práce / Job Total:</span>
            <span>${formatCurrency(inv.subtotal || 0)} ${inv.currency || client?.currency || 'CZK'}</span>
          </div>
          ${meta.expenses_total > 0 ? `
            <div class="total-line">
              <span>Výdaje / Expenses:</span>
              <span>${formatCurrency(meta.expenses_total)} ${inv.currency || client?.currency || 'CZK'}</span>
            </div>
          ` : ''}
          <div class="total-line main">
            <span>Celková částka / Invoice Amount:</span>
            <span>${formatCurrency(meta.invoice_amount || inv.total)} ${inv.currency || client?.currency || 'CZK'}</span>
          </div>
          ${meta.deposits_total > 0 ? `
            <div class="total-line">
              <span>Zálohy / Deposits:</span>
              <span>-${formatCurrency(meta.deposits_total)} ${inv.currency || client?.currency || 'CZK'}</span>
            </div>
          ` : ''}
        ` : ''}
        <div class="total-line final">
          <span>CELKEM K ÚHRADĚ / TOTAL DUE:</span>
          <span>${formatCurrency(inv.total || 0)} ${inv.currency || client?.currency || 'CZK'}</span>
        </div>
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


window.downloadInvoice = (id) => {
  window.viewInvoice(id);
};


  const client = state.clients.find(c => c.id === inv.client_id);
  const items = typeof inv.items === 'string' ? JSON.parse(inv.items || '[]') : (inv.items || []);
  const meta = typeof inv.meta === 'string' ? JSON.parse(inv.meta || '{}') : (inv.meta || {});

  window.downloadInvoice = (id) => {
    window.viewInvoice(id);
    setTimeout(() => window.print(), 300);
  };

  // Set font that supports Czech characters
  doc.setFont('Helvetica', 'normal');

  // Remove auto header/date metadata entirely
  doc.setProperties({ title: `invoice-${inv.invoice_number || inv.id}` });

  doc.setFontSize(24);
  doc.text('FAKTURA / INVOICE', 20, 20);

  doc.setFontSize(11);
  doc.text(`Číslo faktury / Invoice #: ${inv.invoice_number || inv.id}`, 20, 35);
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

  // Add job details section if available
  if (meta.job_name || meta.job_address) {
    doc.setFillColor(249, 249, 249);
    doc.rect(20, y, 170, 0, 'F');

    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Detaily zakázky / Job Details', 20, y + 5);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    y += 10;

    if (meta.job_name) {
      doc.text(`Název / Name: ${meta.job_name}`, 22, y);
      y += 5;
    }
    if (meta.job_address) {
      const addrLines = doc.splitTextToSize(`Adresa / Address: ${meta.job_address}`, 166);
      doc.text(addrLines, 22, y);
      y += addrLines.length * 4;
    }
    if (meta.job_start_date || meta.job_end_date) {
      const dateText = `Období / Period: ${meta.job_start_date ? formatDate(meta.job_start_date) : ''} ${meta.job_end_date ? '- ' + formatDate(meta.job_end_date) : ''}`;
      doc.text(dateText, 22, y);
      y += 5;
    }

    y += 5;
  }

  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('Položka / Description', 20, y);
  doc.text('Počet hodin / Hours', 120, y, { align: 'right' });
  doc.text('Sazba/hod. / Rate', 150, y, { align: 'right' });
  doc.text('Částka / Amount', 190, y, { align: 'right' });

  y += 2;
  doc.setLineWidth(0.3);
  doc.line(20, y, 190, y);
  y += 7;

  doc.setFont(undefined, 'normal');
  items.forEach(item => {
    if (y > 260) { doc.addPage(); y = 20; }

    const descWidth = 90;
    const descLines = doc.splitTextToSize(item.description, descWidth);

    doc.text(descLines, 20, y);
doc.text(item.hours !== null && item.hours !== undefined ? item.hours.toFixed(2) : '-', 110, y, { align: 'right' });
doc.text(item.rate !== null && item.rate !== undefined ? `${formatCurrency(item.rate)} ${inv.currency || client?.currency || 'CZK'}` : '-', 140, y, { align: 'right' });
doc.text(`${formatCurrency(item.amount || (item.hours * item.rate) || 0)} ${inv.currency || client?.currency || 'CZK'}`, 170, y, { align: 'right' });

    y += Math.max(7, descLines.length * 5);
  });

  y += 5;
  doc.setLineWidth(0.5);
  doc.line(120, y, 190, y);
  y += 8;

  // Add totals breakdown if expenses or deposits exist
  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');

  if (meta.expenses_total > 0 || meta.deposits_total > 0) {
    const blockHeight = 40; // safe margin for totals + banking info
    if (y + blockHeight > 270) {
        doc.addPage();
        y = 20;
    }


  doc.text('Celkem práce / Job Total:', 120, y);
  doc.text(`${formatCurrency(inv.subtotal || 0)} ${inv.currency || client?.currency || 'CZK'}`, 190, y, { align: 'right' });
  y += 6;

  if (meta.expenses_total > 0) {
    doc.text('Výdaje / Expenses:', 120, y);
    doc.text(`${formatCurrency(meta.expenses_total)} ${inv.currency || client?.currency || 'CZK'}`, 190, y, { align: 'right' });
    y += 6;
  }

  doc.setFont(undefined, 'bold');
  doc.text('Celková částka / Invoice Amount:', 120, y);
  doc.text(`${formatCurrency(meta.invoice_amount || inv.total)} ${inv.currency || client?.currency || 'CZK'}`, 190, y, { align: 'right' });
  y += 6;

  if (meta.deposits_total > 0) {
    doc.text('Zaplaceno zálohami / Deposits:', 120, y);
    doc.text(`-${formatCurrency(meta.deposits_total)} ${inv.currency || client?.currency || 'CZK'}`, 190, y, { align: 'right' });
    y += 6;
  }
  } // Added this closing brace for the if(meta.expenses_total > 0 || meta.deposits_total > 0) block


  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('CELKEM K ÚHRADĚ / TOTAL DUE:', 20, y);
  doc.text(`${formatCurrency(inv.total || 0)} ${inv.currency || client?.currency || 'CZK'}`, 190, y, { align: 'right' });

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

  doc.save(`invoice-${inv.invoice_number || inv.id}.pdf`);



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
