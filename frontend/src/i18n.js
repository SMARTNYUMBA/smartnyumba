// SmartNyumba Pro — English / Swahili translations
// ~200 strings covering all pages, forms, errors, and status labels

export const translations = {
  en: {
    // ── Navigation ─────────────────────────────────────────────
    dashboard: 'Dashboard', properties: 'Properties', units: 'Units',
    tenants: 'Tenants', tenancies: 'Tenancies', invoices: 'Invoices',
    payments: 'Payments', expenses: 'Expenses', reports: 'Reports',
    maintenance: 'Maintenance', visitors: 'Visitors', parking: 'Parking',
    utilities: 'Utilities', announcements: 'Announcements', vacate: 'Vacate Notices',
    users: 'Users', settings: 'Settings', profile: 'My Profile',
    logout: 'Sign out', statement: 'My Statement', inspections: 'Inspections',
    vendors: 'Vendors', access_log: 'Access Log', shared_meters: 'Shared Meters',
    owner_portal: 'Owner Portfolio', remittances: 'Remittances',
    cases: 'Cases', service_charges: 'Service Charges', bulk_import: 'Bulk Import',
    messages: 'Messages', staff: 'Staff', meter_readings: 'Meter Readings',
    logbook: 'Logbook', security_alerts: 'Security Alerts',

    // ── Page titles ─────────────────────────────────────────────
    page_dashboard: 'Dashboard', page_properties: 'My Properties',
    page_invoices: 'Invoices', page_payments: 'Pay Rent',
    page_maintenance: 'Maintenance Requests', page_profile: 'My Profile',
    page_settings: 'Organisation Settings', page_reports: 'Reports & Analytics',
    page_tenants: 'Tenants', page_tenancies: 'Tenancies',

    // ── Common actions ──────────────────────────────────────────
    save: 'Save', save_changes: 'Save changes', cancel: 'Cancel', close: 'Close',
    add: 'Add', edit: 'Edit', delete: 'Delete', search: 'Search',
    submit: 'Submit', confirm: 'Confirm', back: 'Back', next: 'Next',
    view: 'View', download: 'Download', export: 'Export', print: 'Print',
    record: 'Record', generate: 'Generate', upload: 'Upload', remove: 'Remove',
    approve: 'Approve', reject: 'Reject', assign: 'Assign', resolve: 'Resolve',
    check_in: 'Check in', check_out: 'Check out', pay_now: 'Pay now',
    view_all: 'View all', add_new: 'Add new', loading: 'Loading…',
    try_again: 'Try again', refresh: 'Refresh',

    // ── Form fields ─────────────────────────────────────────────
    full_name: 'Full name', first_name: 'First name', last_name: 'Last name',
    email: 'Email address', phone: 'Phone number', id_number: 'ID number',
    password: 'Password', confirm_password: 'Confirm password',
    current_password: 'Current password', new_password: 'New password',
    unit_number: 'Unit number', property_name: 'Property name',
    rent_amount: 'Rent amount', due_date: 'Due date', start_date: 'Start date',
    end_date: 'End date', amount: 'Amount', description: 'Description',
    notes: 'Notes', address: 'Address', location: 'Location',
    date: 'Date', type: 'Type', category: 'Category', priority: 'Priority',
    status: 'Status', unit: 'Unit', property: 'Property', tenant: 'Tenant',
    manager: 'Manager', owner: 'Owner', phone_number: 'Phone number',
    emergency_contact: 'Emergency contact', emergency_phone: 'Emergency phone',
    vehicle_plate: 'Vehicle plate', national_id: 'National ID',
    billing_email: 'Billing email', organisation_name: 'Organisation name',
    timezone: 'Timezone', currency: 'Currency', brand_colour: 'Brand colour',

    // ── Table headers ───────────────────────────────────────────
    col_date: 'Date', col_amount: 'Amount', col_status: 'Status',
    col_actions: 'Actions', col_tenant: 'Tenant', col_unit: 'Unit',
    col_property: 'Property', col_balance: 'Balance', col_type: 'Type',
    col_method: 'Method', col_receipt: 'Receipt', col_ref: 'Reference',

    // ── Status labels ───────────────────────────────────────────
    status_active: 'Active', status_inactive: 'Inactive',
    status_paid: 'Paid', status_unpaid: 'Unpaid', status_overdue: 'Overdue',
    status_partial: 'Partial', status_pending: 'Pending',
    status_approved: 'Approved', status_rejected: 'Rejected',
    status_cancelled: 'Cancelled', status_completed: 'Completed',
    status_in_progress: 'In progress', status_assigned: 'Assigned',
    status_occupied: 'Occupied', status_vacant: 'Vacant',
    status_open: 'Open', status_closed: 'Closed', status_resolved: 'Resolved',

    // ── Priority ────────────────────────────────────────────────
    priority_urgent: 'Urgent', priority_high: 'High',
    priority_medium: 'Medium', priority_low: 'Low',

    // ── Financial ───────────────────────────────────────────────
    total_billed: 'Total billed', total_collected: 'Total collected',
    outstanding: 'Outstanding', balance_due: 'Balance due',
    net_income: 'Net income', gross_income: 'Gross income',
    total_expenses: 'Total expenses', vacancy_loss: 'Vacancy loss',
    management_fee: 'Management fee', monthly_revenue: 'Monthly revenue',
    rent_collected: 'Rent collected', arrears: 'Arrears',
    deposit: 'Deposit', deposit_refund: 'Deposit refund',
    late_fee: 'Late fee', service_charge: 'Service charge',
    water_bill: 'Water bill', electricity_bill: 'Electricity bill',

    // ── M-Pesa ──────────────────────────────────────────────────
    pay_via_mpesa: 'Pay via M-Pesa', enter_phone: 'Enter M-Pesa phone',
    stk_sent: 'Payment request sent to your phone',
    stk_instructions: 'Enter your M-Pesa PIN to confirm the payment.',
    stk_waiting: 'Waiting for confirmation…',
    payment_confirmed: 'Payment confirmed!',
    payment_failed: 'Payment failed. Please try again.',
    demo_mode: 'Demo mode — no real charges',

    // ── Empty states ────────────────────────────────────────────
    no_records: 'No records found', no_invoices: 'No invoices yet',
    no_payments: 'No payments recorded', no_maintenance: 'No maintenance requests',
    no_announcements: 'No announcements', no_visitors: 'No visitors today',
    no_properties: 'No properties added yet', no_tenants: 'No tenants found',
    all_clear: 'All clear!', all_paid: 'All invoices paid!',

    // ── Notifications ───────────────────────────────────────────
    notifications: 'Notifications', mark_all_read: 'Mark all read',
    no_notifications: 'No notifications', new_notification: 'New notification',

    // ── Auth ────────────────────────────────────────────────────
    sign_in: 'Sign in', sign_out: 'Sign out', sign_in_title: 'Welcome back',
    sign_in_subtitle: 'Sign in to your SmartNyumba account',
    forgot_password: 'Forgot password?', reset_password: 'Reset password',
    create_account: 'Create an account', otp_title: 'Two-step verification',
    otp_subtitle: 'Enter the 6-digit code sent to your phone',
    resend_code: 'Resend code', back_to_login: 'Back to login',

    // ── Errors ──────────────────────────────────────────────────
    error_required: 'This field is required',
    error_invalid_email: 'Enter a valid email address',
    error_invalid_phone: 'Enter a valid Kenyan phone number',
    error_password_short: 'Password must be at least 8 characters',
    error_passwords_match: 'Passwords do not match',
    error_login_failed: 'Invalid email or password',
    error_server: 'Something went wrong. Please try again.',
    error_network: 'No network connection',

    // ── Success messages ────────────────────────────────────────
    saved: 'Saved successfully', deleted: 'Deleted', updated: 'Updated',
    payment_recorded: 'Payment recorded', invoice_generated: 'Invoice generated',
    request_submitted: 'Request submitted', profile_updated: 'Profile updated',
    password_changed: 'Password changed',
  },

  sw: {
    // ── Navigation ─────────────────────────────────────────────
    dashboard: 'Dashibodi', properties: 'Majengo', units: 'Vyumba',
    tenants: 'Wapangaji', tenancies: 'Mikataba', invoices: 'Ankara',
    payments: 'Malipo', expenses: 'Gharama', reports: 'Ripoti',
    maintenance: 'Matengenezo', visitors: 'Wageni', parking: 'Maegesho',
    utilities: 'Huduma za Msingi', announcements: 'Matangazo',
    vacate: 'Notisi ya Kuondoka', users: 'Watumiaji', settings: 'Mipangilio',
    profile: 'Wasifu Wangu', logout: 'Toka', statement: 'Taarifa Yangu',
    inspections: 'Ukaguzi', vendors: 'Makandarasi',
    access_log: 'Kumbukumbu ya Ufikiaji', shared_meters: 'Mita Shirikishi',
    owner_portal: 'Dashibodi ya Mmiliki', remittances: 'Malipo kwa Mmiliki',
    cases: 'Malalamiko', service_charges: 'Ada za Huduma',
    bulk_import: 'Ingiza Wingi', messages: 'Ujumbe', staff: 'Wafanyakazi',
    meter_readings: 'Usomaji wa Mita', logbook: 'Daftari la Kumbukumbu',
    security_alerts: 'Arifa za Usalama',

    // ── Page titles ─────────────────────────────────────────────
    page_dashboard: 'Dashibodi', page_properties: 'Majengo Yangu',
    page_invoices: 'Ankara', page_payments: 'Lipa Kodi',
    page_maintenance: 'Maombi ya Matengenezo', page_profile: 'Wasifu Wangu',
    page_settings: 'Mipangilio ya Shirika', page_reports: 'Ripoti na Takwimu',
    page_tenants: 'Wapangaji', page_tenancies: 'Mikataba',

    // ── Common actions ──────────────────────────────────────────
    save: 'Hifadhi', save_changes: 'Hifadhi Mabadiliko', cancel: 'Ghairi',
    close: 'Funga', add: 'Ongeza', edit: 'Hariri', delete: 'Futa',
    search: 'Tafuta', submit: 'Wasilisha', confirm: 'Thibitisha',
    back: 'Rudi', next: 'Endelea', view: 'Angalia', download: 'Pakua',
    export: 'Hamisha', print: 'Chapisha', record: 'Rekodi',
    generate: 'Tengeneza', upload: 'Pakia', remove: 'Ondoa',
    approve: 'Kubali', reject: 'Kataa', assign: 'Teua', resolve: 'Suluhisha',
    check_in: 'Ingia', check_out: 'Toka', pay_now: 'Lipa Sasa',
    view_all: 'Angalia Yote', add_new: 'Ongeza Kipya', loading: 'Inapakia…',
    try_again: 'Jaribu Tena', refresh: 'Onyesha Upya',

    // ── Form fields ─────────────────────────────────────────────
    full_name: 'Jina Kamili', first_name: 'Jina la Kwanza', last_name: 'Jina la Familia',
    email: 'Barua Pepe', phone: 'Nambari ya Simu', id_number: 'Nambari ya Kitambulisho',
    password: 'Nenosiri', confirm_password: 'Thibitisha Nenosiri',
    current_password: 'Nenosiri la Sasa', new_password: 'Nenosiri Jipya',
    unit_number: 'Nambari ya Chumba', property_name: 'Jina la Jengo',
    rent_amount: 'Kiasi cha Kodi', due_date: 'Tarehe ya Malipo',
    start_date: 'Tarehe ya Kuanza', end_date: 'Tarehe ya Kumaliza',
    amount: 'Kiasi', description: 'Maelezo', notes: 'Maelezo ya Ziada',
    address: 'Anwani', location: 'Mahali', date: 'Tarehe', type: 'Aina',
    category: 'Kikundi', priority: 'Kipaumbele', status: 'Hali',
    unit: 'Chumba', property: 'Jengo', tenant: 'Mpangaji',
    manager: 'Msimamizi', owner: 'Mmiliki', phone_number: 'Nambari ya Simu',
    emergency_contact: 'Mawasiliano ya Dharura', emergency_phone: 'Simu ya Dharura',
    vehicle_plate: 'Nambari ya Gari', national_id: 'Kitambulisho cha Taifa',
    billing_email: 'Barua Pepe ya Bili', organisation_name: 'Jina la Shirika',
    timezone: 'Sehemu ya Wakati', currency: 'Sarafu', brand_colour: 'Rangi ya Nembo',

    // ── Table headers ───────────────────────────────────────────
    col_date: 'Tarehe', col_amount: 'Kiasi', col_status: 'Hali',
    col_actions: 'Vitendo', col_tenant: 'Mpangaji', col_unit: 'Chumba',
    col_property: 'Jengo', col_balance: 'Baki', col_type: 'Aina',
    col_method: 'Njia', col_receipt: 'Risiti', col_ref: 'Kumbukumbu',

    // ── Status labels ───────────────────────────────────────────
    status_active: 'Amilifu', status_inactive: 'Haifanyi kazi',
    status_paid: 'Imelipwa', status_unpaid: 'Haijaliwa',
    status_overdue: 'Imechelewa', status_partial: 'Imejaza Sehemu',
    status_pending: 'Inasubiri', status_approved: 'Imekubaliwa',
    status_rejected: 'Imekataliwa', status_cancelled: 'Imefutwa',
    status_completed: 'Imekamilika', status_in_progress: 'Inaendelea',
    status_assigned: 'Imepewa', status_occupied: 'Inakaliwa',
    status_vacant: 'Haikaliwa', status_open: 'Wazi', status_closed: 'Imefungwa',
    status_resolved: 'Imetatuliwa',

    // ── Priority ────────────────────────────────────────────────
    priority_urgent: 'Haraka Sana', priority_high: 'Muhimu',
    priority_medium: 'Wastani', priority_low: 'Si Haraka',

    // ── Financial ───────────────────────────────────────────────
    total_billed: 'Jumla Iliyotozwa', total_collected: 'Jumla Iliyokusanywa',
    outstanding: 'Deni Linalosalia', balance_due: 'Baki ya Kulipa',
    net_income: 'Mapato Halisi', gross_income: 'Mapato Jumla',
    total_expenses: 'Jumla ya Gharama', vacancy_loss: 'Hasara ya Nafasi Tupu',
    management_fee: 'Ada ya Usimamizi', monthly_revenue: 'Mapato ya Kila Mwezi',
    rent_collected: 'Kodi Iliyokusanywa', arrears: 'Madeni',
    deposit: 'Amana', deposit_refund: 'Kurejesha Amana',
    late_fee: 'Ada ya Kuchelewa', service_charge: 'Ada ya Huduma',
    water_bill: 'Bili ya Maji', electricity_bill: 'Bili ya Umeme',

    // ── M-Pesa ──────────────────────────────────────────────────
    pay_via_mpesa: 'Lipa kwa M-Pesa', enter_phone: 'Ingiza simu ya M-Pesa',
    stk_sent: 'Ombi la malipo limetumwa kwa simu yako',
    stk_instructions: 'Ingiza PIN yako ya M-Pesa kuthibitisha malipo.',
    stk_waiting: 'Inasubiri uthibitisho…',
    payment_confirmed: 'Malipo yamethibitishwa!',
    payment_failed: 'Malipo yameshindwa. Tafadhali jaribu tena.',
    demo_mode: 'Hali ya Majaribio — hakuna malipo ya kweli',

    // ── Empty states ────────────────────────────────────────────
    no_records: 'Hakuna rekodi', no_invoices: 'Bado hakuna ankara',
    no_payments: 'Hakuna malipo yaliyorekodi', no_maintenance: 'Hakuna maombi ya matengenezo',
    no_announcements: 'Hakuna matangazo', no_visitors: 'Hakuna wageni leo',
    no_properties: 'Bado hakuna majengo yaliyoongezwa', no_tenants: 'Hakuna wapangaji',
    all_clear: 'Hali nzuri!', all_paid: 'Ankara zote zimelipwa!',

    // ── Notifications ───────────────────────────────────────────
    notifications: 'Arifa', mark_all_read: 'Weka Zote Zimesomwa',
    no_notifications: 'Hakuna arifa', new_notification: 'Arifa mpya',

    // ── Auth ────────────────────────────────────────────────────
    sign_in: 'Ingia', sign_out: 'Toka', sign_in_title: 'Karibu tena',
    sign_in_subtitle: 'Ingia kwenye akaunti yako ya SmartNyumba',
    forgot_password: 'Umesahau nenosiri?', reset_password: 'Weka Upya Nenosiri',
    create_account: 'Fungua akaunti', otp_title: 'Uthibitisho wa Hatua Mbili',
    otp_subtitle: 'Ingiza nambari ya tarakimu 6 iliyotumwa kwa simu yako',
    resend_code: 'Tuma tena nambari', back_to_login: 'Rudi kwenye kuingia',

    // ── Errors ──────────────────────────────────────────────────
    error_required: 'Sehemu hii inahitajika',
    error_invalid_email: 'Ingiza barua pepe halali',
    error_invalid_phone: 'Ingiza nambari halali ya simu ya Kenya',
    error_password_short: 'Nenosiri lazima liwe na herufi angalau 8',
    error_passwords_match: 'Nenosiri hazifanani',
    error_login_failed: 'Barua pepe au nenosiri si sahihi',
    error_server: 'Kitu kimekwenda vibaya. Tafadhali jaribu tena.',
    error_network: 'Hakuna muunganisho wa mtandao',

    // ── Success messages ────────────────────────────────────────
    saved: 'Imehifadhiwa', deleted: 'Imefutwa', updated: 'Imesasishwa',
    payment_recorded: 'Malipo yamerekodiwa', invoice_generated: 'Ankara imetengenezwa',
    request_submitted: 'Ombi limewasilishwa', profile_updated: 'Wasifu umesasishwa',
    password_changed: 'Nenosiri limebadilishwa',
  },
};

/** Look up a translation key. Falls back to English, then the raw key. */
export function t(key, lang = 'en') {
  return translations[lang]?.[key] ?? translations.en[key] ?? key;
}

/** React hook for i18n — reads language from context. */
export function useT() {
  // Dynamically import to avoid circular deps
  try {
    const { useLang } = require('./context/LanguageContext');
    const { lang } = useLang();
    return (key) => t(key, lang);
  } catch {
    return (key) => t(key, 'en');
  }
}
