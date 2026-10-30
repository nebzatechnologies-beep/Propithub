import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAppData } from '../../context/AppDataContext';
import { getCurrencySymbol, DEFAULT_CURRENCY_SYMBOL } from '../../lib/currencyService';
import {
  Search,
  X,
  Building2,
  Home,
  Users,
  FileText,
  CreditCard,
  Wrench,
  Layers,
  Radio,
  Compass,
  ArrowRight,
  Sparkles,
  ClipboardList,
  UserCheck,
  Shield,
  HelpCircle,
  Award,
  CornerDownLeft,
} from 'lucide-react';

export interface SearchResultItem {
  id: string;
  category: 'Pages' | 'Properties' | 'Units' | 'Tenants' | 'Leases' | 'Finances' | 'Maintenance' | 'Users' | 'Broadcasts' | 'Team';
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  link: string;
  icon: React.ReactNode;
}

export const GlobalSearch: React.FC = () => {
  const { role, user } = useAuth();
  const { state } = useAppData();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // 1. Keyboard Shortcut Listener (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus input on modal open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      setSelectedIndex(0);
    } else {
      setQuery('');
      setActiveCategory('all');
    }
  }, [isOpen]);

  // Role display placeholder
  const placeholderText = useMemo(() => {
    switch (role) {
      case 'superadmin':
        return 'Search users, properties, invoices, plans, logs...';
      case 'owner':
        return 'Search properties, units, tenants, leases, tickets...';
      case 'tenant':
        return 'Search rent, maintenance tickets, lease, notices...';
      case 'manager':
        return 'Search properties, units, leases, repairs...';
      case 'staff':
        return 'Search work orders, units, task fees...';
      default:
        return 'Search anything across workspace...';
    }
  }, [role]);

  // 2. Role-Scoped Pages Directory
  const workspacePages = useMemo(() => {
    const pages: SearchResultItem[] = [];

    if (role === 'superadmin') {
      pages.push(
        { id: 'page-sa-overview', category: 'Pages', title: 'Platform Overview', subtitle: 'Global KPI metrics, GMV, and revenue oversight', link: '/superadmin/overview', icon: <Compass size={16} /> },
        { id: 'page-sa-users', category: 'Pages', title: 'Users Directory', subtitle: 'Manage all owners, tenants, managers, and staff accounts', link: '/superadmin/users', icon: <Users size={16} /> },
        { id: 'page-sa-plans', category: 'Pages', title: 'Subscription Plans', subtitle: 'Platform tier limits, pricing models, and billing packages', link: '/superadmin/plans', icon: <Layers size={16} /> },
        { id: 'page-sa-invoices', category: 'Pages', title: 'Platform Invoices', subtitle: 'SaaS subscription billing statements and collection receipts', link: '/superadmin/invoices', icon: <CreditCard size={16} /> },
        { id: 'page-sa-broadcasts', category: 'Pages', title: 'Broadcasts & Notices', subtitle: 'Send announcements and push notifications to any role', link: '/superadmin/messages', icon: <Radio size={16} /> },
        { id: 'page-sa-gateways', category: 'Pages', title: 'Gateways & Integrations', subtitle: 'Stripe, PayPal, Paystack, Twilio, SendGrid credentials', link: '/superadmin/connections', icon: <Shield size={16} /> },
        { id: 'page-sa-cms', category: 'Pages', title: 'Landing CMS', subtitle: 'Public marketing website text, pricing plans, and hero banners', link: '/superadmin/landing-cms', icon: <Sparkles size={16} /> },
        { id: 'page-sa-audit', category: 'Pages', title: 'Oversight & Audit Logs', subtitle: 'System-wide activity logs, role events, and security audit trail', link: '/superadmin/oversight', icon: <ClipboardList size={16} /> },
        { id: 'page-sa-settings', category: 'Pages', title: 'Account Settings', subtitle: 'Superadmin credentials, profile, and security preferences', link: '/superadmin/settings', icon: <Compass size={16} /> },
      );
    } else if (role === 'owner') {
      pages.push(
        { id: 'page-owner-dash', category: 'Pages', title: 'Portfolio Overview', subtitle: 'Real-time revenue, occupancy rate, and active tenant count', link: '/owner/dashboard', icon: <Compass size={16} /> },
        { id: 'page-owner-props', category: 'Pages', title: 'Properties & Units', subtitle: 'Portfolio assets, multi-unit buildings, and unit occupancy status', link: '/owner/properties', icon: <Building2 size={16} /> },
        { id: 'page-owner-tenants', category: 'Pages', title: 'Tenant Management', subtitle: 'All active residents, KYC documents, and tenant contact cards', link: '/owner/tenants', icon: <Users size={16} /> },
        { id: 'page-owner-leases', category: 'Pages', title: 'Leasing & Agreements', subtitle: 'Digital lease contracts, signatures, and terms renewal', link: '/owner/leasing', icon: <FileText size={16} /> },
        { id: 'page-owner-vacates', category: 'Pages', title: 'Move-Outs & Vacates', subtitle: 'Tenant vacating notices, handovers, and deposit settlements', link: '/owner/vacates', icon: <ClipboardList size={16} /> },
        { id: 'page-owner-finances', category: 'Pages', title: 'Transactions & Rent Invoices', subtitle: 'Rent collections, payment ledgers, and payout records', link: '/owner/payments', icon: <CreditCard size={16} /> },
        { id: 'page-owner-announcements', category: 'Pages', title: 'Announcements & Notices', subtitle: 'Post notices to all properties, specific buildings, or residents', link: '/owner/messages', icon: <Radio size={16} /> },
        { id: 'page-owner-maintenance', category: 'Pages', title: 'Maintenance & Tickets', subtitle: 'Repair requests, staff assignment, and work order dispatch', link: '/owner/maintenance', icon: <Wrench size={16} /> },
        { id: 'page-owner-team', category: 'Pages', title: 'Staff & Team Directory', subtitle: 'Property managers and maintenance staff assigned to portfolio', link: '/owner/team', icon: <UserCheck size={16} /> },
        { id: 'page-owner-helpdesk', category: 'Pages', title: 'Platform Helpdesk', subtitle: 'Submit priority support tickets to Propithub engineering', link: '/owner/helpdesk', icon: <HelpCircle size={16} /> },
        { id: 'page-owner-plan', category: 'Pages', title: 'Subscription Plan', subtitle: 'Portfolio tier package, unit quotas, and billing status', link: '/owner/plan', icon: <Sparkles size={16} /> },
        { id: 'page-owner-reputation', category: 'Pages', title: 'Reviews & Ratings', subtitle: 'Tenant feedback ratings and verified reviews', link: '/owner/reviews', icon: <Award size={16} /> },
        { id: 'page-owner-settings', category: 'Pages', title: 'Account Settings', subtitle: 'Profile, payout configurations, and security credentials', link: '/owner/settings', icon: <Compass size={16} /> },
      );
    } else if (role === 'tenant') {
      pages.push(
        { id: 'page-tenant-dash', category: 'Pages', title: 'Resident Home & Overview', subtitle: 'My rental unit, monthly rent balance, and landlord notices', link: '/tenant/dashboard', icon: <Home size={16} /> },
        { id: 'page-tenant-lease', category: 'Pages', title: 'My Lease Agreement', subtitle: 'View digital lease terms, signed PDF documents, and dates', link: '/tenant/lease', icon: <FileText size={16} /> },
        { id: 'page-tenant-payments', category: 'Pages', title: 'Pay Rent & Transaction History', subtitle: 'Pay active rent invoices, security deposit, and payment receipts', link: '/tenant/payments', icon: <CreditCard size={16} /> },
        { id: 'page-tenant-support', category: 'Pages', title: 'Maintenance & Repair Requests', subtitle: 'Submit tickets with photos, track technicians, and report issues', link: '/tenant/support', icon: <Wrench size={16} /> },
        { id: 'page-tenant-reviews', category: 'Pages', title: 'Landlord Reviews & Trust', subtitle: 'Rate property management and browse community landlord ratings', link: '/tenant/trust', icon: <Award size={16} /> },
        { id: 'page-tenant-settings', category: 'Pages', title: 'Account Settings', subtitle: 'Manage contact email, phone number, and password', link: '/tenant/settings', icon: <Compass size={16} /> },
      );
    } else if (role === 'manager') {
      pages.push(
        { id: 'page-mgr-dash', category: 'Pages', title: 'Operations Dashboard', subtitle: 'Occupancy overview, open repair tickets, and managed buildings', link: '/manager/dashboard', icon: <Compass size={16} /> },
        { id: 'page-mgr-props', category: 'Pages', title: 'Managed Properties & Units', subtitle: 'Assigned buildings, unit inventory, and tenant rosters', link: '/manager/properties', icon: <Building2 size={16} /> },
        { id: 'page-mgr-leasing', category: 'Pages', title: 'Leasing & Tenant Agreements', subtitle: 'Active residential contracts, renewal dates, and digital copies', link: '/manager/leasing', icon: <FileText size={16} /> },
        { id: 'page-mgr-maintenance', category: 'Pages', title: 'Repair Dispatch & Tickets', subtitle: 'Coordinate maintenance staff and resolve work orders', link: '/manager/maintenance', icon: <Wrench size={16} /> },
        { id: 'page-mgr-settings', category: 'Pages', title: 'Account Settings', subtitle: 'Property manager profile and login credentials', link: '/manager/settings', icon: <Compass size={16} /> },
      );
    } else if (role === 'staff') {
      pages.push(
        { id: 'page-staff-dash', category: 'Pages', title: 'Work Order Queue', subtitle: 'Assigned maintenance tasks, unit access times, and status updates', link: '/staff/dashboard', icon: <Wrench size={16} /> },
        { id: 'page-staff-payments', category: 'Pages', title: 'Task Fees & Payouts', subtitle: 'Completed maintenance earnings, compensation history, and fees', link: '/staff/payments', icon: <CreditCard size={16} /> },
        { id: 'page-staff-ratings', category: 'Pages', title: 'Service Ratings & Feedback', subtitle: 'Tenant reviews and owner performance scores', link: '/staff/ratings', icon: <Award size={16} /> },
        { id: 'page-staff-settings', category: 'Pages', title: 'Account Settings', subtitle: 'Technician profile, trade specialization, and phone number', link: '/staff/settings', icon: <Compass size={16} /> },
      );
    }

    return pages;
  }, [role]);

  // 3. Role-Scoped Data Collection
  const allRoleItems = useMemo(() => {
    const items: SearchResultItem[] = [];

    // --- SUPERADMIN SCOPE ---
    if (role === 'superadmin') {
      // Users
      (state.users || []).forEach((u) => {
        items.push({
          id: `user-${u.id}`,
          category: 'Users',
          title: u.displayName || u.email,
          subtitle: `${u.email} • ${u.role.toUpperCase()}${u.phone ? ` • ${u.phone}` : ''}`,
          badge: u.role,
          badgeColor: u.role === 'owner' ? '#0284c7' : u.role === 'tenant' ? '#059669' : '#b45309',
          link: '/superadmin/users',
          icon: <Users size={16} />,
        });
      });

      // Properties
      (state.properties || []).forEach((p) => {
        const addr = p.address?.formattedAddress || p.address?.city || '';
        items.push({
          id: `prop-${p.id}`,
          category: 'Properties',
          title: p.name,
          subtitle: `${addr ? `${addr} • ` : ''}Total Units: ${p.unitCount || 0} (Occupied: ${p.occupied || 0})`,
          badge: 'Property',
          badgeColor: '#0284c7',
          link: '/superadmin/oversight',
          icon: <Building2 size={16} />,
        });
      });

      // Plans
      (state.plans || []).forEach((pl) => {
        items.push({
          id: `plan-${pl.id}`,
          category: 'Finances',
          title: `${pl.name} Tier Plan`,
          subtitle: `$${pl.price}/mo • Up to ${pl.properties} properties, ${pl.units} units`,
          badge: `$${pl.price}/mo`,
          badgeColor: '#10b981',
          link: '/superadmin/plans',
          icon: <Layers size={16} />,
        });
      });

      // Invoices
      (state.platformInvoices || []).forEach((inv) => {
        items.push({
          id: `inv-${inv.id}`,
          category: 'Finances',
          title: `Platform Invoice #${inv.id.slice(-6).toUpperCase()}`,
          subtitle: `${inv.ownerName || inv.ownerEmail} • Amount: $${inv.amount} • Status: ${inv.status.toUpperCase()}`,
          badge: inv.status,
          badgeColor: inv.status === 'paid' ? '#059669' : '#d97706',
          link: '/superadmin/invoices',
          icon: <CreditCard size={16} />,
        });
      });

      // Announcements / Broadcasts
      (state.announcements || []).forEach((a) => {
        items.push({
          id: `ann-${a.id}`,
          category: 'Broadcasts',
          title: a.title,
          subtitle: `Category: ${a.category} • Priority: ${a.priority} • Status: ${a.status}`,
          badge: a.priority,
          badgeColor: a.priority === 'urgent' ? '#dc2626' : '#0284c7',
          link: '/superadmin/messages',
          icon: <Radio size={16} />,
        });
      });
    }

    // --- OWNER SCOPE ---
    else if (role === 'owner') {
      const ownerIdSet = new Set<string>();
      if (user?.id) ownerIdSet.add(user.id);
      if ((user as any)?.uid) ownerIdSet.add((user as any).uid);
      if (state.currentUserId) ownerIdSet.add(state.currentUserId);
      const ownerEntry = state.users?.find((u) => u.id === user?.id || u.email === user?.email);
      if (ownerEntry?.id) ownerIdSet.add(ownerEntry.id);

      const myProperties = (state.properties || []).filter((p) => Boolean(p.ownerId) && ownerIdSet.has(p.ownerId));
      const myPropIds = new Set(myProperties.map((p) => p.id));

      // Properties
      myProperties.forEach((p) => {
        const addr = p.address?.formattedAddress || p.address?.city || '';
        items.push({
          id: `prop-${p.id}`,
          category: 'Properties',
          title: p.name,
          subtitle: `${addr ? `${addr} • ` : ''}${p.unitCount || 0} Units (${p.occupied || 0} Occupied)`,
          badge: `${p.unitCount || 0} Units`,
          badgeColor: '#0284c7',
          link: '/owner/properties',
          icon: <Building2 size={16} />,
        });
      });

      // Units
      (state.units || []).filter((u) => myPropIds.has(u.propertyId)).forEach((u) => {
        const prop = myProperties.find((p) => p.id === u.propertyId);
        const currSym = getCurrencySymbol(u.currency || prop?.currency) || DEFAULT_CURRENCY_SYMBOL;
        const tenantInfo = u.tenant ? ` • Resident: ${u.tenant}` : ' • Vacant';
        items.push({
          id: `unit-${u.id}`,
          category: 'Units',
          title: `Unit ${u.unitNumber}${u.tenant ? ` (${u.tenant})` : ''}`,
          subtitle: `${prop?.name || 'Property'} • Status: ${u.status.toUpperCase()}${tenantInfo} • Rent: ${currSym}${Number(u.rent || 0).toLocaleString()}/mo`,
          badge: u.status,
          badgeColor: u.status === 'occupied' ? '#059669' : u.status === 'reserved' ? '#d97706' : '#64748b',
          link: '/owner/properties',
          icon: <Home size={16} />,
        });
      });

      // Tenants
      (state.tenants || [])
        .filter((t) => (t.ownerId && ownerIdSet.has(t.ownerId)) || (t.propertyId && myPropIds.has(t.propertyId)))
        .forEach((t) => {
          items.push({
            id: `tenant-${t.id}`,
            category: 'Tenants',
            title: t.name,
            subtitle: `Unit: ${t.unit || 'Assigned'} • Phone: ${t.phone || 'N/A'} • Email: ${t.email || 'N/A'}`,
            badge: t.unit ? `Unit ${t.unit}` : 'Tenant',
            badgeColor: '#059669',
            link: '/owner/tenants',
            icon: <Users size={16} />,
          });
        });

      // Leases / Agreements
      (state.agreements || [])
        .filter((a) => (a.ownerId && ownerIdSet.has(a.ownerId)) || (a.propertyId && myPropIds.has(a.propertyId)))
        .forEach((a) => {
          items.push({
            id: `agr-${a.id}`,
            category: 'Leases',
            title: `Lease: ${a.tenant || 'Resident'} (${a.unit})`,
            subtitle: `Term: ${a.start || 'N/A'} to ${a.end || 'N/A'} • Rent: $${a.rent || 0} • Status: ${a.status}`,
            badge: a.status,
            badgeColor: a.status === 'active' ? '#059669' : '#64748b',
            link: '/owner/leasing',
            icon: <FileText size={16} />,
          });
        });

      // Financial Transactions / Rent Payments
      (state.payments || [])
        .filter((p) => (p.ownerId && ownerIdSet.has(p.ownerId)) || (p.propertyId && myPropIds.has(p.propertyId)))
        .forEach((p) => {
          items.push({
            id: `pay-${p.id}`,
            category: 'Finances',
            title: `Payment: $${p.amount} (${p.tenant || 'Tenant'})`,
            subtitle: `Unit ${p.unit || 'N/A'} • Date: ${p.date ? new Date(p.date).toLocaleDateString() : 'Recent'} • Status: ${p.status.toUpperCase()}`,
            badge: p.status,
            badgeColor: p.status === 'paid' ? '#059669' : '#d97706',
            link: '/owner/payments',
            icon: <CreditCard size={16} />,
          });
        });

      // Maintenance Tickets
      (state.tickets || [])
        .filter((t) => (t.ownerId && ownerIdSet.has(t.ownerId)) || (t.propertyId && myPropIds.has(t.propertyId)))
        .forEach((t) => {
          items.push({
            id: `tick-${t.id}`,
            category: 'Maintenance',
            title: `Ticket #${t.id.slice(-5)}: ${t.issue}`,
            subtitle: `Unit: ${t.unit} • Priority: ${t.priority} • Status: ${t.status.toUpperCase()}`,
            badge: t.priority,
            badgeColor: t.priority === 'High' ? '#dc2626' : t.priority === 'Medium' ? '#ea580c' : '#0284c7',
            link: '/owner/maintenance',
            icon: <Wrench size={16} />,
          });
        });

      // Staff & Managers
      (state.staff || []).filter((s) => Boolean(s.ownerId) && ownerIdSet.has(s.ownerId)).forEach((s) => {
        items.push({
          id: `staff-${s.id}`,
          category: 'Team',
          title: s.name,
          subtitle: `Maintenance Tech • Role: ${s.role || 'Staff'} • Phone: ${s.phone || 'N/A'}`,
          badge: 'Staff',
          badgeColor: '#0284c7',
          link: '/owner/team',
          icon: <UserCheck size={16} />,
        });
      });

      (state.managers || []).filter((m) => Boolean(m.ownerId) && ownerIdSet.has(m.ownerId)).forEach((m) => {
        items.push({
          id: `mgr-${m.id}`,
          category: 'Team',
          title: m.name,
          subtitle: `Property Manager • Email: ${m.email} • Phone: ${m.phone || 'N/A'}`,
          badge: 'Manager',
          badgeColor: '#7c3aed',
          link: '/owner/team',
          icon: <UserCheck size={16} />,
        });
      });

      // Announcements
      (state.announcements || []).filter((a) => !a.ownerId || ownerIdSet.has(a.ownerId) || a.ownerId === 'owner').forEach((a) => {
        items.push({
          id: `ann-${a.id}`,
          category: 'Broadcasts',
          title: a.title,
          subtitle: `Priority: ${a.priority.toUpperCase()} • Target: ${a.targetScope?.allProperties ? 'Portfolio' : 'Filtered'} • Status: ${a.status}`,
          badge: a.priority,
          badgeColor: a.priority === 'urgent' ? '#dc2626' : '#0284c7',
          link: '/owner/messages',
          icon: <Radio size={16} />,
        });
      });
    }

    // --- TENANT SCOPE ---
    else if (role === 'tenant') {
      const tenantEmailLower = user?.email?.toLowerCase();
      const tenantId = user?.id;

      // Units
      (state.units || [])
        .filter((u) => (tenantId && u.currentTenantId === tenantId) || (tenantEmailLower && u.tenant?.toLowerCase() === tenantEmailLower))
        .forEach((u) => {
          const prop = (state.properties || []).find((p) => p.id === u.propertyId);
          const currSym = getCurrencySymbol(u.currency || prop?.currency) || DEFAULT_CURRENCY_SYMBOL;
          items.push({
            id: `unit-${u.id}`,
            category: 'Units',
            title: `Unit ${u.unitNumber} - ${prop?.name || 'Rented Unit'}`,
            subtitle: `${prop?.address?.formattedAddress || prop?.address?.city || ''} • Rent: ${currSym}${Number(u.rent || 0).toLocaleString()}/mo`,
            badge: 'Active Lease',
            badgeColor: '#059669',
            link: '/tenant/dashboard',
            icon: <Home size={16} />,
          });
        });

      // Agreements
      (state.agreements || [])
        .filter((a) => (tenantId && a.tenantId === tenantId) || (tenantEmailLower && a.tenantEmail?.toLowerCase() === tenantEmailLower))
        .forEach((a) => {
          const agCurr = getCurrencySymbol(a.currency) || DEFAULT_CURRENCY_SYMBOL;
          items.push({
            id: `agr-${a.id}`,
            category: 'Leases',
            title: `Lease Agreement - Unit ${a.unit}`,
            subtitle: `Term: ${a.start} to ${a.end} • Rent: ${agCurr}${Number(a.rent || 0).toLocaleString()}/mo`,
            badge: a.status,
            badgeColor: '#059669',
            link: '/tenant/lease',
            icon: <FileText size={16} />,
          });
        });

      // Invoices / Payments
      (state.payments || [])
        .filter((p) => (tenantId && p.tenantId === tenantId) || (tenantEmailLower && p.tenant?.toLowerCase() === tenantEmailLower))
        .forEach((p) => {
          const payCurr = getCurrencySymbol(p.currency) || DEFAULT_CURRENCY_SYMBOL;
          items.push({
            id: `pay-${p.id}`,
            category: 'Finances',
            title: `Payment: ${payCurr}${Number(p.amount || 0).toLocaleString()} (${p.type ? p.type.toUpperCase() : 'RENT'})`,
            subtitle: `Date: ${p.date ? new Date(p.date).toLocaleDateString() : 'Recent'} • Status: ${p.status.toUpperCase()}`,
            badge: p.status,
            badgeColor: p.status === 'paid' ? '#059669' : '#d97706',
            link: '/tenant/payments',
            icon: <CreditCard size={16} />,
          });
        });

      // Maintenance Tickets
      (state.tickets || [])
        .filter((t) => (tenantId && t.tenantId === tenantId) || (tenantEmailLower && t.tenantContact?.email?.toLowerCase() === tenantEmailLower))
        .forEach((t) => {
          items.push({
            id: `tick-${t.id}`,
            category: 'Maintenance',
            title: `Ticket: ${t.issue}`,
            subtitle: `Unit: ${t.unit} • Status: ${t.status.toUpperCase()} • Priority: ${t.priority}`,
            badge: t.status,
            badgeColor: t.status === 'resolved' ? '#059669' : '#0284c7',
            link: '/tenant/support',
            icon: <Wrench size={16} />,
          });
        });

      // Announcements for tenant
      (state.announcements || [])
        .filter((a) => a.status === 'published' && a.targetScope?.targetRoles?.includes('tenant'))
        .forEach((a) => {
          items.push({
            id: `ann-${a.id}`,
            category: 'Broadcasts',
            title: a.title,
            subtitle: a.body?.slice(0, 75) + '...',
            badge: a.priority,
            badgeColor: a.priority === 'urgent' ? '#dc2626' : '#0284c7',
            link: '/tenant/dashboard',
            icon: <Radio size={16} />,
          });
        });
    }

    // --- MANAGER SCOPE ---
    else if (role === 'manager') {
      const ownerId = user?.ownerId || '';
      const managerRecord = (state.managers || []).find(
        (m) =>
          (user?.id && String(m.id) === user.id) ||
          (user?.email && m.email?.toLowerCase() === user.email.toLowerCase())
      );
      const assignedPropertyId = (user as any)?.propertyId || (user as any)?.assignedPropertyId || managerRecord?.propertyId || '';

      const myProperties = (state.properties || []).filter((p) => {
        if (!ownerId) return true;
        if (p.ownerId !== ownerId) return false;
        if (assignedPropertyId) {
          return p.id === assignedPropertyId || p.assignedManagerId === user?.id;
        }
        return true;
      });
      const myPropIds = new Set(myProperties.map((p) => p.id));

      myProperties.forEach((p) => {
        items.push({
          id: `prop-${p.id}`,
          category: 'Properties',
          title: p.name,
          subtitle: `${p.address?.city || 'Local Property'} • Total Units: ${p.unitCount || 0}`,
          badge: 'Property',
          badgeColor: '#0284c7',
          link: '/manager/properties',
          icon: <Building2 size={16} />,
        });
      });

      // Units with dynamic currency and resident names
      (state.units || []).filter((u) => myPropIds.has(u.propertyId)).forEach((u) => {
        const prop = myProperties.find((p) => p.id === u.propertyId);
        const currSym = getCurrencySymbol(u.currency || prop?.currency) || DEFAULT_CURRENCY_SYMBOL;
        const tenantInfo = u.tenant ? ` • Resident: ${u.tenant}` : ' • Vacant';
        items.push({
          id: `unit-${u.id}`,
          category: 'Units',
          title: `Unit ${u.unitNumber}${u.tenant ? ` (${u.tenant})` : ''}`,
          subtitle: `Status: ${u.status.toUpperCase()}${tenantInfo} • Rent: ${currSym}${Number(u.rent || 0).toLocaleString()}/mo`,
          badge: u.status,
          badgeColor: u.status === 'occupied' ? '#059669' : u.status === 'reserved' ? '#d97706' : '#64748b',
          link: '/manager/properties',
          icon: <Home size={16} />,
        });
      });

      // Residents directory
      (state.tenants || []).filter((t) => !t.propertyId || myPropIds.has(t.propertyId)).forEach((t) => {
        items.push({
          id: `tenant-${t.id}`,
          category: 'Tenants',
          title: t.name || t.email,
          subtitle: `Unit: ${t.unit || 'N/A'} • Email: ${t.email}${t.phone ? ` • ${t.phone}` : ''}`,
          badge: 'Resident',
          badgeColor: '#059669',
          link: '/manager/properties',
          icon: <Users size={16} />,
        });
      });

      // Maintenance tickets with resident info
      (state.tickets || []).filter((t) => t.propertyId && myPropIds.has(t.propertyId)).forEach((t) => {
        const tenantInfo = t.tenant ? ` • Tenant: ${t.tenant}` : '';
        items.push({
          id: `tick-${t.id}`,
          category: 'Maintenance',
          title: `Ticket #${t.id.slice(-5)}: ${t.issue}`,
          subtitle: `Unit: ${t.unit}${tenantInfo} • Assigned: ${t.assignedTo || 'Unassigned'} • Status: ${t.status}`,
          badge: t.status,
          badgeColor: '#0284c7',
          link: '/manager/maintenance',
          icon: <Wrench size={16} />,
        });
      });
    }

    // --- STAFF SCOPE ---
    else if (role === 'staff') {
      const staffName = user?.displayName || (user as any)?.name || '';
      const staffId = user?.id || '';

      (state.tickets || [])
        .filter((t) => (staffId && t.assignedStaffId === staffId) || (staffName && t.assignedTo?.toLowerCase() === staffName.toLowerCase()))
        .forEach((t) => {
          items.push({
            id: `tick-${t.id}`,
            category: 'Maintenance',
            title: `Task #${t.id.slice(-5)}: ${t.issue}`,
            subtitle: `Unit: ${t.unit} • Priority: ${t.priority} • Status: ${t.status.toUpperCase()}`,
            badge: t.priority,
            badgeColor: t.priority === 'High' ? '#dc2626' : '#0284c7',
            link: '/staff/dashboard',
            icon: <Wrench size={16} />,
          });
        });
    }

    return items;
  }, [role, user, state]);

  // Combine pages and data items
  const combinedItems = useMemo(() => {
    return [...workspacePages, ...allRoleItems];
  }, [workspacePages, allRoleItems]);

  // 4. Dynamic Categories for Active Role
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    cats.add('all');
    cats.add('Pages');
    allRoleItems.forEach((item) => cats.add(item.category));
    return Array.from(cats);
  }, [allRoleItems]);

  // 5. Filtered Search Results
  const filteredResults = useMemo(() => {
    const q = query.toLowerCase().trim();

    return combinedItems.filter((item) => {
      // Category filter
      if (activeCategory !== 'all' && item.category !== activeCategory) {
        return false;
      }

      // Query filter
      if (!q) {
        // If query is empty, show workspace pages and recent top items
        return item.category === 'Pages' || activeCategory !== 'all';
      }

      return (
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.badge && item.badge.toLowerCase().includes(q))
      );
    }).slice(0, 30); // Cap at 30 items for ultra-fast rendering
  }, [combinedItems, query, activeCategory]);

  // Keep selected index in bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeCategory]);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (!resultsContainerRef.current) return;
    const activeEl = resultsContainerRef.current.querySelector<HTMLElement>(`[data-search-index="${selectedIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // 6. Navigation Action
  const handleSelect = useCallback((item: SearchResultItem) => {
    setIsOpen(false);
    navigate(item.link);
  }, [navigate]);

  // Keyboard navigation within list
  const handleKeyDownInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredResults.length === 0 ? 0 : (prev + 1) % filteredResults.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredResults.length === 0 ? 0 : (prev - 1 + filteredResults.length) % filteredResults.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredResults[selectedIndex]) {
        handleSelect(filteredResults[selectedIndex]);
      }
    }
  };

  return (
    <>
      {/* Top Navbar Search Input Trigger */}
      <div className="global-search-trigger-wrap">
        <button
          type="button"
          className="global-search-trigger-btn"
          onClick={() => setIsOpen(true)}
          title={`Search anything across your workspace (${navigator.platform?.includes('Mac') ? '⌘K' : 'Ctrl+K'})`}
          aria-label="Open Global Search"
        >
          <Search size={15} className="search-trigger-icon" />
          <span className="search-trigger-text">
            {placeholderText}
          </span>
          <span className="search-trigger-kbd">
            {navigator.platform?.includes('Mac') ? '⌘K' : 'Ctrl K'}
          </span>
        </button>

        {/* Mobile Compact Icon Trigger */}
        <button
          type="button"
          className="global-search-mobile-btn"
          onClick={() => setIsOpen(true)}
          title="Search"
          aria-label="Open Search"
        >
          <Search size={18} />
        </button>
      </div>

      {/* Global Command Palette Modal */}
      {isOpen && (
        <div className="global-search-backdrop" onClick={() => setIsOpen(false)}>
          <div
            className="global-search-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Search Input Box */}
            <div className="global-search-input-header">
              <Search size={18} className="global-search-modal-icon" />
              <input
                ref={inputRef}
                type="text"
                className="global-search-field"
                placeholder={placeholderText}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDownInput}
              />
              {query && (
                <button
                  type="button"
                  className="global-search-clear-btn"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  title="Clear query"
                >
                  <X size={14} />
                </button>
              )}
              <button
                type="button"
                className="global-search-esc-badge"
                onClick={() => setIsOpen(false)}
              >
                ESC
              </button>
            </div>

            {/* Filter Categories Bar */}
            <div className="global-search-tabs">
              {availableCategories.map((cat) => {
                const isActive = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`global-search-tab-pill ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setActiveCategory(cat);
                      inputRef.current?.focus();
                    }}
                  >
                    {cat === 'all' ? 'All Results' : cat}
                  </button>
                );
              })}
            </div>

            {/* Results Container */}
            <div className="global-search-results-list" ref={resultsContainerRef}>
              {filteredResults.length === 0 ? (
                <div className="global-search-empty-state">
                  <Search size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink)' }}>
                    No results found for "{query}"
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '4px' }}>
                    Try searching by property name, unit #, tenant, ticket ID, or workspace page.
                  </div>
                </div>
              ) : (
                filteredResults.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      data-search-index={idx}
                      className={`global-search-result-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <div className="global-search-item-icon-box">
                        {item.icon}
                      </div>

                      <div className="global-search-item-info">
                        <div className="global-search-item-title-row">
                          <span className="global-search-item-title">{item.title}</span>
                          {item.badge && (
                            <span
                              className="global-search-item-badge"
                              style={{
                                color: item.badgeColor || 'var(--brand)',
                                borderColor: item.badgeColor ? `${item.badgeColor}33` : 'var(--line)',
                                background: item.badgeColor ? `${item.badgeColor}15` : 'var(--surface-sunken)',
                              }}
                            >
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <div className="global-search-item-subtitle">{item.subtitle}</div>
                      </div>

                      <div className="global-search-item-action">
                        {isSelected && (
                          <span className="global-search-item-enter-hint">
                            <CornerDownLeft size={11} /> Open
                          </span>
                        )}
                        <ArrowRight size={14} className="global-search-item-arrow" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Shortcuts */}
            <div className="global-search-footer">
              <div className="global-search-footer-hint">
                <kbd>↑</kbd> <kbd>↓</kbd> to navigate
              </div>
              <div className="global-search-footer-hint">
                <kbd>↵</kbd> to select
              </div>
              <div className="global-search-footer-hint">
                <kbd>ESC</kbd> to close
              </div>
              <div className="global-search-footer-meta">
                Role: <strong style={{ color: 'var(--ink)' }}>{role?.toUpperCase()}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
