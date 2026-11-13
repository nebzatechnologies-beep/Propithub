const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'propithub' });
const db = admin.firestore();
(async () => {
  const since = new Date(Date.now() - 6 * 3600e3).toISOString();
  for (const role of ['manager', 'staff']) {
    const s = await db.collection('users').where('role', '==', role).get();
    const rows = s.docs.map(d => d.data()).filter(u => (u.createdAt || '') >= since)
      .map(u => ({ id: u.id, email: u.email, role: u.role, ownerId: u.ownerId, inviteSent: u.inviteSent, hasTempPw: !!u.tempPassword, createdAt: u.createdAt }));
    console.log('USERS', role, JSON.stringify(rows));
  }
  const c = await db.collection('userClaimRequests').orderBy('requestedAt', 'desc').limit(6).get();
  console.log('CLAIMS', JSON.stringify(c.docs.map(d => { const x = d.data(); return { id: d.id, role: x.role, processed: x.processed, requestedAt: x.requestedAt, hasPw: !!x.tempPassword }; })));
  try {
    const l = await db.collection('communicationLogs').where('type', '==', 'ACCOUNT_INVITE_DISPATCHED').limit(20).get();
    console.log('INVITE_LOGS', JSON.stringify(l.docs.map(d => d.data()).filter(x => (x.createdAt || '') >= since || true).slice(-6).map(x => ({ title: x.title, createdAt: x.createdAt, status: x.deliveryStatus, to: x.recipientContact }))));
  } catch (e) { console.log('LOGS ERR', e.message); }
  const cc = await db.collection('cashClaims').get();
  console.log('CASHCLAIMS', JSON.stringify(cc.docs.map(d => ({ id: d.id, amount: d.data().amount, unit: d.data().unit, status: d.data().status }))));
})().catch(e => { console.log('ERR', e.message); process.exit(0); });
