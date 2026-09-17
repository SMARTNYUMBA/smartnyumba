import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { getNotifications } from '../../api';
import { roleName } from '../../utils/helpers';

// ── SVG icon set (no emoji) ───────────────────────────────────
const I = {
  home:      <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h4a1 1 0 001-1v-3h2v3a1 1 0 001 1h4a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg>,
  building:  <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4zm3 1h2v2H7V5zm4 0h2v2h-2V5zM7 9h2v2H7V9zm4 0h2v2h-2V9zm-4 4h2v2H7v-2zm4 0h2v2h-2v-2z" clipRule="evenodd"/></svg>,
  key:       <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd"/></svg>,
  users:     <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>,
  doc:       <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg>,
  receipt:   <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm4.707 5.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L8.414 12H13a1 1 0 100-2H8.414l1.293-1.293z" clipRule="evenodd"/></svg>,
  card:      <svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4zM2 9v7a2 2 0 002 2h12a2 2 0 002-2V9H2zm3 4a1 1 0 011-1h.01a1 1 0 110 2H6a1 1 0 01-1-1zm3 0a1 1 0 011-1h3a1 1 0 110 2H9a1 1 0 01-1-1z"/></svg>,
  spend:     <svg viewBox="0 0 20 20" fill="currentColor"><path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd"/></svg>,
  chart:     <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>,
  wrench:    <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>,
  visitor:   <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/></svg>,
  car:       <svg viewBox="0 0 20 20" fill="currentColor"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/><path d="M3 4a1 1 0 00-.82 1.573L3 6.22V13a1 1 0 001 1h.1a2.5 2.5 0 004.8 0h2.2a2.5 2.5 0 004.8 0H16a1 1 0 001-1V7.72l.827-1.147A1 1 0 0017 5H3zm1 6V7.72L4.9 6h10.2l.9 1.72V10H4z"/></svg>,
  drop:      <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" clipRule="evenodd"/></svg>,
  bell:      <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/></svg>,
  ticket:    <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 100 4v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2a2 2 0 100-4V6z"/></svg>,
  hammer:    <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M13.978 3.978a2 2 0 010 2.828l-8 8a2 2 0 11-2.828-2.828l8-8a2 2 0 012.828 0zm1.414 1.414l-9.9 9.9 1.415 1.414 9.9-9.9-1.415-1.414z" clipRule="evenodd"/></svg>,
  bolt:      <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.381z" clipRule="evenodd"/></svg>,
  box:       <svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z"/><path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd"/></svg>,
  download:  <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/></svg>,
  person:    <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/></svg>,
  cog:       <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>,
  mail:      <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>,
  id:        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2a1 1 0 00-1 1v1a1 1 0 002 0V3a1 1 0 00-1-1zM4 4h3a3 3 0 006 0h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm2.5 7a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm2.45 4a2.5 2.5 0 10-4.9 0h4.9zM12 9a1 1 0 100 2h3a1 1 0 100-2h-3zm-1 4a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1z" clipRule="evenodd"/></svg>,
  logout:    <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd"/></svg>,
  meter:     <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>,
  cash:      <svg viewBox="0 0 20 20" fill="currentColor"><path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd"/></svg>,
  shield:    <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>,
  alert:     <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>,
  staff:     <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/></svg>,
  logbook:   <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/></svg>,
  checkin:   <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>,
  portfolio: <svg viewBox="0 0 20 20" fill="currentColor"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"/></svg>,
  remit:     <svg viewBox="0 0 20 20" fill="currentColor"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/></svg>,
};

// ── Navigation config per role ────────────────────────────────
const NAV = {
  super_admin: [
    { section: 'Overview' },
    { to: '/admin',               icon: I.home,     label: 'Dashboard' },
    { section: 'Properties' },
    { to: '/admin/properties',    icon: I.building, label: 'Properties' },
    { to: '/admin/units',         icon: I.key,      label: 'Units' },
    { to: '/admin/tenants',       icon: I.users,    label: 'Tenants' },
    { to: '/admin/tenancies',     icon: I.doc,      label: 'Tenancies' },
    { section: 'Finance' },
    { to: '/admin/invoices',      icon: I.receipt,  label: 'Invoices' },
    { to: '/admin/payments',      icon: I.card,     label: 'Payments' },
    { to: '/admin/expenses',      icon: I.spend,    label: 'Expenses' },
    { to: '/admin/reports',       icon: I.chart,    label: 'Reports' },
    { section: 'Operations' },
    { to: '/admin/maintenance',   icon: I.wrench,   label: 'Maintenance' },
    { to: '/admin/visitors',      icon: I.visitor,  label: 'Visitors' },
    { to: '/admin/parking',       icon: I.car,      label: 'Parking' },
    { to: '/admin/utilities',     icon: I.drop,     label: 'Utilities' },
    { to: '/admin/shared-meters', icon: I.meter,    label: 'Shared Meters' },
    { to: '/admin/announcements', icon: I.bell,     label: 'Announcements' },
    { to: '/admin/cases',         icon: I.ticket,   label: 'Cases' },
    { to: '/admin/vendors',       icon: I.hammer,   label: 'Vendors' },
    { to: '/admin/service-charges', icon: I.cash,   label: 'Service Charges' },
    { to: '/admin/vacate',        icon: I.box,      label: 'Vacate Notices' },
    { to: '/admin/import',        icon: I.download, label: 'Bulk Import' },
    { section: 'System' },
    { to: '/admin/users',         icon: I.person,   label: 'Users' },
    { to: '/admin/settings',      icon: I.cog,      label: 'Settings' },
    { to: '/messages',            icon: I.mail,     label: 'Messages' },
    { to: '/profile',             icon: I.id,       label: 'My Profile' },
  ],
  property_manager: [
    { section: 'Overview' },
    { to: '/manager',                 icon: I.home,     label: 'Dashboard' },
    { section: 'Properties' },
    { to: '/manager/properties',      icon: I.building, label: 'Properties' },
    { to: '/manager/units',           icon: I.key,      label: 'Units' },
    { to: '/manager/tenants',         icon: I.users,    label: 'Tenants' },
    { to: '/manager/tenancies',       icon: I.doc,      label: 'Tenancies' },
    { section: 'Finance' },
    { to: '/manager/invoices',        icon: I.receipt,  label: 'Invoices' },
    { to: '/manager/payments',        icon: I.card,     label: 'Payments' },
    { to: '/manager/expenses',        icon: I.spend,    label: 'Expenses' },
    { to: '/manager/reports',         icon: I.chart,    label: 'Reports' },
    { to: '/manager/remittances',     icon: I.remit,    label: 'Remittances' },
    { section: 'Operations' },
    { to: '/manager/maintenance',     icon: I.wrench,   label: 'Maintenance' },
    { to: '/manager/visitors',        icon: I.visitor,  label: 'Visitors' },
    { to: '/manager/parking',         icon: I.car,      label: 'Parking' },
    { to: '/manager/utilities',       icon: I.drop,     label: 'Utilities' },
    { to: '/manager/announcements',   icon: I.bell,     label: 'Announcements' },
    { to: '/manager/vacate',          icon: I.box,      label: 'Vacate Notices' },
    { to: '/manager/staff',           icon: I.staff,    label: 'Staff' },
    { section: 'Account' },
    { to: '/messages',                icon: I.mail,     label: 'Messages' },
    { to: '/profile',                 icon: I.id,       label: 'My Profile' },
  ],
  tenant: [
    { section: 'My Account' },
    { to: '/tenant',                  icon: I.home,     label: 'Dashboard' },
    { to: '/tenant/invoices',         icon: I.receipt,  label: 'My Invoices' },
    { to: '/tenant/payments',         icon: I.card,     label: 'Pay Rent' },
    { to: '/tenant/statement',        icon: I.chart,    label: 'My Statement' },
    { to: '/tenant/ledger',           icon: I.logbook,  label: 'Account Ledger' },
    { section: 'Requests' },
    { to: '/tenant/maintenance',      icon: I.wrench,   label: 'Maintenance' },
    { to: '/tenant/utilities',        icon: I.drop,     label: 'Utility Bills' },
    { to: '/tenant/visitors',         icon: I.visitor,  label: 'Register Visitor' },
    { to: '/tenant/vacate',           icon: I.box,      label: 'Vacate Notice' },
    { to: '/tenant/cases',            icon: I.ticket,   label: 'My Cases' },
    { section: 'Info' },
    { to: '/tenant/announcements',    icon: I.bell,     label: 'Announcements' },
    { to: '/messages',                icon: I.mail,     label: 'Messages' },
    { to: '/profile',                 icon: I.id,       label: 'My Profile' },
  ],
  caretaker: [
    { section: 'My Work' },
    { to: '/caretaker',               icon: I.home,     label: 'Dashboard' },
    { to: '/caretaker/readings',      icon: I.meter,    label: 'Meter Readings' },
    { to: '/caretaker/maintenance',   icon: I.wrench,   label: 'Maintenance' },
    { to: '/caretaker/inspections',   icon: I.checkin,  label: 'Inspections' },
    { section: 'Info' },
    { to: '/caretaker/units',         icon: I.key,      label: 'Units' },
    { to: '/caretaker/tenants',       icon: I.users,    label: 'Tenants' },
    { to: '/caretaker/announcements', icon: I.bell,     label: 'Announcements' },
    { to: '/messages',                icon: I.mail,     label: 'Messages' },
    { to: '/profile',                 icon: I.id,       label: 'My Profile' },
  ],
  security: [
    { section: 'Gate Control' },
    { to: '/security',                icon: I.home,     label: 'Dashboard' },
    { to: '/security/check-in',       icon: I.checkin,  label: 'Visitor Check-In' },
    { to: '/security/visitors',       icon: I.visitor,  label: 'Visitors Log' },
    { to: '/security/parking',        icon: I.car,      label: 'Parking' },
    { to: '/security/access-log',     icon: I.logbook,  label: 'Access Log' },
    { to: '/security/logbook',        icon: I.doc,      label: 'Logbook' },
    { section: 'Info' },
    { to: '/security/units',          icon: I.key,      label: 'Units' },
    { to: '/security/alerts',         icon: I.alert,    label: 'Alerts' },
    { to: '/profile',                 icon: I.id,       label: 'My Profile' },
  ],
  owner: [
    { section: 'Overview' },
    { to: '/owner',                   icon: I.chart,    label: 'Dashboard' },
    { section: 'Portfolio' },
    { to: '/owner/properties',        icon: I.building, label: 'My Properties' },
    { to: '/owner/units',             icon: I.key,      label: 'Units & Tenants' },
    { section: 'Financials' },
    { to: '/owner/invoices',          icon: I.receipt,  label: 'Invoices' },
    { to: '/owner/expenses',          icon: I.spend,    label: 'Expenses' },
    { to: '/owner/remittances',       icon: I.remit,    label: 'Remittances' },
    { section: 'Operations' },
    { to: '/owner/maintenance',       icon: I.wrench,   label: 'Maintenance' },
    { to: '/owner/tenants',           icon: I.users,    label: 'Tenants' },
    { section: 'Account' },
    { to: '/messages',                icon: I.mail,     label: 'Messages' },
    { to: '/profile',                 icon: I.id,       label: 'My Profile' },
  ],
};

export default function Sidebar({ open, onClose }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const nav = NAV[user?.role] || [];

  const { data: notifData } = useQuery({
    queryKey: ['notifications-badge'],
    queryFn:  () => import('../../api').then(m => m.getNotifications()).then(r => r.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const unread = notifData?.unread || 0;

  const isActive = (to) => {
    const dashboardRoutes = ['/admin', '/manager', '/owner', '/tenant', '/caretaker', '/security'];
    if (dashboardRoutes.includes(to)) return location.pathname === to;
    return location.pathname.startsWith(to);
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        style={{ background: 'var(--sidebar-bg)', width: 'var(--sidebar-w)' }}
        className={`fixed inset-y-0 left-0 z-30 flex flex-col h-screen
          transition-transform duration-200 lg:translate-x-0
          ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* ── Brand ── */}
        <div style={{ borderBottom: '1px solid var(--sidebar-border)' }}
          className="flex items-center gap-3 px-5 py-4 flex-shrink-0">
          <div style={{ background: 'var(--brand)', borderRadius: 10 }}
            className="w-8 h-8 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h4a1 1 0 001-1v-3h2v3a1 1 0 001 1h4a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold text-sm leading-tight tracking-wide">
              Smart<span style={{ color: 'var(--brand)' }}>Nyumba</span>
            </p>
            <p style={{ color: 'var(--sidebar-text)', fontSize: 11 }} className="truncate">
              {roleName(user?.role)}
            </p>
          </div>
          {unread > 0 && (
            <span style={{ background: '#E11D48', fontSize: 10 }}
              className="flex-shrink-0 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {nav.map((item, i) => {
            if (item.section) {
              return (
                <p key={i}
                  style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, letterSpacing: '0.1em' }}
                  className="font-bold uppercase px-2 pt-5 pb-1.5 first:pt-2">
                  {item.section}
                </p>
              );
            }
            const active = isActive(item.to);
            return (
              <Link
                key={i}
                to={item.to}
                onClick={onClose}
                style={active
                  ? { background: 'rgba(245,158,11,0.15)', color: 'var(--sidebar-active)' }
                  : { color: 'var(--sidebar-text)' }
                }
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-100 mb-0.5 group
                  ${!active ? 'hover:bg-white/[0.06] hover:text-white' : ''}`}
              >
                <span style={{ color: active ? 'var(--brand)' : 'inherit' }}
                  className="w-4 h-4 flex-shrink-0 transition-colors">
                  {item.icon}
                </span>
                <span className="truncate flex-1">{item.label}</span>
                {active && (
                  <span style={{ background: 'var(--brand)' }}
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* ── User footer ── */}
        <div style={{ borderTop: '1px solid var(--sidebar-border)' }}
          className="px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div style={{ background: 'rgba(245,158,11,0.2)', color: 'var(--brand)', fontSize: 12 }}
              className="w-7 h-7 rounded-full flex items-center justify-center font-bold flex-shrink-0">
              {user?.full_name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-semibold truncate leading-tight">{user?.full_name}</p>
              <p style={{ color: 'var(--sidebar-text)', fontSize: 11 }} className="truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            style={{ color: 'rgba(255,255,255,0.3)' }}
            className="flex items-center gap-1.5 text-xs hover:text-red-400 transition-colors w-full py-0.5"
          >
            <span className="w-3.5 h-3.5">{I.logout}</span>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}