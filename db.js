import { t, setLanguage, LANG } from './lang.js';
import { database } from './db.js';

// App State
const state = {
  currentView: 'dashboard',
  currentUser: null,
  clients: [],
  jobs: [],
  timesheets: [],
  invoices: [],
  profile: null,
  // All new data models added and initialized
  expenses: [],
  todos: [],
  trash: [],
  showBilledJobs: true,
};

// --- Utility Functions ---

function formatCurrency(amount, currency = 'USD') {
  return amount.toLocaleString(navigator.language, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString(navigator.language, { year: 'numeric', month: 'short', day: 'numeric' });
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast toast-${type} active`;
    setTimeout(() => {
        toast.className = 'toast';
    }, 4000);
}

function hideToast() {
    document.getElementById('toast').className = 'toast';
}

// --- Core Data Loading ---

async function loadData() {
  showToast(t('loading'), 'info');
  database.clearCache(); // Ensure fresh data fetch

  try {
    const [clients, jobs, timesheets, invoices, profile, expenses, todos, trash] = await database.requestBatch({
      clients: `clients?deleted=eq.false&order=name.asc&select=*`,
      jobs: `jobs?deleted=eq.false&order=created_at.desc&select=*`,
      timesheets: `timesheets?deleted=eq.false&order=date.desc&select=*`,
      invoices: `invoices?deleted=eq.false&order=date_issued.desc&select=*`,
      profile: `business?select=*`,
      expenses: `expenses?order=date.desc&select=*`,
      todos: `todos?order=created_at.desc&select=*`,
      trash: `trash?select=*` // The database.getTrash() method handles aggregation, so we can't use batch for trash directly
    });

    state.clients = clients || [];
    state.jobs = jobs || [];
    state.timesheets = timesheets || [];
    state.invoices = invoices || [];
    state.profile = profile || null;
    state.expenses = expenses || [];
    state.todos = todos || [];
    state.trash = await database.getTrash(); // Fetch trash separately to aggregate soft-deleted items

    // Ensure state arrays/objects are populated correctly
    console.log('All data loaded successfully.');
    hideToast();
    showView(state.currentView);

  } catch (error) {
    console.error('Error loading data:', error);
    showToast(`${t('error')}: ${error.message}`, 'danger');
    if (error.message.includes('Not authenticated')) {
        setTimeout(() => window.netlifyIdentity.logout(), 2000);
    }
  }
}

// --- View Rendering Logic (Complete) ---

function showView(view) {
    state.currentView = view;
    // Update active nav tab
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.getAttribute('data-view') === view) {
            tab.classList.add('active');
        }
    });

    const mainView = document.getElementById('mainView');
    mainView.innerHTML = '';

    let content;

    switch (view) {
        case 'dashboard':
            content = renderDashboard();
            break;
        case 'clients':
            content = renderClients();
            break;
        case 'jobs':
            content = renderJobs();
            break;
        case 'worklogs':
            content = renderWorkLogs();
            break;
        case 'trash':
            content = renderTrash();
            break;
        default:
            content = `<div class="empty-state"><h2>404</h2><p>${t('pageNotFound')}</p></div>`;
    }
    mainView.innerHTML = content;
}

function renderDashboard() {
    const totalInvoiced = state.invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalPaid = state.invoices.filter(i => i.status === 'paid').reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalExpenses = state.expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const clientCount = state.clients.length;
    const todosCount = state.todos.filter(t => !t.is_completed).length;

    return `
        <h2>${t('dashboard')}</h2>
        <div class="stats-grid">
            <div class="stat-card"><h3>${t('totalInvoiced')}</h3><p>${formatCurrency(totalInvoiced, state.profile?.currency || 'USD')}</p></div>
            <div class="stat-card"><h3>${t('totalReceived')}</h3><p>${formatCurrency(totalPaid, state.profile?.currency || 'USD')}</p></div>
            <div class="stat-card"><h3>${t('totalExpenses')}</h3><p>${formatCurrency(totalExpenses, state.profile?.currency || 'USD')}</p></div>
            <div class="stat-card"><h3>${t('todos')} (${t('pending')})</h3><p>${todosCount}</p></div>
        </div>

        <h3>${t('invoices')} (${t('unpaid')})</h3>
        <div class="cards-grid">
            ${state.invoices.filter(i => i.status !== 'paid' && !i.deleted).map(inv => `
                <div class="card">
                    <h4>${inv.id} - ${state.clients.find(c => c.id === inv.client_id)?.name || 'Unknown Client'}</h4>
                    <p><strong>${t('total')}:</strong> ${formatCurrency(inv.total, inv.currency)}</p>
                    <p><strong>${t('dueDate')}:</strong> ${formatDate(inv.due_date)}</p>
                    <div class="card-actions">
                        <button class="btn-secondary" onclick="downloadPDF('${inv.id}')">${t('downloadPdf')}</button>
                        <button class="btn-success" onclick="markInvoicePaid('${inv.id}')">${t('markPaid')}</button>
                    </div>
                </div>
            `).join('')}
            ${state.invoices.filter(i => i.status !== 'paid' && !i.deleted).length === 0 ? `<div class="empty-state">${t('noData')}</div>` : ''}
        </div>

        <h3>${t('todos')}</h3>
        <div id="todoList" class="card-list">
            <input type="text" id="newTodoTitle" placeholder="${t('addTodo')}" class="form-control" onkeypress="handleNewTodo(event)">
            ${state.todos.sort((a,b) => a.created_at < b.created_at ? -1 : 1).map(todo =>
                `<div class="todo-item card ${todo.is_completed ? 'completed' : ''}">
                    <input type="checkbox" ${todo.is_completed ? 'checked' : ''} onchange="toggleTodo('${todo.id}', ${!todo.is_completed})">
                    <span>${todo.title}</span>
                    <button class="btn-icon btn-danger" onclick="deleteTodo('${todo.id}')">❌</button>
                </div>`
            ).join('')}
        </div>
    `;
}

function renderClients() {
    return `
        <h2>${t('clients')}</h2>
        <button class="btn-primary" onclick="openClientModal()">${t('addClient')}</button>
        <table class="data-table">
            <thead>
                <tr>
                    <th>${t('clientName')}</th>
                    <th>${t('email')}</th>
                    <th>${t('rate')}</th>
                    <th>${t('currency')}</th>
                    <th>${t('actions')}</th>
                </tr>
            </thead>
            <tbody>
                ${state.clients.map(client => `
                    <tr>
                        <td>${client.name}</td>
                        <td>${client.admin_email || client.invoice_email || '-'}</td>
                        <td>${client.rate} / ${client.rate_type}</td>
                        <td>${client.currency}</td>
                        <td>
                            <button class="btn-secondary" onclick="openClientModal('${client.id}')">${t('edit')}</button>
                            <button class="btn-danger" onclick="deleteClient('${client.id}')">${t('delete')}</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${state.clients.length === 0 ? `<div class="empty-state">${t('noData')}</div>` : ''}
    `;
}

function renderJobs() {
    return `
        <h2>${t('jobs')}</h2>
        <button class="btn-primary" onclick="openJobModal()">${t('addJob')}</button>
        <div class="filter-controls">
            <label>
                <input type="checkbox" id="showBilledJobsToggle" ${state.showBilledJobs ? 'checked' : ''} onchange="toggleBilledJobs(this.checked)">
                ${t('showBilledJobs')}
            </label>
        </div>
        <table class="data-table">
            <thead>
                <tr>
                    <th>${t('name')}</th>
                    <th>${t('client')}</th>
                    <th>${t('startEnd')}</th>
                    <th>${t('rate')}</th>
                    <th>${t('status')}</th>
                    <th>${t('actions')}</th>
                </tr>
            </thead>
            <tbody>
                ${state.jobs.filter(job => state.showBilledJobs || !job.billed).map(job => `
                    <tr>
                        <td>${job.name}</td>
                        <td>${state.clients.find(c => c.id === job.client_id)?.name || 'Unknown'}</td>
                        <td>${formatDate(job.start_date)} - ${formatDate(job.end_date)}</td>
                        <td>${job.rate} / ${job.rate_type} (${job.currency})</td>
                        <td><span class="badge ${job.billed ? 'badge-success' : 'badge-warning'}">${job.billed ? t('billed') : t('unbilled')}</span></td>
                        <td>
                            <button class="btn-secondary" onclick="openJobModal('${job.id}')">${t('edit')}</button>
                            <button class="btn-danger" onclick="deleteJob('${job.id}')">${t('delete')}</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${state.jobs.filter(job => state.showBilledJobs || !job.billed).length === 0 ? `<div class="empty-state">${t('noData')}</div>` : ''}
    `;
}

function renderWorkLogs() {
    return `
        <h2>${t('worklogs')}</h2>
        <button class="btn-primary" onclick="openTimesheetModal()">${t('addWorklog')}</button>
        <table class="data-table">
            <thead>
                <tr>
                    <th>${t('date')}</th>
                    <th>${t('client')}</th>
                    <th>${t('hours')}</th>
                    <th>${t('notes')}</th>
                    <th>${t('status')}</th>
                    <th>${t('actions')}</th>
                </tr>
            </thead>
            <tbody>
                ${state.timesheets.map(ts => `
                    <tr>
                        <td>${formatDate(ts.date)}</td>
                        <td>${state.clients.find(c => c.id === ts.client_id)?.name || 'Unknown'}</td>
                        <td>${ts.hours}</td>
                        <td>${ts.notes}</td>
                        <td><span class="badge ${ts.billed ? 'badge-success' : 'badge-warning'}">${ts.billed ? t('billed') : t('unbilled')}</span></td>
                        <td>
                            <button class="btn-secondary" onclick="openTimesheetModal('${ts.id}')">${t('edit')}</button>
                            <button class="btn-danger" onclick="deleteTimesheet('${ts.id}')">${t('delete')}</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${state.timesheets.length === 0 ? `<div class="empty-state">${t('noData')}</div>` : ''}
    `;
}

function renderTrash() {
    return `
        <h2>${t('trash')} (${state.trash.length})</h2>
        <p class="text-muted">${t('trashInfo')}</p>
        <table class="data-table">
            <thead>
                <tr>
                    <th>${t('type')}</th>
                    <th>${t('name')}</th>
                    <th>${t('deletedOn')}</th>
                    <th>${t('actions')}</th>
                </tr>
            </thead>
            <tbody>
                ${state.trash.map(item => `
                    <tr>
                        <td>${t(item._table)}</td>
                        <td>${item.name || item.id}</td>
                        <td>${formatDate(item.updated_at)}</td>
                        <td>
                            <button class="btn-secondary" onclick="restoreItem('${item._table}', '${item.id}')">${t('restore')}</button>
                            <button class="btn-danger" onclick="deleteForever('${item._table}', '${item.id}')">${t('deleteForever')}</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${state.trash.length === 0 ? `<div class="empty-state">${t('noData')}</div>` : ''}
    `;
}

// --- Global Functions (Exposed for HTML Event Handlers) ---

// PDF Generation (Using window.jspdf.jsPDF as implied by app.html)
window.downloadPDF = async (invoiceId) => {
  showToast(t('generatingPdf'), 'info');

  const inv = state.invoices.find(i => i.id === invoiceId);
  if (!inv) return showToast(t('error') + ': Invoice not found', 'danger');

  // Need to fetch job details for line items if not present in invoice.items
  let job = null;
  if (inv.job_id) {
      try {
          // Use the secure getJob method which fetches job_lines
          job = await database.getJob(inv.job_id);
      } catch (e) {
          console.error("Error fetching job for invoice:", e);
      }
  }

  const client = state.clients.find(c => c.id === inv.client_id);
  const profile = state.profile;
  const items = inv.items && inv.items.length > 0 ? inv.items : (job?.job_lines || []);

  if (!window.jspdf || !window.jspdf.jsPDF) {
      return showToast(t('error') + ': PDF library not loaded', 'danger');
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 15;
  const lineSpacing = 6;

  const currentLang = localStorage.getItem('lang') || 'en';
  const T = (key) => LANG[currentLang][key] || key;

  // --- Header ---
  doc.setFontSize(24).text(T('invoice'), 150, y, null, null, 'right');
  y += lineSpacing;

  // --- Profile Info (Left) ---
  doc.setFontSize(10).text(T('invoiceFrom'), 20, y);
  y += lineSpacing / 2;
  doc.setFontSize(12).text(profile?.name || 'Your Business Name', 20, y);
  y += lineSpacing;
  doc.setFontSize(10).text(profile?.address || 'Your Address', 20, y);
  y += lineSpacing;
  doc.text(profile?.email || 'Your Email', 20, y);
  y += lineSpacing;

  // --- Client Info (Right) ---
  const clientX = 150;
  y = 15; // Reset Y for client info alignment
  doc.setFontSize(10).text(T('invoiceTo'), clientX, y, null, null, 'right');
  y += lineSpacing / 2;
  doc.setFontSize(12).text(client?.name || 'Client Name', clientX, y, null, null, 'right');
  y += lineSpacing;
  doc.setFontSize(10).text(client?.address || 'Client Address', clientX, y, null, null, 'right');
  y += lineSpacing;
  doc.text(client?.invoice_email || 'Client Email', clientX, y, null, null, 'right');

  // --- Invoice Details Table ---
  y = 60;
  doc.line(20, y, 190, y); // Separator line
  y += 5;

  doc.text(`${T('invoiceId')}: ${inv.id}`, 20, y);
  doc.text(`${T('dateIssued')}: ${formatDate(inv.date_issued)}`, 80, y);
  doc.text(`${T('dueDate')}: ${formatDate(inv.due_date)}`, 150, y);
  y += lineSpacing * 2;

  // --- Line Items Table Header ---
  doc.setFontSize(10).text(T('description'), 20, y);
  doc.text(T('quantity'), 100, y);
  doc.text(T('unitPrice'), 125, y);
  doc.text(T('total'), 175, y, null, null, 'right');
  y += 3;
  doc.line(20, y, 190, y); // Separator line
  y += 5;

  // --- Line Items Table Rows ---
  doc.setFontSize(10);
  items.forEach(item => {
    doc.text(item.description, 20, y);
    doc.text(String(item.quantity), 100, y);
    doc.text(formatCurrency(item.unit_price, inv.currency), 125, y);
    doc.text(formatCurrency(item.total, inv.currency), 175, y, null, null, 'right');
    y += lineSpacing;
  });

  y += lineSpacing;
  doc.line(140, y, 190, y); // Subtotal separator

  // --- Totals Summary ---
  y += 5;
  doc.text(`${T('subtotal')}:`, 140, y);
  doc.text(formatCurrency(inv.subtotal || inv.total, inv.currency), 175, y, null, null, 'right');
  y += lineSpacing;

  doc.text(`${T('tax')}:`, 140, y);
  doc.text(formatCurrency(inv.tax || 0, inv.currency), 175, y, null, null, 'right');
  y += lineSpacing;

  doc.setFontSize(12).text(`${T('total')}:`, 140, y);
  doc.text(formatCurrency(inv.total, inv.currency), 175, y, null, null, 'right');
  y += lineSpacing * 2;

  // --- Payment Info ---
  doc.setFontSize(10).text(T('paymentDetails'), 20, y);
  y += lineSpacing;

  if (profile?.bank_entries?.length) {
    profile.bank_entries.forEach(acc => {
      doc.text(`${acc.label}: ${acc.number}`, 20, y);
      y += lineSpacing;
    });
  } else {
    // Fallback to legacy fields if JSONB array is empty/null
    for (let i = 1; i <= 3; i++) {
        const label = profile[`bank_label_${i}`];
        const number = profile[`bank_number_${i}`];
        if (label && number) {
            doc.text(`${label}: ${number}`, 20, y);
            y += lineSpacing;
        }
    }
  }

  doc.save(`invoice-${inv.id}.pdf`);
  showToast(t('downloadSuccess')); // Assuming success
};

window.loadData = loadData; // Exposed for general use after a change

// --- CRUD HANDLERS (Complete) ---

// INVOICES
window.markInvoicePaid = async (id) => {
    try {
        await database.markInvoicePaid(id);
        await loadData();
        showToast(t('saveSuccess'));
    } catch (error) {
        showToast(t('error'), 'danger');
    }
}

// CLIENTS
window.deleteClient = async (id) => {
    if (confirm(t('confirmDelete'))) {
        try {
            await database.deleteClient(id);
            await loadData();
            showToast(t('deleteSuccess'));
        } catch (error) {
            showToast(t('error'), 'danger');
        }
    }
}

// JOBS
window.deleteJob = async (id) => {
    if (confirm(t('confirmDelete'))) {
        try {
            await database.deleteJob(id);
            await loadData();
            showToast(t('deleteSuccess'));
        } catch (error) {
            showToast(t('error'), 'danger');
        }
    }
}

window.toggleBilledJobs = (checked) => {
    state.showBilledJobs = checked;
    showView('jobs');
}


// TIMESHEETS
window.deleteTimesheet = async (id) => {
    if (confirm(t('confirmDelete'))) {
        try {
            await database.deleteTimesheet(id);
            await loadData();
            showToast(t('deleteSuccess'));
        } catch (error) {
            showToast(t('error'), 'danger');
        }
    }
}

// TODOS
window.handleNewTodo = async (event) => {
    if (event.key === 'Enter') {
        const titleInput = document.getElementById('newTodoTitle');
        const title = titleInput.value.trim();
        if (!title) return;

        try {
            await database.addTodo({ title, is_completed: false, created_at: new Date().toISOString() });
            titleInput.value = '';
            await loadData();
            showToast(t('saveSuccess'));
        } catch (error) {
            showToast(t('error'), 'danger');
        }
    }
}

window.toggleTodo = async (id, isCompleted) => {
    try {
        await database.updateTodo(id, { is_completed: isCompleted, updated_at: new Date().toISOString() });
        await loadData();
        showToast(t('saveSuccess'));
    } catch (error) {
        showToast(t('error'), 'danger');
    }
};

window.deleteTodo = async (id) => {
    if (confirm(t('confirmDelete'))) {
        try {
            await database.deleteTodo(id);
            await loadData();
            showToast(t('deleteSuccess'));
        } catch (error) {
            showToast(t('error'), 'danger');
        }
    }
};

// TRASH
window.restoreItem = async (table, id) => {
  try {
    await database.restore(table, id);
    await loadData();
    showView('trash');
    showToast(t('restoreSuccess'));
  } catch (error) {
    showToast(`${t('error')}: ${error.message}`, 'danger');
  }
};

window.deleteForever = async (table, id) => {
  if (confirm(t('confirmDeleteForever'))) {
    try {
        if (table === 'invoices') await database.hardDelete(table, id);
        else if (table === 'clients') await database.hardDelete(table, id);
        else if (table === 'jobs') await database.hardDelete(table, id);
        else if (table === 'timesheets') await database.hardDelete(table, id);

        await loadData();
        showView('trash');
        showToast(t('deleteSuccess'));
    } catch (error) {
        showToast(`${t('error')}: ${error.message}`, 'danger');
    }
  }
};

// --- Initialization and Event Binding ---

async function init() {
  return new Promise((resolve) => {
    if (window.netlifyIdentity) {
      window.netlifyIdentity.init();
      window.netlifyIdentity.on('init', async (user) => {
        if (!user) {
          window.location.href = '/index.html';
          return;
        }

        state.currentUser = user;
        database.setUser(user.id);
        document.getElementById('userEmail').textContent = user.email;

        const savedLang = localStorage.getItem('lang') || 'en';
        document.getElementById('langSelect').value = savedLang;
        setLanguage(savedLang);

        const savedTheme = localStorage.getItem('theme') || 'light';
        document.body.setAttribute('data-theme', savedTheme);

        // Load all data on successful login
        await loadData();
        bindEvents();
        resolve();
      });

      window.netlifyIdentity.on('logout', () => {
        window.location.href = '/index.html';
      });
    }
  });
}

function bindEvents() {
    // Navigation binding
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            showView(e.target.getAttribute('data-view'));
        });
    });

    // Header Toggles
    document.getElementById('logoutBtn').addEventListener('click', () => window.netlifyIdentity.logout());
    document.getElementById('themeToggle').addEventListener('click', () => {
        const currentTheme = document.body.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
    document.getElementById('langSelect').addEventListener('change', (e) => {
        const lang = e.target.value;
        setLanguage(lang);
        localStorage.setItem('lang', lang);
        showView(state.currentView);
    });

    // Placeholder modal functions (these must be defined in your app)
    window.openClientModal = (id) => alert(`Open Client Modal for ID: ${id || 'New'}`);
    window.openJobModal = (id) => alert(`Open Job Modal for ID: ${id || 'New'}`);
    window.openTimesheetModal = (id) => alert(`Open Timesheet Modal for ID: ${id || 'New'}`);
}

// Start the application
init();
