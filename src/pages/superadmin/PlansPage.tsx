import React, { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useCurrency } from '../../context/CurrencyContext';
import { Plan, ListingBoostPlan } from '../../types';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { doc, setDoc, deleteDoc, getDocs, collection } from 'firebase/firestore';
import { saveTrialPolicyCache, INITIAL_STATE, loadState, saveState, DEFAULT_BOOST_PLANS } from '../../lib/store';
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

  // Listing Boost Plans (3 Standalone Tiers - Admin controls Days and Price)
  const [boostPlansState, setBoostPlansState] = useState<ListingBoostPlan[]>(() => {
    return state.boostPlans && state.boostPlans.length > 0 ? state.boostPlans : DEFAULT_BOOST_PLANS;
  });
  const [isSavingBoostPlans, setIsSavingBoostPlans] = useState(false);

  React.useEffect(() => {
    if (state.boostPlans && state.boostPlans.length > 0) {
      const nextBoostPlans = state.boostPlans;
      setBoostPlansState((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(nextBoostPlans)) {
          return prev;
        }
        return nextBoostPlans;
      });
    }
  }, [state.boostPlans]);

  const handleUpdateBoostPlan = (id: string, updates: Partial<ListingBoostPlan>) => {
    setBoostPlansState((prev) =>
      prev.map((bp) => (bp.id === id ? { ...bp, ...updates } : bp))
    );
  };

  const handleSaveBoostPlans = async () => {
    setIsSavingBoostPlans(true);
    try {
      updateState((prev) => ({
        ...prev,
        boostPlans: boostPlansState,
      }));
      const currentPersisted = loadState();
      saveState({
        ...currentPersisted,
        boostPlans: boostPlansState,
      });
      if (isFirebaseConfigured) {
        for (const bp of boostPlansState) {
          await setDoc(doc(db, 'listingBoostPlans', bp.id), bp, { merge: true });
        }
      }
      showToast('Listing Boost Plans updated successfully!');
    } catch (err: any) {
      console.error('Failed to save boost plans:', err);
      showToast('Failed to save boost plans: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSavingBoostPlans(false);
    }
  };

  const handleResetBoostPlansToDefaults = () => {
    setBoostPlansState(DEFAULT_BOOST_PLANS);
    showToast('Reset to default prices (5, 55, 550). Click "Save Boost Plans" to apply.');
  };

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
      <div className="panel-head" style={{ border: 'none', padding: '0 0 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <h3 style={{ margin: 0 }}>Subscription Plans</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {commercialPlans.length === 0 && (
            <button
              type="button"
              className={`btn secondary small btn-mobile-full ${isSeeding ? 'btn-processing' : ''}`}
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
            className="btn brass small btn-mobile-full"
            onClick={() => setIsNewPlanOpen(true)}
          >
            + Create Plan
          </button>
        </div>
      </div>

      {/* Compact Side-by-Side Global Policies */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
          gap: '14px',
          marginBottom: '22px',
        }}
      >
        {/* Card 1: Free Trial Policy */}
        <div className="panel" style={{ margin: 0, minWidth: 0 }}>
          <div className="panel-body" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <b style={{ fontSize: '13.5px', color: 'var(--ink)' }}>Free Trial Policy</b>
                <span className={`badge ${state.defaultTrialDays > 0 ? 'green' : 'amber'}`} style={{ fontSize: '11px' }}>
                  {state.defaultTrialDays > 0 ? `${state.defaultTrialDays}d Active` : 'Disabled'}
                </span>
              </div>
              <button
                type="button"
                className="btn secondary small"
                style={{ padding: '4px 10px', fontSize: '11.5px', cursor: 'pointer' }}
                onClick={() => {
                  setIsSavingPlan(false);
                  setEditingPlan(freeTrialPlan);
                }}
              >
                Edit Quotas
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {[0, 7, 14, 30].map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`btn ${state.defaultTrialDays === days ? 'brass' : 'secondary'} small`}
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                  onClick={() => updateTrialDays(days)}
                >
                  {days === 0 ? 'Off' : `${days}d`}
                </button>
              ))}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                <input
                  type="number"
                  min="0"
                  max="365"
                  placeholder="Days"
                  value={customTrialInput}
                  onChange={(e) => setCustomTrialInput(e.target.value)}
                  style={{ width: '64px', padding: '4px 8px', fontSize: '12px' }}
                />
                <button
                  type="button"
                  className="btn secondary small"
                  style={{ padding: '4px 10px', fontSize: '12px' }}
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

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px 14px',
                padding: '8px 10px',
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'var(--ink-soft)',
              }}
            >
              <span><b style={{ color: 'var(--ink)' }}>{freeTrialPlan.properties >= 999 ? '∞' : freeTrialPlan.properties}</b> Prop</span>
              <span>•</span>
              <span><b style={{ color: 'var(--ink)' }}>{freeTrialPlan.units >= 9999 ? '∞' : freeTrialPlan.units}</b> Units</span>
              <span>•</span>
              <span><b style={{ color: 'var(--ink)' }}>{freeTrialPlan.tenants >= 9999 ? '∞' : freeTrialPlan.tenants}</b> Tenants</span>
              <span>•</span>
              <span><b style={{ color: 'var(--ink)' }}>{freeTrialPlan.managers}</b> Mgr</span>
              <span>•</span>
              <span><b style={{ color: 'var(--ink)' }}>{freeTrialPlan.staff}</b> Staff</span>
            </div>
          </div>
        </div>

        {/* Card 2: Annual Discount Policy */}
        <div className="panel" style={{ margin: 0, minWidth: 0 }}>
          <div className="panel-body" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <b style={{ fontSize: '13.5px', color: 'var(--ink)' }}>Annual Billing Discount</b>
                  <span className={`badge ${(state.annualDiscountPercent ?? 20) > 0 ? 'green' : 'grey'}`} style={{ fontSize: '11px' }}>
                    {(state.annualDiscountPercent ?? 20) > 0 ? `${state.annualDiscountPercent ?? 20}% Off` : '0% Off'}
                  </span>
                </div>
                <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Web &amp; Mobile</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {[0, 10, 15, 20, 25, 30].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    className={`btn ${(state.annualDiscountPercent ?? 20) === pct ? 'brass' : 'secondary'} small`}
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={() => updateAnnualDiscount(pct)}
                  >
                    {pct}%
                  </button>
                ))}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    placeholder="%"
                    value={customDiscountInput}
                    onChange={(e) => setCustomDiscountInput(e.target.value)}
                    style={{ width: '58px', padding: '4px 8px', fontSize: '12px' }}
                  />
                  <button
                    type="button"
                    className="btn secondary small"
                    style={{ padding: '4px 10px', fontSize: '12px' }}
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

            <div
              style={{
                padding: '8px 10px',
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'var(--ink-soft)',
              }}
            >
              {(state.annualDiscountPercent ?? 20) > 0 ? (
                <>Annual cycle applies <b style={{ color: 'var(--ink)' }}>{state.annualDiscountPercent ?? 20}% savings</b> (e.g. $100/mo → <b style={{ color: 'var(--ink)' }}>${Math.round(100 * 12 * (100 - (state.annualDiscountPercent ?? 20)) / 100)}/yr</b>)</>
              ) : (
                <>Standard 12× monthly rate with no annual discount.</>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Commercial Plans Grid */}
      <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b style={{ fontSize: '13.5px', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Commercial Tiers ({commercialPlans.length})
        </b>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '14px' }}>
        {commercialPlans.map((p) => (
          <div
            key={p.id}
            className="panel"
            style={{
              margin: 0,
              minWidth: 0,
              border: p.isPopular ? '1.5px solid #0D9488' : undefined,
            }}
          >
            <div className="panel-body" style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>{p.name}</h3>
                  {p.isPopular && (
                    <span className="badge green" style={{ fontSize: '10.5px', fontWeight: 600 }}>
                      Popular
                    </span>
                  )}
                </div>
                <span className="badge grey" style={{ fontSize: '11px' }}>
                  {getDynamicOwnersCount(p.name, p.owners)} owners
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '14px' }}>
                <span style={{ fontFamily: 'Fraunces', fontSize: '24px', fontWeight: 600, color: 'var(--ink)' }}>
                  {format(convert(p.price, 'USD', viewCurrency), viewCurrency)}
                </span>
                <span style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>/ mo</span>
              </div>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: '10px', marginBottom: '14px', display: 'grid', gap: '6px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Properties</span>
                  <b>{p.properties >= 999 ? 'Unlimited' : p.properties}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Units</span>
                  <b>{p.units >= 9999 ? 'Unlimited' : p.units}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Tenants</span>
                  <b>{p.tenants >= 9999 ? 'Unlimited' : p.tenants}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Managers</span>
                  <b>{p.managers}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Staff</span>
                  <b>{p.staff}</b>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn secondary small"
                  style={{ flex: 1, cursor: 'pointer' }}
                  onClick={() => {
                    setIsSavingPlan(false);
                    setEditingPlan(p);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={`btn ${p.isPopular ? 'brass' : 'secondary'} small`}
                  style={{ cursor: 'pointer', padding: '5px 10px' }}
                  onClick={() => handleTogglePopular(p.id)}
                  title={p.isPopular ? 'Unmark as popular on landing page' : 'Set as popular plan on landing page'}
                >
                  {p.isPopular ? '★ Popular' : '☆ Feature'}
                </button>
                <button
                  type="button"
                  className="btn danger small"
                  style={{ padding: '5px 10px' }}
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

      {/* Listing Boost Plans Management (Admin Controls Days and Amount) */}
      <div style={{ marginTop: '40px', paddingTop: '28px', borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0 }}>🔥 Popular Listing Boost Plans</h3>
              <span className="badge amber" style={{ fontSize: '11px', fontWeight: 700 }}>
                On-Demand Add-Ons
              </span>
            </div>

          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn secondary small"
              onClick={handleResetBoostPlansToDefaults}
              title="Reset default pricing to 5, 55, 550"
            >
              Reset to Defaults ($5, $55, $550)
            </button>
            <button
              type="button"
              className={`btn brass small ${isSavingBoostPlans ? 'btn-processing' : ''}`}
              disabled={isSavingBoostPlans}
              onClick={handleSaveBoostPlans}
            >
              <ButtonProcessing loading={isSavingBoostPlans} loadingText="Saving..." defaultText="Save Boost Plans" />
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 290px), 1fr))', gap: '20px' }}>
          {boostPlansState.map((bp, index) => {
            return (
              <div
                key={bp.id}
                style={{
                  background: 'var(--surface)',
                  border: bp.isPopular ? '2px solid rgba(245, 158, 11, 0.6)' : '1px solid var(--line)',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  position: 'relative',
                  minWidth: 0,
                  boxShadow: bp.isPopular ? '0 4px 16px rgba(245, 158, 11, 0.12)' : 'none',
                }}
              >
                {bp.isPopular && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '-10px',
                      right: '16px',
                      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '2px 10px',
                      borderRadius: '999px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    ★ Recommended Tier
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '18px' }}>{index === 0 ? '⚡' : index === 1 ? '🔥' : '👑'}</span>
                    <span style={{ fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-soft)', fontWeight: 700 }}>
                      Tier {index + 1}
                    </span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontSize: '12px' }}>
                    <input
                      type="checkbox"
                      checked={bp.isActive}
                      onChange={(e) => handleUpdateBoostPlan(bp.id, { isActive: e.target.checked })}
                    />
                    <span style={{ fontWeight: 600, color: bp.isActive ? 'var(--ink)' : 'var(--ink-soft)' }}>
                      {bp.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </label>
                </div>

                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)' }}>Plan Name</label>
                  <input
                    type="text"
                    value={bp.name}
                    placeholder="Plan Name"
                    onChange={(e) => handleUpdateBoostPlan(bp.id, { name: e.target.value })}
                    style={{ width: '100%', fontWeight: 600 }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)' }}>Price (USD $)</label>
                    <input
                      type="number"
                      min="0"
                      value={bp.price === 0 ? '' : bp.price}
                      placeholder="0"
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                        handleUpdateBoostPlan(bp.id, { price: cleaned === '' ? 0 : Number(cleaned) });
                      }}
                      style={{ width: '100%', fontWeight: 700, fontSize: '15px' }}
                    />
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)' }}>Duration (Days)</label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={bp.days === 0 ? '' : bp.days}
                      placeholder="1"
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                        handleUpdateBoostPlan(bp.id, { days: cleaned === '' ? 1 : Math.max(1, Number(cleaned)) });
                      }}
                      style={{ width: '100%', fontWeight: 700, fontSize: '15px' }}
                    />
                  </div>
                </div>

                {/* Duration shortcut quick pills */}
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginBottom: '5px' }}>Quick Duration Presets:</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[1, 3, 7, 14, 30].map((presetDays) => (
                      <button
                        key={presetDays}
                        type="button"
                        className={`btn ${bp.days === presetDays ? 'brass' : 'secondary'} small`}
                        style={{ padding: '2px 8px', fontSize: '11px', height: 'auto', minHeight: '24px' }}
                        onClick={() => handleUpdateBoostPlan(bp.id, { days: presetDays })}
                      >
                        {presetDays}d
                      </button>
                    ))}
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: '4px 0 0', fontSize: '12px' }}>
                  <input
                    type="checkbox"
                    checked={bp.isPopular}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setBoostPlansState((prev) =>
                        prev.map((p) => ({
                          ...p,
                          isPopular: p.id === bp.id ? checked : false,
                        }))
                      );
                    }}
                  />
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Mark as Highlighted / Recommended Tier</span>
                </label>
              </div>
            );
          })}
        </div>
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
