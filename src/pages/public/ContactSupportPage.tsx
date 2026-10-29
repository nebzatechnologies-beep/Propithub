import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useTheme } from '../../context/ThemeContext';
import { Mail, Phone, MapPin, Send, CheckCircle2, ArrowLeft, MessageSquare, HelpCircle, Sun, Moon } from 'lucide-react';
import { PropithubIcon } from '../../components/common/PropithubLogo';
import { ButtonProcessing } from '../../components/common/Spinner';
import { isFirebaseConfigured, db } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { PlatformSupportTicket, InAppNotification } from '../../types';

export const ContactSupportPage: React.FC = () => {
  const { state, updateState, showToast } = useAppData();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const cfg = state.landingConfig;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const contactData = cfg.legalPages?.contact || {
    title: 'Contact Support & Help Desk',
    subtitle: 'Our dedicated customer success and engineering team is available to assist property owners, tenants, and enterprise managers.',
    email: 'support@propithub.com',
    phone: '+91 (800) 555-0199',
    address: 'Tower B, 4th Floor, Financial District, Gachibowli, Hyderabad, Telangana 500032, India',
    businessHours: 'Monday – Saturday: 9:00 AM – 7:00 PM IST',
    responseTimeNotice: 'Average response turnaround within 2 hours for urgent priority tickets; next business day for general inquiries.',
    faqs: [
      {
        question: 'How do I submit an urgent maintenance issue?',
        answer: 'Log in to your Tenant Portal, go to Maintenance Desk, and click "New Ticket" to attach photos and request emergency dispatch.',
      },
      {
        question: 'How do owners configure payment gateway API keys?',
        answer: 'Navigate to Owner Portal -> Payments -> Payment Gateways to enter your Razorpay, Stripe, or UPI credentials.',
      },
    ],
  };

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'owner' | 'tenant' | 'manager' | 'general'>('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      showToast('Please fill in your name, email, and message.');
      return;
    }

    setIsSubmitting(true);
    const refId = `TKT-PUB-${Math.floor(100000 + Math.random() * 900000)}`;

    const newTicket: PlatformSupportTicket = {
      id: refId,
      owner: name.trim(),
      topic: subject.trim() || `Inquiry from ${name.trim()} (${role.toUpperCase()})`,
      detail: message.trim(),
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    const notif: InAppNotification = {
      id: `notif_${Date.now()}`,
      userId: 'role_superadmin',
      title: `New Support Request: ${subject.trim() || 'General Inquiry'}`,
      body: `${name.trim()} (${email.trim()}) sent an inquiry: "${message.trim().slice(0, 80)}..."`,
      link: '/superadmin/oversight',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    updateState((prev) => ({
      ...prev,
      platformSupport: [newTicket, ...(prev.platformSupport || [])],
      notifications: [...(prev.notifications || []), notif],
    }));

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'platformSupport', refId), {
          ...newTicket,
          senderEmail: email.trim(),
          senderPhone: phone.trim() || null,
          role,
          message: message.trim(),
          createdAt: new Date().toISOString(),
        });
        await setDoc(doc(db, 'notifications', notif.id), notif);
      } catch (err) {
        console.warn('Firestore platformSupport write error:', err);
      }
    }

    setIsSubmitting(false);
    setSubmittedRef(refId);
    setName('');
    setEmail('');
    setPhone('');
    setSubject('');
    setMessage('');
    showToast(`✓ Support inquiry dispatched! Ticket reference: ${refId}`);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)', display: 'flex', flexDirection: 'column' }}>
      {/* 1. Public Top Navigation Bar - Theme adaptive */}
      <header
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--line)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '14px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer' }}
              onClick={() => navigate('/')}
            >
              {cfg.faviconUrl ? (
                <img
                  src={cfg.faviconUrl}
                  alt="Logo"
                  style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <PropithubIcon size={24} color="#10B981" />
              )}
              <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.5px' }}>
                {cfg.brandName || 'propit'}
                <span style={{ color: '#10B981' }}>{cfg.brandAccent || 'hub'}</span>
              </span>
            </div>
            <span
              style={{
                fontSize: '11px',
                background: 'var(--surface-sunken)',
                color: 'var(--ink-soft)',
                padding: '2px 8px',
                borderRadius: '999px',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                border: '1px solid var(--line)',
              }}
            >
              Support Center
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="btn secondary small"
              style={{
                width: '36px',
                height: '36px',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                cursor: 'pointer',
                color: 'var(--ink)',
              }}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <button
              type="button"
              className="btn secondary small"
              onClick={() => navigate('/')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                fontSize: '13px',
              }}
            >
              <ArrowLeft size={14} /> Back to Home
            </button>
            <button
              type="button"
              className="btn brass small"
              onClick={() => navigate('/login')}
              style={{ padding: '6px 14px', fontSize: '13px' }}
            >
              Sign In to Portal
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Body */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px 60px', flex: 1, width: '100%' }}>
        {/* Document Header */}
        <div style={{ marginBottom: '28px', paddingBottom: '20px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link to="/" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>Home</Link>
            <span>/</span>
            <span>Support</span>
            <span>/</span>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Help Desk</span>
          </div>

          <h1 style={{ fontSize: '30px', fontWeight: 800, margin: '0 0 8px 0', letterSpacing: '-0.5px', color: 'var(--ink)' }}>
            {contactData.title}
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--ink-soft)', maxWidth: '760px', margin: 0, lineHeight: 1.5 }}>
            {contactData.subtitle}
          </p>
        </div>

        {/* Contact Info Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '36px' }}>
          {/* Email Support */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <Mail size={20} color="#10B981" />
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
              Email Support
            </div>
            <a href={`mailto:${contactData.email}`} style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)', textDecoration: 'none', display: 'block', marginBottom: '6px' }}>
              {contactData.email}
            </a>
            <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>
              {contactData.responseTimeNotice}
            </div>
          </div>

          {/* Telephone Helpline */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: theme === 'dark' ? 'rgba(56, 189, 248, 0.15)' : '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <Phone size={20} color={theme === 'dark' ? '#38BDF8' : '#2563EB'} />
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
              Direct Helpline
            </div>
            <a href={`tel:${contactData.phone}`} style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)', textDecoration: 'none', display: 'block', marginBottom: '6px' }}>
              {contactData.phone}
            </a>
            <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>
              {contactData.businessHours}
            </div>
          </div>

          {/* Corporate Office */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: theme === 'dark' ? 'rgba(168, 85, 247, 0.15)' : '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <MapPin size={20} color={theme === 'dark' ? '#C084FC' : '#7C3AED'} />
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
              Headquarters
            </div>
            <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>
              {cfg.footerCompanyName || 'NEBZA Technologies Private Limited'}
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
              {contactData.address}
            </div>
          </div>
        </div>

        {/* Form and FAQ 2-Column Split */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '32px', alignItems: 'flex-start' }}>
          {/* Support Ticket Form */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '32px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <MessageSquare size={20} color="var(--brass, #10B981)" />
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--ink)' }}>Send a Message to Support</h3>
            </div>
            <p style={{ fontSize: '13.5px', color: 'var(--ink-soft)', margin: '0 0 24px 0' }}>
              Whether you are an owner managing a portfolio or a resident with an inquiry, our team is here to assist.
            </p>

            {submittedRef && (
              <div style={{ background: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : '#F0FDF4', border: '1.5px solid var(--teal-border, #10B981)', borderRadius: '8px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <CheckCircle2 size={20} color="#10B981" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '14.5px', color: theme === 'dark' ? '#34D399' : '#166534' }}>Inquiry Received Successfully</h4>
                  <p style={{ margin: 0, fontSize: '13px', color: theme === 'dark' ? '#A7F3D0' : '#15803D' }}>
                    Your ticket reference is <b>{submittedRef}</b>. Our customer success team will review your inquiry and get back to you shortly at <b>{contactData.email}</b>.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>Your Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Sarah Jenkins"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ background: 'var(--surface-sunken)', color: 'var(--ink)', borderColor: 'var(--line-strong)' }}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ background: 'var(--surface-sunken)', color: 'var(--ink)', borderColor: 'var(--line-strong)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>Telephone / WhatsApp</label>
                  <input
                    type="tel"
                    placeholder="+91 98000 00000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={{ background: 'var(--surface-sunken)', color: 'var(--ink)', borderColor: 'var(--line-strong)' }}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>I am a...</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    style={{ background: 'var(--surface-sunken)', color: 'var(--ink)', borderColor: 'var(--line-strong)' }}
                  >
                    <option value="owner">Property Owner / Landlord</option>
                    <option value="tenant">Resident / Tenant</option>
                    <option value="manager">Property Portfolio Manager</option>
                    <option value="general">Prospective Client / Partner</option>
                  </select>
                </div>
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>Subject / Topic</label>
                <input
                  type="text"
                  placeholder="e.g., Question regarding automated rent settlements or KYC verification"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  style={{ background: 'var(--surface-sunken)', color: 'var(--ink)', borderColor: 'var(--line-strong)' }}
                />
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>Message Details *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Please describe your question or issue in detail..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  style={{ background: 'var(--surface-sunken)', color: 'var(--ink)', borderColor: 'var(--line-strong)', width: '100%', resize: 'vertical' }}
                />
              </div>

              <button
                type="submit"
                className={`btn brass ${isSubmitting ? 'btn-processing' : ''}`}
                disabled={isSubmitting}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 24px', fontSize: '14px' }}
              >
                <ButtonProcessing
                  loading={isSubmitting}
                  loadingText="Dispatching Message..."
                  defaultText="Submit Support Request"
                  icon={<Send size={15} />}
                />
              </button>
            </form>
          </div>

          {/* Quick FAQs & Links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <HelpCircle size={18} color="var(--brass, #10B981)" />
                <h4 style={{ margin: 0, fontSize: '16px', color: 'var(--ink)' }}>Frequently Asked Support Questions</h4>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {(contactData.faqs || []).map((faq, idx) => (
                  <div key={idx} style={{ borderBottom: idx < (contactData.faqs?.length || 0) - 1 ? '1px solid var(--line)' : 'none', paddingBottom: '12px' }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>
                      {faq.question}
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                      {faq.answer}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Policy Links */}
            <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
                Legal &amp; Policy References
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <Link to="/terms" style={{ color: 'var(--brass, #10B981)', textDecoration: 'none', fontWeight: 500 }}>→ Terms of Use</Link>
                <Link to="/privacy" style={{ color: 'var(--brass, #10B981)', textDecoration: 'none', fontWeight: 500 }}>→ Privacy Policy</Link>
                <Link to="/refund" style={{ color: 'var(--brass, #10B981)', textDecoration: 'none', fontWeight: 500 }}>→ Refund Policy</Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 4. Footer */}
      <footer style={{ background: '#0B0F17', color: '#94A3B8', padding: '40px 24px 24px', borderTop: '1px solid var(--line)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', fontSize: '12.5px' }}>
          <div>
            © 2026 <strong>{cfg.brandName || 'Propithub'}</strong>. Owned and Developed by <strong>{cfg.footerCompanyName || 'NEBZA Technologies Private Limited'}</strong>. All Rights Reserved.
          </div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <Link to="/terms" style={{ color: '#94A3B8', textDecoration: 'none' }}>Terms of Use</Link>
            <span>•</span>
            <Link to="/privacy" style={{ color: '#94A3B8', textDecoration: 'none' }}>Privacy Policy</Link>
            <span>•</span>
            <Link to="/refund" style={{ color: '#94A3B8', textDecoration: 'none' }}>Refund Policy</Link>
            <span>•</span>
            <Link to="/contact" style={{ color: '#10B981', textDecoration: 'none' }}>Contact Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
