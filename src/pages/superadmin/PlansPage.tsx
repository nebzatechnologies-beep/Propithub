import React, { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useCurrency } from '../../context/CurrencyContext';
import { Plan } from '../../types';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { doc, setDoc, deleteDoc, getDocs, collection } from 'firebase/firestore';
import { saveTrialPolicyCache, INITIAL_STATE, loadState, saveState } from '../../lib/store';
import { ButtonProcessing } from '../../components/common/Spinner';

export const PlansPage: React.FC = () => {
  const { state, updateState, showToast } = useAppData();
  const { viewCurrency, convert, format } = useCurrency();
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isNewPlanOpen, setIsNewPlanOpen] = useState(false);
  const [planToRetire, setPlanToRetire] = useState<Plan | null>(null);
  const [customTrialInput, setCustomTrialInput] = useState<string>('');
  const [customDiscountInput, setCustomDiscountInput] = useState<string>('');
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [isRetiring, setIsRetiring] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const getDynamicOwnersCount = (planName: string, fallback: number = 0) => {
    const ownerUsers = (state.users || []).filter((u) => u.role === 'owner');
    if (ownerUsers.length === 0) return fallback;
    return ownerUsers.filter((u) => {
      const uPlan = u.plan || state.ownerSettings?.[u.id]?.planName || state.ownerSettings?.[u.id]?.planId || '';
      return uPlan.toLowerCase() === planName.toLowerCase();
    }).length;
  };
  const [newPlanForm, setNewPlanForm] = useState({
    name: '',
    price: 99,
    properties: 10,
    units: 100,
    tenants: 100,
    managers: 3,
    staff: 10,
    isPopular: false,
  });

  const updateAnnualDiscount = (discount: number) => {
    const validDiscount = Math.min(90, Math.max(0, discount));
    saveTrialPolicyCache(state.defaultTrialDays ?? 14, validDiscount);

    updateState((prev) => ({
      ...prev,
      annualDiscountPercent: validDiscount,
    }));

    if (isFirebaseConfigured) {
      setDoc(
        doc(db, 'platformConfig', 'trialPolicy'),
        { annualDiscountPercent: validDiscount, updatedAt: new Date().toISOString() },
        { merge: true }
      ).catch((err) => console.warn('Firestore trialPolicy annualDiscount write:', err));
    }
    showToast(
      validDiscount > 0
        ? `Annual subscription discount dynamically set to ${validDiscount}%.`
        : 'Annual discount disabled (Standard 12x monthly price).'
    );
  };

  const updateTrialDays = (days: number) => {
    const validDays = Math.max(0, days);
    saveTrialPolicyCache(validDays);

    updateState((prev) => {
      let nextOwnerSettings = prev.ownerSettings;
      if (validDays === 0) {
        nextOwnerSettings = { ...prev.ownerSettings };
        Object.keys(nextOwnerSettings).forEach((ownerKey) => {
          const s = nextOwnerSettings[ownerKey];
          if (s && s.planStatus === 'trialing' && !s.subscriptionEndsAt) {
            nextOwnerSettings[ownerKey] = {
              ...s,
              planStatus: 'expired',
              trialEndsAt: null,
            };
          }
        });
      }
      return {
        ...prev,
        defaultTrialDays: validDays,
        ownerSettings: nextOwnerSettings,
      };
    });

    if (isFirebaseConfigured) {
      setDoc(
        doc(db, 'platformConfig', 'trialPolicy'),
        { defaultTrialDays: validDays, updatedAt: new Date().toISOString() },
        { merge: true }
      ).catch((err) => console.warn('Firestore trialPolicy write:', err));

      if (validDays === 0) {
        getDocs(collection(db, 'owners'))
          .then((snap) => {
            snap.forEach((d) => {
              const data = d.data();
              if (data?.planStatus === 'trialing' && !data?.subscriptionEndsAt) {
                setDoc(doc(db, 'owners', d.id), { planStatus: 'expired', trialEndsAt: null }, { merge: true }).catch(console.warn);
              }
            });
          })
          .catch(console.warn);
      }
    }
    showToast(
      validDays > 0
        ? `Global free trial policy dynamically set to ${validDays} days.`
        : 'Initial free trial disabled. New owners must subscribe immediately.'
    );
  };

  const handleSavePlan = async () => {
    if (!editingPlan) return;
    setIsSavingPlan(true);
    try {
      const planToSave: Plan = {
        ...editingPlan,
        isTrialOnly: editingPlan.id === 'free_trial' ? true : editingPlan.isTrialOnly,
        price: editingPlan.id === 'free_trial' ? 0 : Number(editingPlan.price || 0),
        properties: Number(editingPlan.properties || 1),
        units: Number(editingPlan.units || 1),
        tenants: Number(editingPlan.tenants || 1),
        managers: Number(editingPlan.managers || 0),
        staff: Number(editingPlan.staff || 0),
        isPopular: editingPlan.id === 'free_trial' ? false : !!editingPlan.isPopular,
      };

      // 1. Immediately update AppDataContext state
      updateState((prev) => {
        const exists = prev.plans.some((p) => p.id === planToSave.id);
        const nextPlans = exists
          ? prev.plans.map((p) => {
              if (p.id === planToSave.id) return planToSave;
              if (planToSave.isPopular) return { ...p, isPopular: false };
              return p;
            })
          : [...prev.plans.map((p) => (planToSave.isPopular ? { ...p, isPopular: false } : p)), planToSave];
        return {
          ...prev,
          plans: nextPlans,
        };
      });

      // 2. Persist directly to localStorage so other contexts see it immediately
      try {
        const currentPersisted = loadState();
        const existsInStore = (currentPersisted.plans || []).some((p: Plan) => p.id === planToSave.id);
        const nextPlans = existsInStore
          ? currentPersisted.plans.map((p: Plan) => {
              if (p.id === planToSave.id) return planToSave;
              if (planToSave.isPopular) return { ...p, isPopular: false };
              return p;
            })
          : [...(currentPersisted.plans || []).map((p: Plan) => (planToSave.isPopular ? { ...p, isPopular: false } : p)), planToSave];
        saveState({
          ...currentPersisted,
          plans: nextPlans,
        });
      } catch (e) {
        console.warn('LocalStorage plan cache sync warning:', e);
      }

      // 3. Persist to Firestore (clean payload to eliminate any undefined values)
      if (isFirebaseConfigured) {
        const cleanPayload = JSON.parse(JSON.stringify(planToSave));
        setDoc(doc(db, 'plans', planToSave.id), cleanPayload, { merge: true }).catch((err) =>
          console.warn('Firestore plan sync error:', err)
        );

        if (planToSave.isPopular) {
          state.plans.forEach((p) => {
            if (p.id !== planToSave.id && p.id !== 'free_trial' && !p.isTrialOnly) {
              const fullUnpop = { ...p, isPopular: false };
              setDoc(doc(db, 'plans', p.id), fullUnpop, { merge: true }).catch(console.warn);
            }
          });
        }

        if (planToSave.id === 'free_trial' || planToSave.isTrialOnly) {
          setDoc(
            doc(db, 'platformConfig', 'trialPolicy'),
            { freeTrialLimits: cleanPayload, updatedAt: new Date().toISOString() },
            { merge: true }
          ).catch((err) => console.warn('Firestore trialPolicy limits write error:', err));
        }
      }

      showToast(`Plan "${planToSave.name}" updated successfully.`);
    } catch (err: any) {
      console.error('Plan save error:', err);
      showToast('Failed to save plan: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSavingPlan(false);
      setEditingPlan(null);
    }
  };

  const handleTogglePopular = async (planId: string) => {
    const target = state.plans.find((p) => p.id === planId);
    if (!target) return;
    const newStatus = !target.isPopular;

    const updatedPlans = state.plans.map((p) => {
      if (p.id === planId) {
        return { ...p, isPopular: newStatus };
      }
      if (newStatus) {
        return { ...p, isPopular: false };
      }
      return p;
    });

    updateState((prev) => ({
      ...prev,
      plans: updatedPlans,
    }));

    try {
      const currentPersisted = loadState();
      saveState({
        ...currentPersisted,
        plans: updatedPlans,
      });
    } catch (e) {
      console.warn('LocalStorage plan cache sync warning:', e);
    }

    if (isFirebaseConfigured) {
      for (const p of updatedPlans) {
        if (!p.isTrialOnly && p.id !== 'free_trial') {
          const cleanPayload = JSON.parse(JSON.stringify(p));
          setDoc(doc(db, 'plans', p.id), cleanPayload, { merge: true }).catch(console.warn);
        }
      }
    }

    showToast(
      newStatus
        ? `"${target.name}" is now set as the Popular Plan on the landing page.`
        : `"${target.name}" is no longer marked as popular.`
    );
  };

  const handleCreatePlan = async () => {
    setIsCreatingPlan(true);
    await new Promise((r) => setTimeout(r, 450));
    const id = `plan_${Date.now()}`;
    const newPlan: Plan = {
      id,
      name: newPlanForm.name || 'Custom Tier',
      price: newPlanForm.price,
      properties: newPlanForm.properties,
      units: newPlanForm.units,
      tenants: newPlanForm.tenants,
      managers: newPlanForm.managers,
      staff: newPlanForm.staff,
      owners: 0,
      isPopular: !!newPlanForm.isPopular,
    };
    updateState((prev) => ({
      ...prev,
      plans: [
        ...prev.plans.map((p) => (newPlan.isPopular ? { ...p, isPopular: false } : p)),
        newPlan,
      ],
    }));
    if (isFirebaseConfigured) {
      await setDoc(doc(db, 'plans', newPlan.id), newPlan, { merge: true }).catch((err) =>
        console.warn('Firestore plan create error:', err)
      );
      if (newPlan.isPopular) {
        state.plans.forEach((p) => {
          if (p.id !== 'free_trial' && !p.isTrialOnly) {
            const fullUnpop = { ...p, isPopular: false };
            setDoc(doc(db, 'plans', p.id), fullUnpop, { merge: true }).catch(console.warn);
          }
        });
      }
    }
    setIsCreatingPlan(false);
    setIsNewPlanOpen(false);
    setNewPlanForm({
      name: '',
      price: 99,
      properties: 10,
      units: 100,
      tenants: 100,
      managers: 3,
      staff: 10,
      isPopular: false,
    });
    showToast(`New plan "${newPlan.name}" created.`);
  };

  const handleSeedDefaultPlans = async () => {
    setIsSeeding(true);
    try {
      const defaultPlans = INITIAL_STATE.plans;
      updateState((prev) => ({
        ...prev,
        plans: defaultPlans,
      }));
      if (isFirebaseConfigured) {
        for (const plan of defaultPlans) {
          await setDoc(doc(db, 'plans', plan.id), plan, { merge: true });
        }
      }
      showToast('Default subscription plans seeded to database successfully.');
    } catch (err: any) {
      showToast('Failed to seed default plans: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSeeding(false);
    }
  };

  const freeTrialPlan: Plan = state.plans.find((p) => p.isTrialOnly || p.id === 'free_trial') || {
    id: 'free_trial',
    name: 'Free Trial',
    price: 0,
    properties: 1,
    units: 3,
    tenants: 3,
    managers: 0,
    staff: 1,
    owners: 0,
    isTrialOnly: true,
  };

  const commercialPlans = state.plans
    .filter((p) => !p.isTrialOnly && p.id !== 'free_trial')
    .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));

  return (
    <div>
      <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3>Subscription Plans</h3>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {commercialPlans.length === 0 && (
            <button
              type="button"
              className={`btn secondary btn-mobile-full ${isSeeding ? 'btn-processing' : ''}`}
              disabled={isSeeding}
              onClick={handleSeedDefaultPlans}
            >
              <ButtonProcessing
                loading={isSeeding}
                loadingText="Seeding Plans..."
                defaultText="Seed Default Plans"
              />
            </button>
          )}
          <button
            type="button"
            className="btn brass btn-mobile-full"
            onClick={() => setIsNewPlanOpen(true)}
          >
            + Create New Plan
          </button>
        </div>
      </div>

      {/* Global Free Trial Policy & Dedicated Free Trial Tier (Admin Only) */}
      <div className="panel" style={{ marginBottom: '24px', border: '1px solid var(--primary-border, rgba(47, 93, 80, 0.25))' }}>
        <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', background: 'rgba(47, 93, 80, 0.04)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>Free Trial Tier &amp; Onboarding Policy</h3>
              <span className="badge amber" style={{ fontSize: '11px' }}>Admin Only • Hidden from Public &amp; Owners</span>
            </div>
            <div className="hint" style={{ marginTop: '2px' }}>
              Admin-governed onboarding tier. Configures trial duration and resource quotas for new owners during their trial period.
            </div>
          </div>
          <span className={`badge ${state.defaultTrialDays > 0 ? 'green' : 'amber'}`}>
            {state.defaultTrialDays > 0 ? `${state.defaultTrialDays}-Day Free Trial Active` : 'Free Trial Disabled (Instant Purchase Required)'}
          </span>
        </div>
        <div className="panel-body">
          {/* Top Row: Duration Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ flex: '1 1 360px', maxWidth: '720px' }}>
              <div style={{ fontWeight: 600, fontSize: '13.5px', marginBottom: '4px' }}>
                Default Initial Free Trial Duration
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: 1.4 }}>
                When set to <b>No Trial (0d)</b>, new owners must buy a subscription plan immediately before accessing the platform. When set to <b>7, 14, or 30 days</b>, new owners receive an active free trial with the limits configured below.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {[0, 7, 14, 30].map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`btn ${state.defaultTrialDays === days ? 'brass' : 'secondary'} small`}
                  onClick={() => updateTrialDays(days)}
                >
                  {days === 0 ? 'No Trial (0d)' : `${days} Days`}
                </button>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <input
                  type="number"
                  min="0"
                  max="365"
                  placeholder="Custom days"
                  value={customTrialInput}
                  onChange={(e) => setCustomTrialInput(e.target.value)}
                  style={{ width: '90px', padding: '5px 8px', fontSize: '12px' }}
                />
                <button
                  type="button"
                  className="btn secondary small"
                  disabled={!customTrialInput || isNaN(Number(customTrialInput))}
                  onClick={() => {
                    const val = parseInt(customTrialInput, 10);
                    if (!isNaN(val) && val >= 0) {
                      updateTrialDays(val);
                      setCustomTrialInput('');
                    }
                  }}
                >
                  Set
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Row: Free Trial Plan Quotas */}
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <b style={{ fontSize: '13.5px', color: 'var(--ink)' }}>Free Trial Resource Limits (Admin Governed)</b>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                  Enforced limits on all onboarding trial accounts before upgrading to a commercial tier.
                </div>
              </div>
              <button
                type="button"
                className="btn brass small"
                onClick={() => {
                  setIsSavingPlan(false);
                  setEditingPlan(freeTrialPlan);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
              >
                ✏️ Edit Free Trial Limits
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
              <div style={{ padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 600 }}>MAX PROPERTIES</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)', marginTop: '2px' }}>
                  {freeTrialPlan.properties >= 999 ? 'Unlimited' : freeTrialPlan.properties}
                </div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 600 }}>MAX UNITS</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)', marginTop: '2px' }}>
                  {freeTrialPlan.units >= 9999 ? 'Unlimited' : freeTrialPlan.units}
                </div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 600 }}>MAX TENANTS</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)', marginTop: '2px' }}>
                  {freeTrialPlan.tenants >= 9999 ? 'Unlimited' : freeTrialPlan.tenants}
                </div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 600 }}>MAX MANAGERS</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)', marginTop: '2px' }}>
                  {freeTrialPlan.managers}
                </div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 600 }}>MAX STAFF</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)', marginTop: '2px' }}>
                  {freeTrialPlan.staff}
                </div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '8px' }}>
                <div style={{ fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 600 }}>TRIAL PRICE</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ledger)', marginTop: '2px' }}>
                  $0 / mo
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Annual Subscription Billing & Discount Policy */}
      <div className="panel" style={{ marginBottom: '24px', border: '1px solid var(--primary-border, rgba(47, 93, 80, 0.25))' }}>
        <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', background: 'rgba(47, 93, 80, 0.04)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>Annual Subscription Discount Policy</h3>
              <span className="badge blue" style={{ fontSize: '11px' }}>Global Pricing Rule</span>
            </div>
            <div className="hint" style={{ marginTop: '2px' }}>
              Dynamic percentage discount applied when property owners choose an annual billing cycle on Web &amp; Mobile apps.
            </div>
          </div>
          <span className={`badge ${(state.annualDiscountPercent ?? 20) > 0 ? 'green' : 'secondary'}`}>
            {(state.annualDiscountPercent ?? 20) > 0
              ? `${state.annualDiscountPercent ?? 20}% Annual Savings Active`
              : '0% (Standard 12x Price)'}
          </span>
        </div>
        <div className="panel-body">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ flex: '1 1 360px', maxWidth: '720px' }}>
              <div style={{ fontWeight: 600, fontSize: '13.5px', marginBottom: '4px' }}>
                Annual Billing Cycle Savings Rate
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: 1.4 }}>
                Currently: <b>{state.annualDiscountPercent ?? 20}% off</b> standard monthly rate. 
                {(state.annualDiscountPercent ?? 20) > 0 ? (
                  <> Owners choosing Annual pay for 12 months with a <b>{state.annualDiscountPercent ?? 20}%</b> reduction (e.g., $100/mo becomes <b>${Math.round(100 * 12 * (100 - (state.annualDiscountPercent ?? 20)) / 100)}/yr</b>).</>
                ) : (
                  <> Owners pay the full annual sum (12 × monthly price) with no discount applied.</>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {[0, 10, 15, 20, 25, 30].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={`btn ${(state.annualDiscountPercent ?? 20) === pct ? 'brass' : 'secondary'} small`}
                  onClick={() => updateAnnualDiscount(pct)}
                >
                  {pct === 0 ? '0% (None)' : `${pct}%`}
                </button>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <input
                  type="number"
                  min="0"
                  max="90"
                  placeholder="Custom %"
                  value={customDiscountInput}
                  onChange={(e) => setCustomDiscountInput(e.target.value)}
                  style={{ width: '90px', padding: '5px 8px', fontSize: '12px' }}
                />
                <button
                  type="button"
                  className="btn secondary small"
                  disabled={!customDiscountInput || isNaN(Number(customDiscountInput))}
                  onClick={() => {
                    const val = parseInt(customDiscountInput, 10);
                    if (!isNaN(val) && val >= 0) {
                      updateAnnualDiscount(val);
                      setCustomDiscountInput('');
                    }
                  }}
                >
                  Set
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Commercial Plans Header */}
      <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 style={{ margin: 0 }}>Public Commercial Plans ({commercialPlans.length})</h3>
          <div className="hint" style={{ fontSize: '12px', marginTop: '2px' }}>
            These subscription tiers are published on the public landing page and available to owners for commercial upgrades.
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {commercialPlans.map((p) => (
          <div
            key={p.id}
            className="panel"
            style={{
              position: 'relative',
              border: p.isPopular ? '2px solid #0D9488' : undefined,
              boxShadow: p.isPopular ? '0 4px 20px rgba(13, 148, 136, 0.12)' : undefined,
            }}
          >
            {p.isPopular && (
              <div
                style={{
                  position: 'absolute',
                  top: '-12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#0D9488',
                  color: '#FFFFFF',
                  padding: '3px 14px',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                  whiteSpace: 'nowrap',
                  zIndex: 2,
                }}
              >
                ★ Popular on Landing Page
              </div>
            )}
            <div className="panel-head" style={{ paddingTop: p.isPopular ? '16px' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0 }}>{p.name}</h3>
                {p.isPopular && (
                  <span className="badge green" style={{ fontSize: '10.5px', fontWeight: 700 }}>
                    Popular
                  </span>
                )}
              </div>
              <span className="badge grey">{getDynamicOwnersCount(p.name, p.owners)} owners</span>
            </div>
            <div className="panel-body">
              <div>
                <div style={{ fontFamily: 'Fraunces', fontSize: '28px', fontWeight: 600 }}>
                  {format(convert(p.price, 'USD', viewCurrency), viewCurrency)}
                  <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--ink-soft)' }}>
                    {' '}/ month
                  </span>
                </div>
              </div>

              <div className="divider" />

              <div className="kv">
                <span className="k">Max Properties:</span>
                <b>{p.properties >= 999 ? 'Unlimited' : p.properties}</b>
              </div>
              <div className="kv">
                <span className="k">Max Units:</span>
                <b>{p.units >= 9999 ? 'Unlimited' : p.units}</b>
              </div>
              <div className="kv">
                <span className="k">Max Tenants:</span>
                <b>{p.tenants >= 9999 ? 'Unlimited' : p.tenants}</b>
              </div>
              <div className="kv">
                <span className="k">Max Managers (Owner Delegated):</span>
                <b>{p.managers}</b>
              </div>
              <div className="kv">
                <span className="k">Max Maintenance Staff:</span>
                <b>{p.staff}</b>
              </div>

              {/* Popular toggle action */}
              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px dashed var(--line)' }}>
                <button
                  type="button"
                  className={`btn small btn-mobile-full ${p.isPopular ? 'brass' : 'secondary'}`}
                  style={{
                    width: '100%',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontWeight: 600,
                    fontSize: '12px',
                  }}
                  onClick={() => handleTogglePopular(p.id)}
                  title={p.isPopular ? 'Click to unmark as popular' : 'Set as the highlighted popular tier on landing page'}
                >
                  {p.isPopular ? '★ Popular on Landing Page (Click to unfeature)' : '☆ Set as Popular Plan (Landing Page)'}
                </button>
              </div>

              <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn secondary small btn-mobile-full"
                  style={{ flex: '1 1 auto', cursor: 'pointer' }}
                  onClick={() => {
                    setIsSavingPlan(false);
                    setEditingPlan(p);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn danger small btn-mobile-full"
                  style={{ flex: '1 1 auto' }}
                  onClick={() => {
                    const liveCount = getDynamicOwnersCount(p.name, p.owners);
                    if (liveCount > 0) {
                      showToast(`Can't retire "${p.name}" — ${liveCount} owner(s) are still active on it.`);
                      return;
                    }
                    setPlanToRetire(p);
                  }}
                >
                  Retire
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Plan Modal */}
      {editingPlan && (
        <div className="modal-backdrop" onClick={() => { setIsSavingPlan(false); setEditingPlan(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editingPlan.id === 'free_trial' || editingPlan.isTrialOnly ? 'Edit Free Trial Onboarding Limits' : `Edit Plan: ${editingPlan.name}`}</h3>
              <button type="button" className="modal-close" onClick={() => { setIsSavingPlan(false); setEditingPlan(null); }}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              {editingPlan.id === 'free_trial' || editingPlan.isTrialOnly ? (
                <div className="field">
                  <label>Plan Price</label>
                  <div style={{ padding: '8px 12px', background: 'var(--surface-sunken)', borderRadius: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                    $0 / month (Internal Free Trial Tier — No Commercial Billing)
                  </div>
                  <p className="hint" style={{ marginTop: '4px' }}>
                    This tier is strictly for onboarding trials. It is never displayed on the public landing page or owner switchers.
                  </p>
                </div>
              ) : (
                <div className="field">
                  <label>Price ($ / month)</label>
                  <input
                    type="number"
                    min="0"
                    value={editingPlan.price === 0 ? '' : editingPlan.price}
                    placeholder="0"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setEditingPlan({ ...editingPlan, price: cleaned === '' ? 0 : Number(cleaned) });
                    }}
                  />
                </div>
              )}
              <div className="row">
                <div className="field">
                  <label>Max Properties</label>
                  <input
                    type="number"
                    min="0"
                    value={editingPlan.properties === 0 ? '' : editingPlan.properties}
                    placeholder="0"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setEditingPlan({ ...editingPlan, properties: cleaned === '' ? 0 : Number(cleaned) });
                    }}
                  />
                </div>
                <div className="field">
                  <label>Max Units</label>
                  <input
                    type="number"
                    min="0"
                    value={editingPlan.units === 0 ? '' : editingPlan.units}
                    placeholder="0"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setEditingPlan({ ...editingPlan, units: cleaned === '' ? 0 : Number(cleaned) });
                    }}
                  />
                </div>
              </div>
              <div className="field">
                <label>Max Tenants</label>
                <input
                  type="number"
                  min="0"
                  value={editingPlan.tenants === 0 ? '' : editingPlan.tenants}
                  placeholder="0"
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                    setEditingPlan({ ...editingPlan, tenants: cleaned === '' ? 0 : Number(cleaned) });
                  }}
                />
              </div>
              <div className="row">
                <div className="field">
                  <label>Max Property Managers</label>
                  <input
                    type="number"
                    min="0"
                    value={editingPlan.managers === 0 ? '' : editingPlan.managers}
                    placeholder="0"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setEditingPlan({ ...editingPlan, managers: cleaned === '' ? 0 : Number(cleaned) });
                    }}
                  />
                </div>
                <div className="field">
                  <label>Max Maintenance Staff</label>
                  <input
                    type="number"
                    min="0"
                    value={editingPlan.staff === 0 ? '' : editingPlan.staff}
                    placeholder="0"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setEditingPlan({ ...editingPlan, staff: cleaned === '' ? 0 : Number(cleaned) });
                    }}
                  />
                </div>
              </div>

              {!(editingPlan.id === 'free_trial' || editingPlan.isTrialOnly) && (
                <div
                  style={{
                    marginTop: '14px',
                    padding: '12px 14px',
                    background: 'var(--surface-sunken)',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                    <div>
                      <b style={{ color: 'var(--ink)', fontSize: '13px' }}>★ Set as Popular Plan (Landing Page)</b>
                      <div className="hint" style={{ marginTop: '2px', fontSize: '12px' }}>
                        Highlights this tier with the "Most Popular" badge and primary styling on the public landing page.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={!!editingPlan.isPopular}
                      onChange={(e) => setEditingPlan({ ...editingPlan, isPopular: e.target.checked })}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                style={{ cursor: 'pointer' }}
                disabled={isSavingPlan}
                onClick={() => {
                  setIsSavingPlan(false);
                  setEditingPlan(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn brass btn-mobile-full ${isSavingPlan ? 'btn-processing' : ''}`}
                style={{
                  cursor: isSavingPlan ? 'wait' : 'pointer',
                  minWidth: '150px',
                }}
                disabled={isSavingPlan}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSavePlan();
                }}
              >
                <ButtonProcessing
                  loading={isSavingPlan}
                  loadingText="Saving Plan..."
                  defaultText="Save Plan Changes"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Plan Modal */}
      {isNewPlanOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <h3>Create New Subscription Plan</h3>
              <button type="button" className="modal-close" onClick={() => setIsNewPlanOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Plan Name</label>
                <input
                  type="text"
                  placeholder="e.g. Agency Pro"
                  value={newPlanForm.name}
                  onChange={(e) => setNewPlanForm({ ...newPlanForm, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Price ($ / mo)</label>
                <input
                  type="number"
                  min="0"
                  value={newPlanForm.price === 0 ? '' : newPlanForm.price}
                  placeholder="0"
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                    setNewPlanForm({ ...newPlanForm, price: cleaned === '' ? 0 : Number(cleaned) });
                  }}
                />
              </div>
              <div className="row">
                <div className="field">
                  <label>Max Properties</label>
                  <input
                    type="number"
                    min="0"
                    value={newPlanForm.properties === 0 ? '' : newPlanForm.properties}
                    placeholder="0"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setNewPlanForm({ ...newPlanForm, properties: cleaned === '' ? 0 : Number(cleaned) });
                    }}
                  />
                </div>
                <div className="field">
                  <label>Max Units</label>
                  <input
                    type="number"
                    min="0"
                    value={newPlanForm.units === 0 ? '' : newPlanForm.units}
                    placeholder="0"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setNewPlanForm({ ...newPlanForm, units: cleaned === '' ? 0 : Number(cleaned) });
                    }}
                  />
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label>Max Managers</label>
                  <input
                    type="number"
                    min="0"
                    value={newPlanForm.managers === 0 ? '' : newPlanForm.managers}
                    placeholder="0"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setNewPlanForm({ ...newPlanForm, managers: cleaned === '' ? 0 : Number(cleaned) });
                    }}
                  />
                </div>
                <div className="field">
                  <label>Max Staff</label>
                  <input
                    type="number"
                    min="0"
                    value={newPlanForm.staff === 0 ? '' : newPlanForm.staff}
                    placeholder="0"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setNewPlanForm({ ...newPlanForm, staff: cleaned === '' ? 0 : Number(cleaned) });
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  marginTop: '14px',
                  padding: '12px 14px',
                  background: 'var(--surface-sunken)',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                  <div>
                    <b style={{ color: 'var(--ink)', fontSize: '13px' }}>★ Set as Popular Plan (Landing Page)</b>
                    <div className="hint" style={{ marginTop: '2px', fontSize: '12px' }}>
                      Highlights this tier with the "Most Popular" ribbon on the public landing page.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={newPlanForm.isPopular}
                    onChange={(e) => setNewPlanForm({ ...newPlanForm, isPopular: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </label>
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" className="btn secondary btn-mobile-full" disabled={isCreatingPlan} onClick={() => setIsNewPlanOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn brass btn-mobile-full ${isCreatingPlan ? 'btn-processing' : ''}`}
                disabled={isCreatingPlan}
                onClick={handleCreatePlan}
              >
                <ButtonProcessing
                  loading={isCreatingPlan}
                  loadingText="Creating..."
                  defaultText="Create Plan"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Retire Plan Confirmation Modal */}
      {planToRetire && (
        <div className="modal-backdrop" onClick={() => setPlanToRetire(null)}>
          <div className="modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Confirm Plan Retirement</h3>
              <button type="button" className="btn secondary small" onClick={() => setPlanToRetire(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to retire <b>"{planToRetire.name}"</b> (${planToRetire.price}/month)?
              </p>
              <p className="hint" style={{ marginTop: '8px' }}>
                This plan currently has 0 active subscribers. Once retired, it will no longer be available for selection by property owners.
              </p>
            </div>
            <div
              className="modal-foot"
              style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', padding: '14px 20px', borderTop: '1px solid var(--line)' }}
            >
              <button type="button" className="btn secondary btn-mobile-full" disabled={isRetiring} onClick={() => setPlanToRetire(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn danger btn-mobile-full ${isRetiring ? 'btn-processing' : ''}`}
                disabled={isRetiring}
                onClick={async () => {
                  setIsRetiring(true);
                  await new Promise((r) => setTimeout(r, 450));
                  updateState((prev) => ({
                    ...prev,
                    plans: prev.plans.filter((x) => x.id !== planToRetire.id),
                  }));
                  if (isFirebaseConfigured) {
                    await deleteDoc(doc(db, 'plans', planToRetire.id)).catch((err) =>
                      console.warn('Firestore plan delete error:', err)
                    );
                  }
                  setIsRetiring(false);
                  showToast(`Plan "${planToRetire.name}" retired successfully.`);
                  setPlanToRetire(null);
                }}
              >
                <ButtonProcessing
                  loading={isRetiring}
                  loadingText="Retiring..."
                  defaultText="Confirm Retire"
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
