// Bilingual dictionary for EN and CS
export const LANG = {
  en: {
    // Navigation
    dashboard: 'Dashboard',
    clients: 'Clients',
    jobs: 'Jobs',
    worklogs: 'Work Logs',
    trash: 'Trash',

    // Header
    settings: 'Settings',
    myProfile: 'My Profile',
    backup: 'Backup Data',
    restore: 'Restore Data',
    logout: 'Logout',

    // Dashboard
    totalInvoiced: 'Total Invoiced',
    totalReceived: 'Total Received',
    totalOverdue: 'Total Overdue',
    clientCount: 'Client Count',
    ledger: 'Ledger',
    date: 'Date',
    description: 'Description',
    type: 'Type',
    amount: 'Amount',
    status: 'Status',
    actions: 'Actions',
    viewPdf: 'View PDF',
    downloadPdf: 'Download',
    markPaid: 'Mark Paid',
    delete: 'Delete',
    exportCsv: 'Export CSV',
    exportXlsx: 'Export Excel',

    // Clients
    addClient: 'Add Client',
    editClient: 'Edit Client',
    clientName: 'Client Name',
    email: 'Email',
    address: 'Address',
    bankInfo: 'Bank Info',
    rate: 'Rate',
    rateType: 'Rate Type',
    hourly: 'Hourly',
    daily: 'Daily',
    task: 'Per Task',
    currency: 'Currency',
    czechInvoice: 'Czech Invoice Format',
    adminEmail: 'Admin Email',
    invoiceEmail: 'Invoice Email',
    bankAccounts: 'Bank Accounts',
    accountLabel: 'Label',
    accountNumber: 'Account Number',
    idNumbers: 'ID Numbers',
    idLabel: 'Label',
    idNumber: 'Number',

    // Jobs
    addJob: 'Add Job',
    editJob: 'Edit Job',
    jobName: 'Job Name',
    jobDescription: 'Description',
    client: 'Client',
    startDate: 'Start Date',
    endDate: 'End Date',
    hours: 'Hours',
    expenses: 'Expenses',
    expenseLabel: 'Label',
    expenseAmount: 'Amount',
    deposits: 'Deposits',
    depositAmount: 'Amount',
    jobTotal: 'Job Total',
    expensesTotal: 'Expenses Total',
    invoiceAmount: 'Invoice Amount',
    depositsTotal: 'Deposits Total',
    dueNow: 'Due Now',

    // Work Logs
    addLog: 'Add Log',
    editLog: 'Edit Log',
    generateInvoice: 'Generate Invoice',
    selectClient: 'Select Client',
    selectMonth: 'Select Month',
    generate: 'Generate',
    notes: 'Notes',
    billed: 'Billed',

    // Profile
    businessProfile: 'Business Profile',
    businessName: 'Business Name',
    businessAddress: 'Business Address',
    businessEmail: 'Business Email',
    connectBank: 'Connect Bank Account',

    // Trash
    emptyTrash: 'Trash is empty',
    restore: 'Restore',
    deleteForever: 'Delete Forever',
    itemName: 'Item',
    itemType: 'Type',

    // Invoice
    invoice: 'Invoice',
    invoiceNumber: 'Invoice #',
    supplier: 'Supplier',
    customer: 'Customer',
    items: 'Items',
    subtotal: 'Subtotal',
    tax: 'Tax',
    total: 'Total',
    dueDate: 'Due Date',

    // Common
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    close: 'Close',
    search: 'Search',
    filter: 'Filter',
    all: 'All',
    paid: 'Paid',
    unpaid: 'Unpaid',
    overdue: 'Overdue',
    pending: 'Pending',

    // Messages
    saveSuccess: 'Saved successfully',
    deleteSuccess: 'Deleted successfully',
    restoreSuccess: 'Restored successfully',
    error: 'An error occurred',
    confirmDelete: 'Are you sure you want to delete this?',
    confirmDeleteForever: 'This will permanently delete the item. Continue?',
    noData: 'No data available',
    loading: 'Loading...',
  },

  cs: {
    // Navigation
    dashboard: 'Přehled',
    clients: 'Klienti',
    jobs: 'Zakázky',
    worklogs: 'Výkazy práce',
    trash: 'Koš',

    // Header
    settings: 'Nastavení',
    myProfile: 'Můj profil',
    backup: 'Zálohovat data',
    restore: 'Obnovit data',
    logout: 'Odhlásit se',

    // Dashboard
    totalInvoiced: 'Celkem fakturováno',
    totalReceived: 'Celkem přijato',
    totalOverdue: 'Celkem po splatnosti',
    clientCount: 'Počet klientů',
    ledger: 'Účetní kniha',
    date: 'Datum',
    description: 'Popis',
    type: 'Typ',
    amount: 'Částka',
    status: 'Stav',
    actions: 'Akce',
    viewPdf: 'Zobrazit PDF',
    downloadPdf: 'Stáhnout',
    markPaid: 'Označit jako zaplaceno',
    delete: 'Smazat',
    exportCsv: 'Exportovat CSV',
    exportXlsx: 'Exportovat Excel',

    // Clients
    addClient: 'Přidat klienta',
    editClient: 'Upravit klienta',
    clientName: 'Jméno klienta',
    email: 'Email',
    address: 'Adresa',
    bankInfo: 'Bankovní údaje',
    rate: 'Sazba',
    rateType: 'Typ sazby',
    hourly: 'Hodinová',
    daily: 'Denní',
    task: 'Za úkol',
    currency: 'Měna',
    czechInvoice: 'České faktury',
    adminEmail: 'Administrátorský email',
    invoiceEmail: 'Fakturační email',
    bankAccounts: 'Bankovní účty',
    accountLabel: 'Popis',
    accountNumber: 'Číslo účtu',
    idNumbers: 'Identifikační čísla',
    idLabel: 'Typ',
    idNumber: 'Číslo',

    // Jobs
    addJob: 'Přidat zakázku',
    editJob: 'Upravit zakázku',
    jobName: 'Název zakázky',
    jobDescription: 'Popis',
    client: 'Klient',
    startDate: 'Datum zahájení',
    endDate: 'Datum ukončení',
    hours: 'Hodiny',
    expenses: 'Výdaje',
    expenseLabel: 'Popis',
    expenseAmount: 'Částka',
    deposits: 'Zálohy',
    depositAmount: 'Částka',
    jobTotal: 'Celkem práce',
    expensesTotal: 'Celkem výdaje',
    invoiceAmount: 'Částka faktury',
    depositsTotal: 'Celkem zálohy',
    dueNow: 'Zbývá zaplatit',

    // Work Logs
    addLog: 'Přidat záznam',
    editLog: 'Upravit záznam',
    generateInvoice: 'Vygenerovat fakturu',
    selectClient: 'Vyberte klienta',
    selectMonth: 'Vyberte měsíc',
    generate: 'Vygenerovat',
    notes: 'Poznámky',
    billed: 'Vyfakturováno',

    // Profile
    businessProfile: 'Firemní profil',
    businessName: 'Název firmy',
    businessAddress: 'Adresa firmy',
    businessEmail: 'Firemní email',
    connectBank: 'Připojit bankovní účet',

    // Trash
    emptyTrash: 'Koš je prázdný',
    restore: 'Obnovit',
    deleteForever: 'Smazat natrvalo',
    itemName: 'Položka',
    itemType: 'Typ',

    // Invoice
    invoice: 'Faktura',
    invoiceNumber: 'Faktura č.',
    supplier: 'Dodavatel',
    customer: 'Odběratel',
    items: 'Položky',
    subtotal: 'Mezisoučet',
    tax: 'DPH',
    total: 'Celkem',
    dueDate: 'Datum splatnosti',

    // Common
    save: 'Uložit',
    cancel: 'Zrušit',
    edit: 'Upravit',
    close: 'Zavřít',
    search: 'Hledat',
    filter: 'Filtrovat',
    all: 'Vše',
    paid: 'Zaplaceno',
    unpaid: 'Nezaplaceno',
    overdue: 'Po splatnosti',
    pending: 'Čeká',

    // Messages
    saveSuccess: 'Úspěšně uloženo',
    deleteSuccess: 'Úspěšně smazáno',
    restoreSuccess: 'Úspěšně obnoveno',
    error: 'Došlo k chybě',
    confirmDelete: 'Opravdu chcete toto smazat?',
    confirmDeleteForever: 'Tímto položku trvale smažete. Pokračovat?',
    noData: 'Žádná data k zobrazení',
    loading: 'Načítání...',
  }
};

// Get translation helper
export function t(key) {
  const lang = localStorage.getItem('lang') || 'en';
  return LANG[lang][key] || key;
}

// Set language
export function setLanguage(lang) {
  if (lang === 'en' || lang === 'cs') {
    localStorage.setItem('lang', lang);
    return true;
  }
  return false;
}
