import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { GooglePlacesAddressPicker } from '../../components/GooglePlacesAddressPicker';
import { Property, Unit, PropertyAddress, PaymentTransaction, ListingBoostPlan, OwnerSettings } from '../../types';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { uploadOrCompressImage } from '../../lib/imageUploader';
import { sanitizeCountry } from '../../lib/addressUtils';
import { AddressDisplay } from '../../components/common/AddressDisplay';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { PlanLimitModal } from '../../components/common/PlanLimitModal';
import { FloatingActionButton } from '../../components/common/FloatingActionButton';
import { ButtonProcessing } from '../../components/common/Spinner';
import { DEFAULT_BOOST_PLANS } from '../../lib/store';
import {
  MapPin,
  Plus,
  Building2,
  Layers,
  ShieldCheck,
  Check,
  Sparkles,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Home,
  Zap,
  Star,
  FileText,
  Sliders,
  CheckCircle2,
  Camera,
  Image as ImageIcon,
  Upload,
  Eye,
  X,
  Edit3,
  User,
  Phone,
  Mail,
  Gauge,
  Search,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import { DEFAULT_CURRENCY, DEFAULT_CURRENCY_SYMBOL, getCurrencySymbol, GLOBAL_CURRENCIES, normalizeCurrencyCode } from '../../lib/currencyService';
import { useCurrency } from '../../context/CurrencyContext';
import { CurrencyAmount, getTableCurrencyHeader } from '../../components/common/CurrencyAmount';
import { resolveUnitOccupancy, calculatePortfolioMetrics, matchesUnitRelational } from '../../lib/portfolioSelectors';
import { OnboardResidentModal } from '../../components/owner/OnboardResidentModal';
import {
  PROPERTY_TYPE_OPTIONS,
  getPropertyCategory,
  getDefaultPropertyStructure,
  isSingleUnitProperty,
  getUnitTypesForProperty,
  PropertyStructure,
} from '../../lib/propertyTypes';


interface UnitDraft {
  unitNumber: string;
  unitType: string;
  floor: string;
  areaSqFt: number;
  furnishing: 'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished';
  rent: number;
  deposit: number;
  currency: string;
  electricityMeter?: string;
  images?: string[];
}

export const PropertiesPage: React.FC = () => {
  const {
    state,
    updateState,
    showToast,
    saveProperty,
    saveUnit,
    saveAgreement,
    saveTenancyRequest,
    saveInvoice,
    saveTenant,
    savePayment,
  } = useAppData();
  const { user, isOwnerPlanActive } = useAuth();
  const navigate = useNavigate();
  const ownerId = user?.id || '';
  const isPlanActive = isOwnerPlanActive(ownerId);
  const { viewCurrency, convert, format } = useCurrency();

  const myProperties = state.properties.filter((p) => Boolean(ownerId) && p.ownerId === ownerId);
  const myUnits = state.units.filter((u) => Boolean(ownerId) && u.ownerId === ownerId);
  const [isSubmittingProp, setIsSubmittingProp] = useState(false);

  const {
    currentPlan,
    currentPlanName,
    usage,
    popularBoost,
    checkAndRun,
    limitModalResource,
    openLimitModal,
    closeLimitModal,
  } = usePlanLimits();

  const maxProperties = usage.properties.max;
  const maxUnits = usage.units.max;
  const isPropertyLimitReached = usage.properties.isFull;
  const isUnitLimitReached = usage.units.isFull;

  const [unitToBoost, setUnitToBoost] = useState<Unit | null>(null);
  const [selectedBoostPlanId, setSelectedBoostPlanId] = useState<string>('boost_standard');
  const [isApplyingBoost, setIsApplyingBoost] = useState<boolean>(false);

  const ownerSettings = state.ownerSettings?.[ownerId];
  const isPassActive = Boolean(
    ownerSettings?.popularBoostUntil &&
    new Date(ownerSettings.popularBoostUntil).getTime() > Date.now()
  );
  const passDaysLeft = isPassActive && ownerSettings?.popularBoostUntil
    ? Math.max(1, Math.ceil((new Date(ownerSettings.popularBoostUntil).getTime() - Date.now()) / 86400000))
    : 0;

  const handleToggleUnitPopular = async (unit: Unit) => {
    const nextPopular = !unit.isPopular;
    const expiry = nextPopular
      ? (ownerSettings?.popularBoostUntil || unit.popularUntil || new Date(Date.now() + 86400000 * 3).toISOString())
      : null;
    const updated: Unit = {
      ...unit,
      isPopular: nextPopular,
      popularUntil: expiry,
    };
    await saveUnit(updated);
    if (viewingUnit && viewingUnit.id === unit.id) {
      setViewingUnit(updated);
    }
    showToast(
      nextPopular
        ? `🔥 Unit ${unit.unitNumber} is now featured as Popular on /homes!`
        : `Unit ${unit.unitNumber} removed from Popular spotlight.`
    );
  };

  const availableBoostPlans: ListingBoostPlan[] = React.useMemo(() => {
    const plans = state.boostPlans && state.boostPlans.length > 0 ? state.boostPlans : DEFAULT_BOOST_PLANS;
    return plans.filter((p) => p.isActive !== false);
  }, [state.boostPlans]);

  const handleApplyPopularBoostPlan = async (unit: Unit, plan: ListingBoostPlan) => {
    // Guard: Prevent repurchase if pass is currently active
    if (isPassActive) {
      showToast(`⚠️ You already have an active Spotlight Pass running (${passDaysLeft}d remaining). You cannot purchase another pass until it expires.`);
      return;
    }

    setIsApplyingBoost(true);
    try {
      const now = Date.now();
      const expiryIso = new Date(now + plan.days * 86400000).toISOString();
      const nowIso = new Date(now).toISOString();

      const updatedBoostSettings = {
        popularBoostUntil: expiryIso,
        popularBoostPlanId: plan.id,
        popularBoostPlanName: plan.name,
        popularBoostPlanPrice: plan.price,
        popularBoostDays: plan.days,
        popularBoostActivatedAt: nowIso,
      };

      updateState((prev) => {
        const nextOwnerSettings = { ...prev.ownerSettings };
        if (ownerId) {
          nextOwnerSettings[ownerId] = {
            ...(nextOwnerSettings[ownerId] || {}),
            ...updatedBoostSettings,
          } as OwnerSettings;
        }

        const nextUnits = prev.units.map((u) => {
          if ((u.ownerId === ownerId || !u.ownerId) && (u.status === 'vacant' || u.isListedPublicly)) {
            return {
              ...u,
              isPopular: true,
              isListedPublicly: true,
              popularUntil: expiryIso,
              popularActivatedAt: nowIso,
              popularPlanId: plan.id,
              popularPlanPrice: plan.price,
            };
          }
          return u;
        });

        return {
          ...prev,
          ownerSettings: nextOwnerSettings,
          units: nextUnits,
        };
      });

      if (isFirebaseConfigured && ownerId) {
        setDoc(doc(db, 'owners', ownerId), { ...updatedBoostSettings }, { merge: true }).catch(console.warn);
        const myVacantUnits = state.units.filter((u) => (u.ownerId === ownerId || !u.ownerId) && (u.status === 'vacant' || u.isListedPublicly));
        for (const vu of myVacantUnits) {
          setDoc(doc(db, 'units', vu.id), {
            ...vu,
            isPopular: true,
            isListedPublicly: true,
            popularUntil: expiryIso,
            popularActivatedAt: nowIso,
            popularPlanId: plan.id,
            popularPlanPrice: plan.price,
          }, { merge: true }).catch(console.warn);
        }
      }

      showToast(`🔥 "${plan.name}" activated! All your available listings are now Popular on /homes for ${plan.days} days! ($${plan.price})`);
      setUnitToBoost(null);
    } catch (err: any) {
      console.error('Failed to apply popular boost:', err);
      showToast('Failed to apply popular boost: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsApplyingBoost(false);
    }
  };

  const handleCancelPopularBoost = async (unit: Unit) => {
    setIsApplyingBoost(true);
    try {
      const updatedUnit: Unit = {
        ...unit,
        isPopular: false,
        popularUntil: null,
        popularActivatedAt: null,
        popularDaysApplied: 0,
      };

      await saveUnit(updatedUnit);
      showToast(`Unit ${unit.unitNumber} popular boost cancelled.`);
      setUnitToBoost(null);
      if (viewingUnit && viewingUnit.id === unit.id) {
        setViewingUnit(updatedUnit);
      }
    } catch (err: any) {
      console.error('Failed to cancel popular boost:', err);
      showToast('Failed to cancel popular boost: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsApplyingBoost(false);
    }
  };

  const myPropertyManagers = (state.propertyManagers || []).filter(
    (m: any) => Boolean(ownerId) && m.ownerId === ownerId
  );

  const [isAddPropOpen, setIsAddPropOpen] = useState(false);
  // Unit Details (Read-only Modal) State
  const [viewingUnit, setViewingUnit] = useState<Unit | null>(null);

  // Unit Edit (Dedicated Form Modal) State
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [editUnitNumber, setEditUnitNumber] = useState('');
  const [editUnitType, setEditUnitType] = useState('2 BHK');
  const [editFloor, setEditFloor] = useState('1st Floor');
  const [editAreaSqFt, setEditAreaSqFt] = useState(1000);
  const [editFurnishing, setEditFurnishing] = useState<'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished'>('Semi-Furnished');
  const [editRent, setEditRent] = useState(0);
  const [editDeposit, setEditDeposit] = useState(0);
  const [editStatus, setEditStatus] = useState<'occupied' | 'vacant' | 'reserved' | 'maintenance'>('vacant');
  const [editElectricityMeter, setEditElectricityMeter] = useState('');
  const [editWaterMeter, setEditWaterMeter] = useState('');
  const [editUnitImages, setEditUnitImages] = useState<string[]>([]);
  const [unitToConfirmListing, setUnitToConfirmListing] = useState<Unit | null>(null);

  // Photo viewer modal state
  const [previewPhotoModal, setPreviewPhotoModal] = useState<{ title: string; url: string } | null>(null);
  const [expandedAmenities, setExpandedAmenities] = useState<Record<string, boolean>>({});

  // Add Unit to Existing Property Modal State
  const [addUnitProperty, setAddUnitProperty] = useState<Property | null>(null);
  const [newUnitNumber, setNewUnitNumber] = useState('');
  const [newUnitType, setNewUnitType] = useState('2 BHK');
  const [newUnitFloor, setNewUnitFloor] = useState('1st Floor');
  const [newUnitRent, setNewUnitRent] = useState(0);
  const [newUnitDeposit, setNewUnitDeposit] = useState(0);
  const [newUnitImages, setNewUnitImages] = useState<string[]>([]);

  // Move-in & Vacate Synchronization State
  const [depositHandlingOption, setDepositHandlingOption] = useState<'paid_offline' | 'pending'>('paid_offline');
  const [vacateConfirmTarget, setVacateConfirmTarget] = useState<{ unit: Unit; updatedData: Unit } | null>(null);
  const [isProcessingUnitAction, setIsProcessingUnitAction] = useState(false);

  const openUnitDetails = (u: Unit) => {
    setViewingUnit(u);
  };

  const openUnitEdit = (u: Unit) => {
    setEditingUnit(u);
    setEditUnitNumber(u.unitNumber || '');
    const parentProp = state.properties.find((p) => p.id === u.propertyId);
    const validTypes = getUnitTypesForProperty(parentProp?.propertyType, u.unitType);
    setEditUnitType(u.unitType || validTypes[0] || '2 BHK');
    setEditFloor(u.floor || '1st Floor');
    setEditAreaSqFt(u.areaSqFt || 1000);
    setEditFurnishing(u.furnishing || 'Semi-Furnished');
    setEditRent(u.rent || 0);
    setEditDeposit(u.deposit || 0);
    const currentEffective = resolveUnitOccupancy(u, state.agreements, state.tenancyRequests, state.moveouts).effectiveStatus;
    setEditStatus(currentEffective || u.status || 'vacant');
    setDepositHandlingOption('paid_offline');
    setEditElectricityMeter(u.electricityMeter || '');
    setEditWaterMeter(u.waterMeter || '');
    setEditUnitImages(u.images && u.images.length > 0 ? [...u.images] : u.image ? [u.image] : []);
  };

  const executeImmediateVacate = async (unitToVacate: Unit) => {
    setIsProcessingUnitAction(true);
    try {
      // 1. Terminate all active lease agreements for this specific unit
      const matchedAgreements = (state.agreements || []).filter(
        (a) => a.status !== 'terminated' && matchesUnitRelational(a, unitToVacate)
      );
      for (const ag of matchedAgreements) {
        await saveAgreement({
          ...ag,
          status: 'terminated',
          depositStatus: 'refunded',
        });
      }

      // 2. Cancel any pending tenancy requests for this unit
      const matchedRequests = (state.tenancyRequests || []).filter(
        (r) => r.status === 'pending' && matchesUnitRelational(r, unitToVacate)
      );
      for (const req of matchedRequests) {
        await saveTenancyRequest({
          ...req,
          status: 'cancelled',
        });
      }

      // 3. Detach unit from tenant record in state.tenants
      const targetTenantId = unitToVacate.currentTenantId;
      const targetTenantName = unitToVacate.tenant;
      const matchedTenant = (state.tenants || []).find(
        (t) => (targetTenantId && t.id === targetTenantId) || (targetTenantName && t.name === targetTenantName)
      );
      if (matchedTenant) {
        const remainingUnits = (matchedTenant.unitsRented || []).filter(
          (uStr) => uStr !== unitToVacate.unitNumber && uStr !== unitToVacate.id
        );
        await saveTenant({
          ...matchedTenant,
          unit: remainingUnits[0] || '',
          unitsRented: remainingUnits,
          status: remainingUnits.length > 0 ? 'active' : 'past',
        });
      }

      // 4. Save unit as vacant
      const cleanNum = editUnitNumber.trim() || unitToVacate.unitNumber || unitToVacate.id;
      const vacatedUnit: Unit = {
        ...unitToVacate,
        unitNumber: cleanNum,
        status: 'vacant',
        tenant: null,
        currentTenantId: null,
      };
      await saveUnit(vacatedUnit);

      showToast(`✓ Unit ${cleanNum} marked Vacant and lease terminated.`);
      setVacateConfirmTarget(null);
      setEditingUnit(null);
      if (viewingUnit && viewingUnit.id === unitToVacate.id) {
        setViewingUnit(vacatedUnit);
      }
    } catch (err: any) {
      showToast(`⚠️ Error vacating unit: ${err?.message || 'Action failed'}`);
    } finally {
      setIsProcessingUnitAction(false);
    }
  };

  const executeCancelReservation = async (unitToCancel: Unit) => {
    setIsProcessingUnitAction(true);
    try {
      const cleanNum = editUnitNumber.trim() || unitToCancel.unitNumber || unitToCancel.id;

      // 1. Cancel pending tenancy requests
      const matchedRequests = (state.tenancyRequests || []).filter(
        (r) => (r.status === 'pending' || r.status === 'accepted') && matchesUnitRelational(r, unitToCancel)
      );
      for (const req of matchedRequests) {
        await saveTenancyRequest({
          ...req,
          status: 'cancelled',
        });
      }

      // 2. Cancel draft or pending agreements
      const matchedAgreements = (state.agreements || []).filter(
        (a) =>
          a.status !== 'terminated' &&
          a.status !== 'rejected' &&
          matchesUnitRelational(a, unitToCancel)
      );
      for (const ag of matchedAgreements) {
        await saveAgreement({
          ...ag,
          status: 'terminated',
        });
      }

      // 3. Void pending deposit invoices
      const matchedInvoices = (state.invoices || []).filter(
        (inv) =>
          inv.type === 'deposit' &&
          inv.status !== 'paid' &&
          inv.status !== 'void' &&
          inv.status !== 'cancelled' &&
          matchesUnitRelational({ unit: inv.unit, propertyId: inv.propertyId }, unitToCancel)
      );
      for (const inv of matchedInvoices) {
        await saveInvoice({
          ...inv,
          status: 'cancelled',
        });
      }

      // 4. Save unit as vacant
      const vacatedUnit: Unit = {
        ...unitToCancel,
        unitNumber: cleanNum,
        status: 'vacant',
        tenant: null,
        currentTenantId: null,
      };
      await saveUnit(vacatedUnit);

      // 5. Update local state immediately for seamless UI responsiveness
      updateState((prev) => ({
        ...prev,
        units: prev.units.map((u) => (u.id === unitToCancel.id ? vacatedUnit : u)),
        tenancyRequests: (prev.tenancyRequests || []).map((r) =>
          matchesUnitRelational(r, unitToCancel) ? { ...r, status: 'cancelled' as const } : r
        ),
        agreements: (prev.agreements || []).map((a) =>
          matchesUnitRelational(a, unitToCancel) && a.status !== 'active' ? { ...a, status: 'terminated' as const } : a
        ),
      }));

      showToast(`✓ Reservation for Unit ${cleanNum} cancelled. Unit is now Vacant.`);
      setEditingUnit(null);
      if (viewingUnit && viewingUnit.id === unitToCancel.id) {
        setViewingUnit(vacatedUnit);
      }
    } catch (err: any) {
      showToast(`⚠️ Error cancelling reservation: ${err?.message || 'Action failed'}`);
    } finally {
      setIsProcessingUnitAction(false);
    }
  };

  const executeFinalizeMoveIn = async (unitToOccupy: Unit, depositMode: 'paid_offline' | 'pending') => {
    setIsProcessingUnitAction(true);
    try {
      const cleanNum = editUnitNumber.trim() || unitToOccupy.unitNumber || unitToOccupy.id;
      const nowIso = new Date().toISOString();

      // 1. Transition pending tenancy requests to accepted
      const matchedRequests = (state.tenancyRequests || []).filter(
        (r) => r.status === 'pending' && matchesUnitRelational(r, unitToOccupy)
      );
      for (const req of matchedRequests) {
        await saveTenancyRequest({
          ...req,
          status: 'accepted',
        });
      }

      // 2. Transition pending agreements to active
      const matchedAgreements = (state.agreements || []).filter(
        (a) => a.status !== 'terminated' && a.status !== 'rejected' && matchesUnitRelational(a, unitToOccupy)
      );
      for (const ag of matchedAgreements) {
        await saveAgreement({
          ...ag,
          status: 'active',
          depositStatus: depositMode === 'paid_offline' ? 'paid' : ag.depositStatus || 'unpaid',
          executionMode: 'already_executed_offline',
          approvedAt: nowIso,
        });
      }

      // 3. Handle deposit if paid offline
      if (depositMode === 'paid_offline' && (unitToOccupy.deposit || 0) > 0) {
        const existingTxn = (state.payments || []).find(
          (p) =>
            p.type === 'deposit' &&
            p.status === 'paid' &&
            (p.unit === cleanNum || p.unit === unitToOccupy.id)
        );
        if (!existingTxn) {
          const depositTxn: PaymentTransaction = {
            id: `TXN-DEP-${Date.now().toString().slice(-6)}`,
            ownerId,
            tenant: unitToOccupy.tenant || 'Resident',
            tenantId: unitToOccupy.currentTenantId || '',
            unit: cleanNum,
            amount: unitToOccupy.deposit,
            date: nowIso.split('T')[0],
            dueDate: nowIso.split('T')[0],
            status: 'paid',
            method: 'Offline Cash / Wire',
            type: 'deposit',
            currency: unitToOccupy.currency || 'USD',
            notes: `Security deposit collected upon manual move-in execution for Unit ${cleanNum}.`,
          };
          await savePayment(depositTxn);
        }

        const depInv = (state.invoices || []).find(
          (i) =>
            i.type === 'deposit' &&
            i.status !== 'paid' &&
            i.status !== 'void' &&
            i.status !== 'cancelled' &&
            matchesUnitRelational({ unit: i.unit, propertyId: i.propertyId }, unitToOccupy)
        );
        if (depInv) {
          await saveInvoice({
            ...depInv,
            status: 'paid',
            paidAt: nowIso,
            paymentMethodUsed: 'Offline Cash / Wire',
          });
        }
      }

      // 4. Update tenant in state.tenants
      const targetTenantId = unitToOccupy.currentTenantId;
      const targetTenantName = unitToOccupy.tenant;
      const matchedTenant = (state.tenants || []).find(
        (t) => (targetTenantId && t.id === targetTenantId) || (targetTenantName && t.name === targetTenantName)
      );
      if (matchedTenant) {
        const updatedUnitsRented = Array.from(new Set([...(matchedTenant.unitsRented || []), cleanNum]));
        await saveTenant({
          ...matchedTenant,
          unit: cleanNum,
          unitsRented: updatedUnitsRented,
          status: 'active',
          propertyId: unitToOccupy.propertyId,
          propertyName: unitToOccupy.propertyName,
        });
      }

      // 5. Save unit as occupied
      const occupiedUnit: Unit = {
        ...unitToOccupy,
        unitNumber: cleanNum,
        status: 'occupied',
      };
      await saveUnit(occupiedUnit);

      showToast(`✓ Move-in finalized for Unit ${cleanNum}. Status is now Occupied.`);
      setEditingUnit(null);
      if (viewingUnit && viewingUnit.id === unitToOccupy.id) {
        setViewingUnit(occupiedUnit);
      }
    } catch (err: any) {
      showToast(`⚠️ Error finalizing move-in: ${err?.message || 'Action failed'}`);
    } finally {
      setIsProcessingUnitAction(false);
    }
  };

  const handleSaveUnitEdit = async () => {
    if (!editingUnit) return;
    const cleanNum = editUnitNumber.trim() || editingUnit.unitNumber || editingUnit.id;
    const updatedUnit: Unit = {
      ...editingUnit,
      unitNumber: cleanNum,
      unitType: editUnitType,
      floor: editFloor,
      areaSqFt: Number(editAreaSqFt) || 0,
      furnishing: editFurnishing,
      rent: Number(editRent) || 0,
      deposit: Number(editDeposit) || 0,
      status: editStatus,
      electricityMeter: editElectricityMeter.trim() || undefined,
      waterMeter: editWaterMeter.trim() || undefined,
      tenant: editStatus === 'vacant' ? null : editingUnit.tenant,
      currentTenantId: editStatus === 'vacant' ? null : editingUnit.currentTenantId,
      images: editUnitImages,
      image: editUnitImages[0] || undefined,
    };

    const currentEffective = resolveUnitOccupancy(
      editingUnit,
      state.agreements,
      state.tenancyRequests,
      state.moveouts
    ).effectiveStatus;

    // Case A: Occupied -> Vacant with active resident -> Prompt Move-Out & Settlement
    if (
      editStatus === 'vacant' &&
      (editingUnit.status === 'occupied' || currentEffective === 'occupied') &&
      editingUnit.tenant
    ) {
      setVacateConfirmTarget({
        unit: editingUnit,
        updatedData: updatedUnit,
      });
      return;
    }

    // Case B: Transition to Vacant -> Cancel reservation & void pending invitation/invoices
    if (editStatus === 'vacant') {
      await executeCancelReservation(updatedUnit);
      return;
    }

    // Case C: Transition to Occupied (or Occupied with resident) -> Finalize move-in & sync deposit
    if (editStatus === 'occupied') {
      await executeFinalizeMoveIn(updatedUnit, depositHandlingOption);
      return;
    }

    // Standard update
    await saveUnit(updatedUnit);
    showToast(`Unit ${cleanNum} updated successfully.`);
    setEditingUnit(null);
    if (viewingUnit && viewingUnit.id === updatedUnit.id) {
      setViewingUnit(updatedUnit);
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
    const target = state.units.find((u) => u.id === unitId);
    if (target && (target.status === 'occupied' || target.tenant)) {
      showToast('⚠️ Cannot delete an occupied unit. Please vacate the tenant first.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete Unit ${target?.unitNumber || unitId}? This action cannot be undone.`)) {
      return;
    }
    updateState((prev) => ({
      ...prev,
      units: prev.units.filter((u) => u.id !== unitId),
    }));
    if (target?.propertyId) {
      const prop = state.properties.find((p) => p.id === target.propertyId);
      if (prop) {
        saveProperty({
          ...prop,
          unitCount: Math.max(0, (prop.unitCount || 1) - 1),
        });
      }
    }
    showToast(`Unit ${target?.unitNumber || unitId} has been deleted.`);
    setEditingUnit(null);
    setViewingUnit(null);
  };

  const handleAddUnitToProperty = () => {
    if (!addUnitProperty) return;
    if (isUnitLimitReached) {
      showToast(`⚠️ Unit limit reached (${myUnits.length}/${maxUnits} on ${currentPlanName} tier). Please upgrade your plan to add more units.`);
      return;
    }
    const cleanNum = newUnitNumber.trim() || `Unit ${Date.now().toString().slice(-4)}`;
    const unitId = `unit-${Date.now()}`;
    const newUnitObj: Unit = {
      id: unitId,
      ownerId,
      propertyId: addUnitProperty.id,
      propertyName: addUnitProperty.name,
      country: sanitizeCountry(
        typeof addUnitProperty.address === 'object' ? addUnitProperty.address.country : addUnitProperty.country,
        typeof addUnitProperty.address === 'object' ? addUnitProperty.address.formattedAddress : addUnitProperty.address
      ),
      address: typeof addUnitProperty.address === 'object' ? addUnitProperty.address.formattedAddress : addUnitProperty.address,
      unitNumber: cleanNum,
      unitType: newUnitType,
      floor: newUnitFloor,
      areaSqFt: 1000,
      furnishing: 'Semi-Furnished',
      rent: newUnitRent,
      deposit: newUnitDeposit,
      currency: getCurrencySymbol(addUnitProperty.currency) || DEFAULT_CURRENCY_SYMBOL,
      status: 'vacant',
      tenant: null,
      currentTenantId: null,
      isListedPublicly: false,
      images: newUnitImages.length > 0 ? newUnitImages : undefined,
      image: newUnitImages[0] || undefined,
    };

    saveUnit(newUnitObj);
    const updatedProp = { ...addUnitProperty, unitCount: (addUnitProperty.unitCount || 0) + 1 };
    saveProperty(updatedProp);

    setAddUnitProperty(null);
    setNewUnitNumber('');
    setNewUnitImages([]);
    showToast(`✓ Unit ${cleanNum} added to ${addUnitProperty.name}.`);
  };

  // 4-Step Wizard Modal State
  const [modalStep, setModalStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Identity & Structure
  const [propName, setPropName] = useState('');
  const [propType, setPropType] = useState('Residential Apartment Complex');
  const [propStructure, setPropStructure] = useState<PropertyStructure>('multi_unit');
  const [propCountry, setPropCountry] = useState<string>('India');
  const [propAddress, setPropAddress] = useState<PropertyAddress | null>(null);
  const [propFloors, setPropFloors] = useState<number>(3);
  const [propYearBuilt, setPropYearBuilt] = useState<string>('2023');
  const [propAssignedManager, setPropAssignedManager] = useState<string>('');

  // Single-Unit Asset Configuration (for whole house / 4BHK villa / single property lease)
  const [singleUnitType, setSingleUnitType] = useState<string>('4 BHK');
  const [singleUnitLabel, setSingleUnitLabel] = useState<string>('Entire House');
  const [singleUnitAreaSqFt, setSingleUnitAreaSqFt] = useState<number>(2000);
  const [singleUnitFurnishing, setSingleUnitFurnishing] = useState<'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished'>('Semi-Furnished');
  const [singleUnitRent, setSingleUnitRent] = useState<number>(0);
  const [singleUnitDeposit, setSingleUnitDeposit] = useState<number>(0);
  const [singleUnitElectricityMeter, setSingleUnitElectricityMeter] = useState<string>('');
  const [singleUnitWaterMeter, setSingleUnitWaterMeter] = useState<string>('');

  // Bulk Selection & Direct Onboarding Launch State
  const [selectedBulkUnits, setSelectedBulkUnits] = useState<Record<string, string[]>>({});
  const [activeOnboardConfig, setActiveOnboardConfig] = useState<{
    isOpen: boolean;
    propertyId?: string;
    unitId?: string;
    unitIds?: string[];
  }>({ isOpen: false });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const COUNTRY_OPTIONS = [
    { name: 'India', currency: '₹' },
    { name: 'United States', currency: '$' },
    { name: 'United Kingdom', currency: '£' },
    { name: 'United Arab Emirates', currency: 'AED' },
    { name: 'Canada', currency: '$' },
    { name: 'Australia', currency: '$' },
    { name: 'Singapore', currency: '$' },
    { name: 'Germany', currency: '€' },
    { name: 'France', currency: '€' },
    { name: 'Spain', currency: '€' },
    { name: 'Italy', currency: '€' },
    { name: 'Netherlands', currency: '€' },
    { name: 'Ireland', currency: '€' },
    { name: 'Switzerland', currency: 'CHF' },
    { name: 'Portugal', currency: '€' },
    { name: 'Japan', currency: '¥' },
    { name: 'Saudi Arabia', currency: 'SAR' },
    { name: 'Qatar', currency: 'QAR' },
    { name: 'South Africa', currency: 'ZAR' },
    { name: 'New Zealand', currency: '$' },
    { name: 'Malaysia', currency: 'MYR' },
    { name: 'Thailand', currency: '฿' },
    { name: 'Brazil', currency: 'R$' },
    { name: 'Mexico', currency: '$' },
    { name: 'Sweden', currency: 'SEK' },
    { name: 'Norway', currency: 'NOK' },
    { name: 'Denmark', currency: 'DKK' },
    { name: 'Poland', currency: 'PLN' },
    { name: 'Turkey', currency: 'TRY' },
    { name: 'South Korea', currency: '₩' },
    { name: 'Hong Kong', currency: 'HK$' },
    { name: 'Indonesia', currency: 'IDR' },
    { name: 'Philippines', currency: '₱' },
    { name: 'Vietnam', currency: '₫' },
    { name: 'Egypt', currency: 'EGP' },
    { name: 'Nigeria', currency: 'NGN' },
    { name: 'Kenya', currency: 'KES' },
    { name: 'Kuwait', currency: 'KWD' },
  ];

  const handleCountrySelect = (selectedCountry: string) => {
    setPropCountry(selectedCountry);
    const match = COUNTRY_OPTIONS.find((c) => c.name.toLowerCase() === selectedCountry.toLowerCase());
    if (match) {
      setPropCurrency(match.currency as any);
    }
  };

  // Step 2: Operational Policies & Amenities
  const [propCurrency, setPropCurrency] = useState<string>('$');
  const [currencySearchQuery, setCurrencySearchQuery] = useState('');
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const [propRules, setPropRules] = useState({
    petsAllowed: true,
    smokingAllowed: false,
    sublettingAllowed: false,
    minLeaseMonths: 11,
    noticePeriodDays: 30,
  });
  const [propAmenities, setPropAmenities] = useState<string[]>([
    '24/7 Security',
    'Elevator',
    'Covered Parking',
    'Gymnasium',
    'Power Backup',
  ]);
  const [customAmenityInput, setCustomAmenityInput] = useState('');
  const [propAmenityPhotos, setPropAmenityPhotos] = useState<Record<string, string>>({});

  // Step 3: Units Setup & Bulk Generator
  const [unitsBuilderMode, setUnitsBuilderMode] = useState<'table' | 'bulk'>('table');
  const [bulkFloorsStart, setBulkFloorsStart] = useState<number>(1);
  const [bulkFloorsEnd, setBulkFloorsEnd] = useState<number>(3);
  const [bulkUnitsPerFloor, setBulkUnitsPerFloor] = useState<number>(4);
  const [bulkBaseRent, setBulkBaseRent] = useState<number>(0);
  const [bulkBaseDeposit, setBulkBaseDeposit] = useState<number>(0);
  const [bulkUnitType, setBulkUnitType] = useState<string>('2 BHK');
  const [bulkFurnishing, setBulkFurnishing] = useState<'Unfurnished' | 'Semi-Furnished' | 'Fully Furnished'>('Semi-Furnished');
  const [bulkAreaSqFt, setBulkAreaSqFt] = useState<number>(0);
  const [bulkDefaultPhoto, setBulkDefaultPhoto] = useState<string | null>(null);

  const [initialUnits, setInitialUnits] = useState<UnitDraft[]>([]);

  // Step 4: Photos & Review
  const [propImages, setPropImages] = useState<string[]>([]);
  const [coverPhotoIndex, setCoverPhotoIndex] = useState<number>(0);

  const handleAddCustomAmenity = () => {
    if (!customAmenityInput.trim()) return;
    const clean = customAmenityInput.trim();
    if (!propAmenities.includes(clean)) {
      setPropAmenities((prev) => [...prev, clean]);
      showToast(`Added custom amenity: "${clean}"`);
    }
    setCustomAmenityInput('');
  };

  const handleAmenityPhotoUpload = async (amenityName: string, file: File) => {
    try {
      showToast(`Optimizing photo for ${amenityName}...`);
      const optimized = await uploadOrCompressImage(file, `properties/amenities/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
      setPropAmenityPhotos((prev) => ({ ...prev, [amenityName]: optimized }));
      showToast(`📸 Photo uploaded for ${amenityName}`);
    } catch (err) {
      console.warn('Amenity photo upload error:', err);
    }
  };

  const handleRemoveAmenityPhoto = (amenityName: string) => {
    setPropAmenityPhotos((prev) => {
      const next = { ...prev };
      delete next[amenityName];
      return next;
    });
    showToast(`Photo removed for ${amenityName}`);
  };

  const handleUnitPhotoUpload = async (unitIndex: number, file: File) => {
    try {
      showToast(`Optimizing unit photo...`);
      const optimized = await uploadOrCompressImage(file, `units/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
      setInitialUnits((prev) =>
        prev.map((item, idx) =>
          idx === unitIndex ? { ...item, images: [...(item.images || []), optimized] } : item
        )
      );
      showToast(`📸 Photo attached to Unit ${initialUnits[unitIndex]?.unitNumber || unitIndex + 1}`);
    } catch (err) {
      console.warn('Unit photo upload error:', err);
    }
  };

  const handleRemoveUnitPhoto = (unitIndex: number, photoIndex: number) => {
    setInitialUnits((prev) =>
      prev.map((item, idx) =>
        idx === unitIndex ? { ...item, images: (item.images || []).filter((_, pIdx) => pIdx !== photoIndex) } : item
      )
    );
  };

  const handlePropertyPhotoUpload = async (prop: Property, file: File) => {
    try {
      showToast(`Optimizing property photo for ${prop.name}...`);
      const optimized = await uploadOrCompressImage(file, `properties/${prop.id}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
      const cleanExisting = (prop.images || []).filter((img) => !img.includes('unsplash.com'));
      const updatedProp: Property = {
        ...prop,
        images: [optimized, ...cleanExisting],
      };
      await saveProperty(updatedProp);
      showToast(`📸 Real photo saved for ${prop.name}!`);
    } catch (err: any) {
      showToast(`Upload failed: ${err?.message || 'Error processing image'}`);
    }
  };

  const handleSavedUnitPhotoUpload = async (u: Unit, file: File) => {
    try {
      showToast(`Optimizing photo for Unit ${u.unitNumber}...`);
      const optimized = await uploadOrCompressImage(
        file,
        `units/${u.id}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      );
      const cleanExisting = (u.images || []).filter((img) => !img.includes('unsplash.com'));
      const updatedUnit: Unit = {
        ...u,
        images: [optimized, ...cleanExisting],
        image: optimized,
      };
      await saveUnit(updatedUnit);
      showToast(`📸 Photo saved for Unit ${u.unitNumber}!`);
    } catch (err: any) {
      showToast(`Upload failed: ${err?.message || 'Error processing image'}`);
    }
  };

  const handleGenerateBulkUnits = () => {
    const generated: UnitDraft[] = [];
    const startF = Math.max(1, bulkFloorsStart);
    const endF = Math.max(startF, bulkFloorsEnd);
    for (let f = startF; f <= endF; f++) {
      for (let u = 1; u <= bulkUnitsPerFloor; u++) {
        const uNum = `${f * 100 + u}`;
        generated.push({
          unitNumber: uNum,
          unitType: bulkUnitType,
          floor: `Floor ${f}`,
          areaSqFt: bulkAreaSqFt,
          furnishing: bulkFurnishing,
          rent: bulkBaseRent,
          deposit: bulkBaseDeposit,
          currency: propCurrency,
          electricityMeter: '',
          images: bulkDefaultPhoto ? [bulkDefaultPhoto] : [],
        });
      }
    }
    setInitialUnits(generated);
    setUnitsBuilderMode('table');
    showToast(`⚡ Generated ${generated.length} units automatically across ${endF - startF + 1} floors!`);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    showToast(`Optimizing ${files.length} property photo(s)...`);
    for (const file of Array.from(files)) {
      try {
        const optimized = await uploadOrCompressImage(file, `properties/gallery/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
        setPropImages((prev) => [...prev, optimized]);
      } catch (err) {
        console.warn('Image upload error:', err);
      }
    }
  };

  const handleCreateProperty = () => {
    const errs: Record<string, string> = {};
    if (!propName.trim()) {
      errs.propName = 'Property name is required.';
    }
    if (!propAddress) {
      errs.propAddress = 'Please select a confirmed Google Maps location.';
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setModalStep(1);
      showToast('Please provide required property information in Step 1.');
      return;
    }
    if (propStructure === 'multi_unit' && initialUnits.length === 0) {
      setModalStep(3);
      showToast('Please configure at least one unit in Step 3.');
      return;
    }

    const calculatedUnitCount = propStructure === 'single_unit' ? 1 : initialUnits.length;

    if (isPropertyLimitReached) {
      showToast(`⚠️ Property limit reached (${myProperties.length}/${maxProperties} on ${currentPlanName} tier). Please upgrade your plan to add more properties.`);
      return;
    }
    if (maxUnits < 9999 && (myUnits.length + calculatedUnitCount) > maxUnits) {
      showToast(`⚠️ Adding this property would exceed your plan's unit limit (${myUnits.length + calculatedUnitCount} > ${maxUnits} on ${currentPlanName} tier). Please adjust units or upgrade your plan.`);
      return;
    }

    setIsSubmittingProp(true);
    try {
      const propId = `prop_${Date.now()}`;
      const sortedImages = [...propImages];
      if (coverPhotoIndex > 0 && coverPhotoIndex < sortedImages.length) {
        const [cover] = sortedImages.splice(coverPhotoIndex, 1);
        sortedImages.unshift(cover);
      }

      const confirmedAddress: PropertyAddress = propAddress || {
        formattedAddress: propName.trim(),
        country: propCountry,
        city: '',
        placeId: '',
        lat: 0,
        lng: 0,
      };
      const resolvedCountry = sanitizeCountry(propCountry || confirmedAddress.country, confirmedAddress.formattedAddress);

      const newProp: Property = {
        id: propId,
        ownerId,
        name: propName.trim(),
        propertyType: propType,
        propertyStructure: propStructure,
        propertyCategory: getPropertyCategory(propType),
        isSingleUnit: propStructure === 'single_unit',
        floorsCount: propFloors,
        yearBuilt: propYearBuilt ? Number(propYearBuilt) : undefined,
        assignedManagerId: propAssignedManager || undefined,
        address: {
          ...confirmedAddress,
          country: resolvedCountry,
          formattedAddress: confirmedAddress.formattedAddress,
        },
        amenities: propAmenities,
        amenityPhotos: Object.entries(propAmenityPhotos)
          .filter(([_, img]) => !!img)
          .map(([name, image]) => ({ name, image })),
        rules: propRules,
        images: sortedImages,
        unitCount: calculatedUnitCount,
        occupied: 0,
        createdAt: new Date().toISOString(),
        country: resolvedCountry,
        currency: propCurrency,
      };

      let newUnits: Unit[] = [];
      if (propStructure === 'single_unit') {
        newUnits = [
          {
            id: `unit-${propId}-main`,
            propertyId: propId,
            propertyName: propName.trim(),
            country: resolvedCountry,
            address: confirmedAddress.formattedAddress,
            ownerId,
            unitNumber: singleUnitLabel.trim() || 'Entire House',
            unitType: singleUnitType,
            floor: 'Whole Property',
            areaSqFt: singleUnitAreaSqFt || 0,
            furnishing: singleUnitFurnishing,
            rent: singleUnitRent || 0,
            deposit: singleUnitDeposit || 0,
            currency: propCurrency,
            status: 'vacant',
            isListedPublicly: true,
            tenant: null,
            currentTenantId: null,
            electricityMeter: singleUnitElectricityMeter || undefined,
            waterMeter: singleUnitWaterMeter || undefined,
            isWholeProperty: true,
            images: sortedImages.length > 0 ? sortedImages : undefined,
            image: sortedImages.length > 0 ? sortedImages[0] : undefined,
          },
        ];
      } else {
        newUnits = initialUnits.map((u) => ({
          id: `unit-${propId}-${u.unitNumber}`,
          propertyId: propId,
          propertyName: propName.trim(),
          country: resolvedCountry,
          address: confirmedAddress.formattedAddress,
          ownerId,
          unitNumber: u.unitNumber,
          unitType: u.unitType,
          floor: u.floor,
          areaSqFt: u.areaSqFt,
          furnishing: u.furnishing,
          rent: u.rent,
          deposit: u.deposit,
          currency: propCurrency,
          status: 'vacant',
          isListedPublicly: true,
          tenant: null,
          currentTenantId: null,
          electricityMeter: u.electricityMeter || undefined,
          images: u.images && u.images.length > 0 ? u.images : undefined,
          image: u.images && u.images.length > 0 ? u.images[0] : undefined,
        }));
      }

      saveProperty(newProp, newUnits);

      setIsAddPropOpen(false);
      setModalStep(1);
      setPropName('');
      setPropAddress(null);
      setPropImages([]);
      setPropAmenityPhotos({});
      setBulkDefaultPhoto(null);
      showToast(
        propStructure === 'single_unit'
          ? `Single-unit property "${newProp.name}" created successfully!`
          : `Property "${newProp.name}" with ${newUnits.length} configured units created successfully!`
      );
    } finally {
      setIsSubmittingProp(false);
    }
  };

  const handleToggleListing = (unitId: string) => {
    const target = state.units.find((u) => u.id === unitId);
    if (!target) return;
    const nowListed = !target.isListedPublicly;
    const updated = { ...target, isListedPublicly: nowListed };
    saveUnit(updated);
    showToast(
      nowListed
        ? `${unitId} is now listed in the public directory.`
        : `${unitId} removed from listings.`
    );
  };

  return (
    <div>
      <div>
        <div className="panel-head" data-tour="properties-portfolio" style={{ border: 'none', padding: '0 0 16px' }}>
          <div>
            <h3>Properties Portfolio</h3>
            <div className="hint">
              {myProperties.length} Properties • {myUnits.length} Units total
            </div>
          </div>
          <button
            type="button"
            data-tour="properties-add-btn"
            className="btn brass btn-mobile-full"
            disabled={!isPlanActive}
            title={isPropertyLimitReached ? `Property limit reached (${maxProperties} max on ${currentPlanName} tier) - Click to upgrade` : undefined}
            onClick={() => {
              checkAndRun('properties', () => setIsAddPropOpen(true));
            }}
          >
            <Plus size={16} /> Add Property
          </button>
        </div>

        {isPropertyLimitReached && (
          <div style={{ background: 'var(--amber-soft)', border: '1px solid var(--amber)', padding: '12px 18px', borderRadius: '8px', fontSize: '13px', color: 'var(--amber)', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              ⚠️ <b>Property limit reached:</b> You have used all {maxProperties} properties included in your <b>{currentPlanName}</b> subscription tier.
            </div>
            <button type="button" className="btn brass small" onClick={() => openLimitModal('properties')}>
              Upgrade Plan
            </button>
          </div>
        )}

        {isUnitLimitReached && (
          <div style={{ background: 'var(--amber-soft)', border: '1px solid var(--amber)', padding: '12px 18px', borderRadius: '8px', fontSize: '13px', color: 'var(--amber)', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              ⚠️ <b>Unit limit reached:</b> You have used all {maxUnits} units included in your <b>{currentPlanName}</b> subscription tier.
            </div>
            <button type="button" className="btn brass small" onClick={() => openLimitModal('units')}>
              Upgrade Plan
            </button>
          </div>
        )}

        {isPassActive && (
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1.5px solid rgba(245, 158, 11, 0.45)',
              padding: '12px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              color: 'var(--ink)',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <span style={{ fontWeight: 800, color: '#b45309' }}>🔥 Spotlight Pass Active ({ownerSettings?.popularBoostPlanName || 'Active Pass'}):</span>{' '}
              All your available listings are featured at the top of <b>/homes</b> until{' '}
              <b>{new Date(ownerSettings!.popularBoostUntil!).toLocaleDateString()}</b> ({passDaysLeft} {passDaysLeft === 1 ? 'day' : 'days'} remaining). You can toggle individual listings ON or OFF below.
            </div>
            <button
              type="button"
              className="btn secondary small"
              onClick={() => navigate('/owner/subscription')}
              style={{ fontWeight: 600, fontSize: '12px' }}
            >
              Subscription &amp; Pass Details
            </button>
          </div>
        )}

        {myProperties.length === 0 ? (
          <div className="panel">
            <div className="panel-body" style={{ textAlign: 'center', padding: '48px 20px' }}>
              <Building2 size={40} style={{ color: 'var(--ink-soft)', marginBottom: '12px' }} />
              <h3 style={{ marginBottom: 0 }}>No properties added yet</h3>
            </div>
          </div>
        ) : (
          myProperties.map((p) => {
            const unitsInProp = myUnits.filter((u) => u.propertyId === p.id || (!u.propertyId && myProperties.length === 1));
            const isSingle = isSingleUnitProperty(p) || (p.unitCount === 1 && unitsInProp.length === 1 && unitsInProp[0].isWholeProperty);
            const singleUnit = isSingle ? (unitsInProp[0] || null) : null;
            const isSingleOccupied = singleUnit
              ? resolveUnitOccupancy(singleUnit, state.agreements, state.tenancyRequests, state.moveouts).effectiveStatus === 'occupied'
              : false;
            const totalUnits = unitsInProp.length > 0 ? unitsInProp.length : (p.unitCount || 1);
            const propMetrics = calculatePortfolioMetrics(unitsInProp, state.agreements, state.tenancyRequests, undefined, undefined, state.moveouts);
            const occupiedCount = propMetrics.totalUnits > 0 ? propMetrics.occupiedCount : (p.occupied || 0);
            const isFull = totalUnits > 0 && occupiedCount >= totalUnits;

            return (
              <div key={p.id} className="panel">
                <div className="panel-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {(() => {
                      const realImages = (p.images || []).filter((img) => !img.includes('unsplash.com'));
                      const hasRealImage = realImages.length > 0;
                      return (
                        <div style={{ position: 'relative' }}>
                          <label
                            style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              border: hasRealImage ? '1px solid var(--line)' : '1px dashed var(--line)',
                              background: hasRealImage ? 'var(--bg)' : 'var(--surface-sunken)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              cursor: 'pointer',
                              position: 'relative',
                            }}
                            title={hasRealImage ? 'Click to change or update real photo' : 'Click to upload real property photo'}
                          >
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handlePropertyPhotoUpload(p, f);
                              }}
                            />
                            {hasRealImage ? (
                              <img
                                src={realImages[0]}
                                alt={p.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              <Building2 size={22} color="var(--primary)" />
                            )}
                            <div
                              style={{
                                position: 'absolute',
                                bottom: 0,
                                right: 0,
                                background: 'rgba(0,0,0,0.6)',
                                borderRadius: '4px 0 0 0',
                                padding: '2px 4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              title="Upload or Change Photo"
                            >
                              <Camera size={10} color="#fff" />
                            </div>
                          </label>
                        </div>
                      );
                    })()}
                    <div>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {p.name}
                        {p.amenityPhotos && p.amenityPhotos.length > 0 && (
                          <span
                            className="badge green"
                            style={{ fontSize: '11px', padding: '2px 6px', fontWeight: 500 }}
                            title={`${p.amenityPhotos.length} amenities have photos`}
                          >
                            📷 {p.amenityPhotos.length} Amenity Photos
                          </span>
                        )}
                      </h3>
                      <div className="hint" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        <MapPin size={13} style={{ flexShrink: 0 }} />
                        <AddressDisplay address={p.address} fallback="Address on file" />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {p.assignedManagerId && (
                      <span className="badge blue" style={{ fontSize: '11px', padding: '2px 8px' }} title="Assigned Delegated Manager">
                        Manager: {myPropertyManagers.find((m: any) => m.id === p.assignedManagerId)?.name || 'Assigned'}
                      </span>
                    )}
                    {isSingle ? (
                      <>
                        <span className="badge" style={{ background: '#FAF0E6', color: '#8A5340', fontWeight: 600 }}>
                          🏡 Single Property Asset
                        </span>
                        <span className={`badge ${isSingleOccupied ? 'green' : 'amber'}`} style={{ fontWeight: 600 }}>
                          {isSingleOccupied ? 'Occupied' : 'Vacant'}
                        </span>
                        {!isSingleOccupied ? (
                          <button
                            type="button"
                            className="btn brass small btn-mobile-full"
                            disabled={!isPlanActive}
                            onClick={() => {
                              setActiveOnboardConfig({
                                isOpen: true,
                                propertyId: p.id,
                                unitId: singleUnit?.id,
                              });
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            🔑 Lease Property
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn secondary small btn-mobile-full"
                            onClick={() => {
                              if (singleUnit) openUnitDetails(singleUnit);
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Eye size={13} /> View Lease
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <span className={`badge ${isFull ? 'green' : occupiedCount > 0 ? 'blue' : 'grey'}`} style={{ fontWeight: 600 }}>
                          {occupiedCount}/{totalUnits} occupied {isFull ? '• 100% Full' : ''}
                        </span>
                        <button
                          type="button"
                          className="btn brass small btn-mobile-full"
                          disabled={!isPlanActive}
                          title={isUnitLimitReached ? `Unit limit reached (${maxUnits} max on ${currentPlanName} tier) - Click to upgrade` : undefined}
                          onClick={() => {
                            checkAndRun('units', () => {
                              setAddUnitProperty(p);
                              setNewUnitNumber('');
                              const validTypes = getUnitTypesForProperty(p.propertyType);
                              setNewUnitType(validTypes[0] || '2 BHK');
                              setNewUnitRent(0);
                              setNewUnitDeposit(0);
                            });
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Plus size={13} /> Add Unit
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="panel-body">
                  {p.amenities && p.amenities.length > 0 && (() => {
                    const isExpanded = Boolean(expandedAmenities[p.id]);
                    const limit = 4;
                    const hasMore = p.amenities.length > limit;
                    const visibleAmenities = isExpanded || !hasMore ? p.amenities : p.amenities.slice(0, limit);
                    const remainingCount = p.amenities.length - limit;

                    return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px', alignItems: 'center' }}>
                        <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontWeight: 600 }}>Amenities:</span>
                        {visibleAmenities.map((am) => {
                          const hasPhoto = p.amenityPhotos?.find((ap) => ap.name === am);
                          return (
                            <span
                              key={am}
                              className="badge"
                              style={{
                                fontSize: '11.5px',
                                padding: '3px 8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                cursor: hasPhoto ? 'pointer' : 'default',
                                border: hasPhoto ? '1px solid var(--teal-border)' : '1px solid var(--line)',
                                background: hasPhoto ? 'var(--teal-light)' : 'var(--surface-sunken)',
                                color: hasPhoto ? 'var(--teal-primary)' : 'var(--ink-soft)',
                              }}
                              onClick={() => {
                                if (hasPhoto) {
                                  setPreviewPhotoModal({ title: `${p.name} — ${am}`, url: hasPhoto.image });
                                }
                              }}
                              title={hasPhoto ? 'Click to view amenity photo' : undefined}
                            >
                              {hasPhoto && '📷 '}
                              {am}
                            </span>
                          );
                        })}
                        {hasMore && (
                          <button
                            type="button"
                            className="badge"
                            style={{
                              fontSize: '11.5px',
                              padding: '3px 8px',
                              cursor: 'pointer',
                              background: 'var(--surface-sunken)',
                              border: '1px solid var(--line)',
                              color: 'var(--ink)',
                              fontWeight: 600,
                            }}
                            onClick={() => setExpandedAmenities((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                          >
                            {isExpanded ? 'Show less ▴' : `+${remainingCount} more ▾`}
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {isSingle ? (
                    <div
                      style={{
                        background: 'var(--surface-sunken)',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius)',
                        padding: '20px',
                      }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>Asset Classification</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px', color: 'var(--ink)' }}>
                            {singleUnit?.unitType || p.propertyType || 'Single Family House'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>Monthly Rent</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px', color: 'var(--brass)' }}>
                            {getCurrencySymbol(singleUnit?.currency || p.currency || DEFAULT_CURRENCY_SYMBOL)}{(singleUnit?.rent || 0).toLocaleString()} / mo
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>Security Deposit</div>
                          <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px' }}>
                            {getCurrencySymbol(singleUnit?.currency || p.currency || DEFAULT_CURRENCY_SYMBOL)}{(singleUnit?.deposit || 0).toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>Carpet Area & Furnishing</div>
                          <div style={{ fontSize: '13px', fontWeight: 500, marginTop: '2px' }}>
                            {singleUnit?.areaSqFt ? `${singleUnit.areaSqFt} sq.ft • ` : ''}{singleUnit?.furnishing || 'Semi-Furnished'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 600 }}>Lease Status</div>
                          <div style={{ marginTop: '2px' }}>
                            <span className={`badge ${isSingleOccupied ? 'green' : 'amber'}`}>
                              {isSingleOccupied ? `Occupied by ${singleUnit?.tenant}` : 'Vacant (Available for Lease)'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                          {singleUnit?.unitNumber && singleUnit.unitNumber !== 'Entire House' ? `Unit Identifier: ${singleUnit.unitNumber} • ` : ''}
                          Managed and leased directly as an independent single-property asset.
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {singleUnit && (
                            <button
                              type="button"
                              className="btn secondary small"
                              onClick={() => openUnitEdit(singleUnit)}
                            >
                              <Edit3 size={13} /> Edit Lease Specs
                            </button>
                          )}
                          {!isSingleOccupied ? (
                            <button
                              type="button"
                              className="btn brass small"
                              onClick={() => setActiveOnboardConfig({ isOpen: true, propertyId: p.id, unitId: singleUnit?.id })}
                            >
                              🔑 Lease Property
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn secondary small"
                              onClick={() => singleUnit && openUnitDetails(singleUnit)}
                            >
                              <Eye size={13} /> View Lease & Resident
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Multi-Unit Bulk Leasing Action Bar if units are selected */}
                      {(() => {
                        const currentSelected = selectedBulkUnits[p.id] || [];
                        const vacantUnitsInProp = unitsInProp.filter((u) => u.status === 'vacant');
                        const allVacantSelected = vacantUnitsInProp.length > 0 && vacantUnitsInProp.every((u) => currentSelected.includes(u.id));
                        const selectedUnitsList = unitsInProp.filter((u) => currentSelected.includes(u.id));
                        const combinedRent = selectedUnitsList.reduce((acc, u) => acc + (u.rent || 0), 0);
                        const combinedDeposit = selectedUnitsList.reduce((acc, u) => acc + (u.deposit || 0), 0);

                        return (
                          <>
                            {currentSelected.length > 0 && (
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  background: '#FAF8F5',
                                  border: '1px solid var(--brass)',
                                  borderRadius: '6px',
                                  padding: '10px 16px',
                                  marginBottom: '12px',
                                  flexWrap: 'wrap',
                                  gap: '10px',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                  <span className="badge brass" style={{ fontWeight: 700 }}>
                                    {currentSelected.length} Vacant Units Selected
                                  </span>
                                  <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
                                    Combined Monthly Rent: <b>{getCurrencySymbol(p.currency)}{combinedRent.toLocaleString()}</b> • Deposit: <b>{getCurrencySymbol(p.currency)}{combinedDeposit.toLocaleString()}</b>
                                  </span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    onClick={() => setSelectedBulkUnits((prev) => ({ ...prev, [p.id]: [] }))}
                                  >
                                    Clear Selection
                                  </button>
                                  <button
                                    type="button"
                                    className="btn brass small"
                                    onClick={() =>
                                      setActiveOnboardConfig({
                                        isOpen: true,
                                        propertyId: p.id,
                                        unitIds: currentSelected,
                                      })
                                    }
                                  >
                                    Bulk Lease Selected Units
                                  </button>
                                </div>
                              </div>
                            )}

                            <div className="desktop-table-view">
                              <div className="table-wrap">
                                <table>
                                  <thead>
                                    <tr>
                                      <th style={{ width: '38px', textAlign: 'center' }}>
                                        {vacantUnitsInProp.length > 0 && (
                                          <input
                                            type="checkbox"
                                            checked={allVacantSelected}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                setSelectedBulkUnits((prev) => ({
                                                  ...prev,
                                                  [p.id]: vacantUnitsInProp.map((u) => u.id),
                                                }));
                                              } else {
                                                setSelectedBulkUnits((prev) => ({ ...prev, [p.id]: [] }));
                                              }
                                            }}
                                            title="Select all vacant units for bulk lease"
                                            style={{ cursor: 'pointer' }}
                                          />
                                        )}
                                      </th>
                                      <th>Unit</th>
                                      <th>Tenant</th>
                                      <th>{getTableCurrencyHeader('Rent', viewCurrency)}</th>
                                      <th>{getTableCurrencyHeader('Deposit', viewCurrency)}</th>
                                      <th>Status</th>
                                      <th>Listed</th>
                                      <th>Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {unitsInProp.map((u) => {
                                      const isUnitVacant = u.status === 'vacant';
                                      const isChecked = (selectedBulkUnits[p.id] || []).includes(u.id);
                                      const unitEffectiveStatus = resolveUnitOccupancy(u, state.agreements, state.tenancyRequests, state.moveouts).effectiveStatus;
                                      const unitCover = (u.images && u.images[0]) || u.image;
                                      return (
                                        <tr key={u.id}>
                                          <td style={{ width: '38px', textAlign: 'center', padding: '6px 8px' }}>
                                            {isUnitVacant ? (
                                              <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => {
                                                  setSelectedBulkUnits((prev) => {
                                                    const current = prev[p.id] || [];
                                                    const next = current.includes(u.id)
                                                      ? current.filter((x) => x !== u.id)
                                                      : [...current, u.id];
                                                    return { ...prev, [p.id]: next };
                                                  });
                                                }}
                                                title="Select unit for bulk lease"
                                                style={{ cursor: 'pointer' }}
                                              />
                                            ) : (
                                              <span style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>—</span>
                                            )}
                                          </td>
                                          <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                              {unitCover ? (
                                                <div
                                                  style={{
                                                    width: '34px',
                                                    height: '34px',
                                                    borderRadius: '6px',
                                                    overflow: 'hidden',
                                                    border: '1px solid var(--line)',
                                                    cursor: 'pointer',
                                                    flexShrink: 0,
                                                  }}
                                                  onClick={() => setPreviewPhotoModal({ title: `Unit ${u.unitNumber || u.id}`, url: unitCover })}
                                                  title="Click to view photo"
                                                >
                                                  <img src={unitCover} alt={`Unit ${u.unitNumber}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                </div>
                                              ) : (
                                                <label
                                                  style={{
                                                    width: '34px',
                                                    height: '34px',
                                                    borderRadius: '6px',
                                                    background: '#F0F2F5',
                                                    border: '1px dashed #CBD2D9',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: 'var(--ink-soft)',
                                                    cursor: 'pointer',
                                                    flexShrink: 0,
                                                  }}
                                                  title="Click to upload unit photo"
                                                >
                                                  <input
                                                    type="file"
                                                    accept="image/*"
                                                    style={{ display: 'none' }}
                                                    onChange={(e) => {
                                                      const f = e.target.files?.[0];
                                                      if (f) handleSavedUnitPhotoUpload(u, f);
                                                    }}
                                                  />
                                                  <Camera size={14} />
                                                </label>
                                              )}
                                              <div>
                                                <b style={{ fontSize: '13.5px', color: 'var(--ink)' }}>{u.unitNumber || u.id}</b>
                                                {u.unitType && (
                                                  <span style={{ fontSize: '11px', color: 'var(--ink-soft)', display: 'block' }}>
                                                    {u.unitType}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </td>
                                          <td>
                                            {u.tenant && unitEffectiveStatus === 'occupied' ? (
                                              <span
                                                style={{
                                                  color: 'var(--ink)',
                                                  fontWeight: 600,
                                                  cursor: 'pointer',
                                                }}
                                                onClick={() => {
                                                  navigate('/owner/tenants');
                                                }}
                                              >
                                                {u.tenant}
                                              </span>
                                            ) : (
                                              <span style={{ color: 'var(--ink-soft)' }}>Vacant</span>
                                            )}
                                          </td>
                                          <td>
                                            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                                              <CurrencyAmount amount={u.rent} currency={u.currency || p.currency} />
                                            </div>
                                          </td>
                                          <td>
                                            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                                              <CurrencyAmount amount={u.deposit} currency={u.currency || p.currency} />
                                            </div>
                                          </td>
                                          <td>
                                            <span
                                              className={`badge ${unitEffectiveStatus === 'occupied'
                                                ? 'green'
                                                : unitEffectiveStatus === 'reserved'
                                                  ? 'amber'
                                                  : unitEffectiveStatus === 'maintenance'
                                                    ? 'grey'
                                                    : 'grey'
                                                }`}
                                            >
                                              {unitEffectiveStatus === 'occupied'
                                                ? 'Occupied'
                                                : unitEffectiveStatus === 'reserved'
                                                  ? 'Reserved'
                                                  : unitEffectiveStatus === 'maintenance'
                                                    ? 'Maintenance'
                                                    : 'Vacant'}
                                            </span>
                                          </td>
                                          <td>
                                            {unitEffectiveStatus === 'vacant' ? (
                                              <label
                                                className={`toggle ${u.isListedPublicly ? 'on' : ''}`}
                                                onClick={() => {
                                                  if (!u.isListedPublicly) {
                                                    setUnitToConfirmListing(u);
                                                  } else {
                                                    handleToggleListing(u.id);
                                                  }
                                                }}
                                              >
                                                <span className="track" />
                                              </label>
                                            ) : null}
                                          </td>
                                          <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                              {u.isListedPublicly && unitEffectiveStatus === 'vacant' && (
                                                <button
                                                  type="button"
                                                  className={`btn small ${u.isPopular ? 'brass' : 'secondary'}`}
                                                  onClick={() => {
                                                    if (isPassActive) {
                                                      handleToggleUnitPopular(u);
                                                    } else {
                                                      setUnitToBoost(u);
                                                      const preferred = availableBoostPlans.find((bp) => bp.isPopular) || availableBoostPlans[0];
                                                      if (preferred) setSelectedBoostPlanId(preferred.id);
                                                    }
                                                  }}
                                                  style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '4px 8px',
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    background: u.isPopular ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : undefined,
                                                    color: u.isPopular ? '#ffffff' : '#d97706',
                                                    borderColor: '#d97706',
                                                  }}
                                                  title={
                                                    isPassActive
                                                      ? (u.isPopular ? 'Click to turn OFF Popular spotlight' : 'Click to feature as Popular (Included in your active pass)')
                                                      : 'Get a Spotlight Pass to feature this listing'
                                                  }
                                                >
                                                  🔥 {u.isPopular ? 'Popular (ON)' : (isPassActive ? 'Make Popular' : 'Boost')}
                                                </button>
                                              )}
                                              <button
                                                type="button"
                                                className="btn secondary small"
                                                onClick={() => openUnitDetails(u)}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}
                                                title="View Unit Details"
                                              >
                                                <Eye size={12} /> Details
                                              </button>
                                              <button
                                                type="button"
                                                className="btn secondary small"
                                                onClick={() => openUnitEdit(u)}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}
                                                title="Edit Unit"
                                              >
                                                <Edit3 size={12} /> Edit
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div className="mobile-card-view">
                              {unitsInProp.map((u) => {
                                const isUnitVacant = u.status === 'vacant';
                                const isChecked = (selectedBulkUnits[p.id] || []).includes(u.id);
                                const unitEffectiveStatus = resolveUnitOccupancy(u, state.agreements, state.tenancyRequests, state.moveouts).effectiveStatus;
                                const unitCover = (u.images && u.images[0]) || u.image;
                                return (
                                  <div key={u.id} className="staff-card">
                                    <div className="staff-card-header">
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {isUnitVacant && (
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => {
                                              setSelectedBulkUnits((prev) => {
                                                const current = prev[p.id] || [];
                                                const next = current.includes(u.id)
                                                  ? current.filter((x) => x !== u.id)
                                                  : [...current, u.id];
                                                return { ...prev, [p.id]: next };
                                              });
                                            }}
                                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                          />
                                        )}
                                        {unitCover ? (
                                          <div
                                            style={{
                                              width: '38px',
                                              height: '38px',
                                              borderRadius: '6px',
                                              overflow: 'hidden',
                                              border: '1px solid var(--line)',
                                              flexShrink: 0,
                                              cursor: 'pointer',
                                            }}
                                            onClick={() => setPreviewPhotoModal({ title: `Unit ${u.unitNumber || u.id}`, url: unitCover })}
                                          >
                                            <img src={unitCover} alt={`Unit ${u.unitNumber}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                          </div>
                                        ) : (
                                          <div
                                            style={{
                                              width: '38px',
                                              height: '38px',
                                              borderRadius: '6px',
                                              background: '#F0F2F5',
                                              border: '1px dashed #CBD2D9',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              color: 'var(--ink-soft)',
                                              flexShrink: 0,
                                            }}
                                          >
                                            <Camera size={16} />
                                          </div>
                                        )}
                                        <div>
                                          <div className="staff-card-title">Unit {u.unitNumber || u.id}</div>
                                          <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                                            Tenant:{' '}
                                            {u.tenant && unitEffectiveStatus === 'occupied' ? (
                                              <span
                                                style={{ color: 'var(--ledger)', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}
                                                onClick={() => {
                                                  navigate('/owner/tenants');
                                                }}
                                              >
                                                {u.tenant}
                                              </span>
                                            ) : (
                                              'Vacant'
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <span
                                        className={`badge ${unitEffectiveStatus === 'occupied'
                                          ? 'green'
                                          : unitEffectiveStatus === 'reserved'
                                            ? 'amber'
                                            : unitEffectiveStatus === 'maintenance'
                                              ? 'grey'
                                              : 'grey'
                                          }`}
                                      >
                                        {unitEffectiveStatus === 'occupied'
                                          ? 'Occupied'
                                          : unitEffectiveStatus === 'reserved'
                                            ? 'Reserved'
                                            : unitEffectiveStatus === 'maintenance'
                                              ? 'Maintenance'
                                              : 'Vacant'}
                                      </span>
                                    </div>
                                    <div className="staff-card-meta">
                                      <div className="staff-card-meta-item">
                                        <b>Rent:</b> {getCurrencySymbol(u.currency)}{u.rent?.toLocaleString()}
                                        {viewCurrency && normalizeCurrencyCode(viewCurrency) !== normalizeCurrencyCode(u.currency || DEFAULT_CURRENCY) && (
                                          <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginLeft: '4px' }}>
                                            (~{format(convert(u.rent || 0, u.currency || DEFAULT_CURRENCY, viewCurrency), viewCurrency)})
                                          </span>
                                        )}
                                      </div>
                                      <div className="staff-card-meta-item">
                                        <b>Deposit:</b> {getCurrencySymbol(u.currency)}{u.deposit?.toLocaleString()}
                                        {viewCurrency && normalizeCurrencyCode(viewCurrency) !== normalizeCurrencyCode(u.currency || DEFAULT_CURRENCY) && (
                                          <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginLeft: '4px' }}>
                                            (~{format(convert(u.deposit || 0, u.currency || DEFAULT_CURRENCY, viewCurrency), viewCurrency)})
                                          </span>
                                        )}
                                      </div>
                                      {u.status === 'vacant' && (
                                        <div className="staff-card-meta-item" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                          <span>Publicly Listed:</span>
                                          <label
                                            className={`toggle ${u.isListedPublicly ? 'on' : ''}`}
                                            onClick={() => {
                                              if (!u.isListedPublicly) {
                                                setUnitToConfirmListing(u);
                                              } else {
                                                handleToggleListing(u.id);
                                              }
                                            }}
                                          >
                                            <span className="track" />
                                          </label>
                                        </div>
                                      )}
                                    </div>
                                    <div className="staff-card-footer" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                      <button
                                        type="button"
                                        className="btn secondary small"
                                        onClick={() => openUnitDetails(u)}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                                      >
                                        <Eye size={13} /> Details
                                      </button>
                                      <button
                                        type="button"
                                        className="btn secondary small"
                                        onClick={() => openUnitEdit(u)}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                                      >
                                        <Edit3 size={13} /> Edit
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
            );
          }))}
      </div>

      {/* Unit Details Modal (Read-Only 360° View) */}
      {viewingUnit && (() => {
        const viewingProp = state.properties.find((p) => p.id === viewingUnit.propertyId);
        const matchedTenant = viewingUnit.tenant
          ? state.tenants.find(
            (t) => t.name === viewingUnit.tenant || (viewingUnit.currentTenantId && t.id === viewingUnit.currentTenantId)
          )
          : null;
        const allPhotos = viewingUnit.images && viewingUnit.images.length > 0
          ? viewingUnit.images
          : viewingUnit.image
            ? [viewingUnit.image]
            : [];

        return (
          <div className="modal-backdrop" onClick={() => setViewingUnit(null)}>
            <div className="modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Building2 size={20} style={{ color: 'var(--brass)' }} />
                    Unit {viewingUnit.unitNumber || viewingUnit.id}
                  </h3>
                  <div className="hint" style={{ marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={12} /> {viewingProp?.name || 'Property'} • {viewingUnit.floor || 'Floor'}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setViewingUnit(null)}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ maxHeight: 'calc(85vh - 130px)', overflowY: 'auto' }}>
                {/* Status Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'var(--paper-soft, #f7f9fa)',
                    border: '1px solid var(--line)',
                    marginBottom: '16px',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      className={`badge ${viewingUnit.status === 'occupied'
                        ? 'green'
                        : viewingUnit.status === 'reserved'
                          ? 'amber'
                          : viewingUnit.status === 'maintenance'
                            ? 'grey'
                            : 'amber'
                        }`}
                      style={{ textTransform: 'capitalize', fontWeight: 600 }}
                    >
                      ● {viewingUnit.status || 'Vacant'}
                    </span>
                    {viewingUnit.isListedPublicly ? (
                      <span className="badge green" style={{ fontSize: '11px' }}>
                        🌐 Publicly Listed
                      </span>
                    ) : (
                      <span className="badge grey" style={{ fontSize: '11px' }}>
                        🔒 Private / Unlisted
                      </span>
                    )}
                    {viewingUnit.isListedPublicly && viewingUnit.status === 'vacant' && (
                      <button
                        type="button"
                        className={`btn small ${viewingUnit.isPopular ? 'brass' : 'secondary'}`}
                        style={{
                          fontSize: '11px',
                          padding: '3px 10px',
                          borderColor: '#d97706',
                          color: viewingUnit.isPopular ? '#ffffff' : '#d97706',
                          background: viewingUnit.isPopular ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : undefined,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          if (isPassActive) {
                            handleToggleUnitPopular(viewingUnit);
                          } else {
                            setUnitToBoost(viewingUnit);
                            const preferred = availableBoostPlans.find((bp) => bp.isPopular) || availableBoostPlans[0];
                            if (preferred) setSelectedBoostPlanId(preferred.id);
                          }
                        }}
                        title={
                          isPassActive
                            ? (viewingUnit.isPopular ? 'Click to turn OFF Popular spotlight' : 'Click to feature as Popular (Included in your active pass)')
                            : 'Get a Spotlight Pass to feature this listing'
                        }
                      >
                        🔥 {viewingUnit.isPopular ? 'Popular (Click to Turn Off)' : (isPassActive ? 'Make Popular (Pass Active)' : 'Boost to Popular')}
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                    Rent: <span style={{ color: 'var(--ledger)' }}>{getCurrencySymbol(viewingUnit.currency || DEFAULT_CURRENCY_SYMBOL)}{viewingUnit.rent?.toLocaleString()}</span> / mo
                  </div>
                </div>

                {/* Key Specifications Grid */}
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                    Specifications
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                    <div style={{ padding: '10px', background: '#FAFAF7', border: '1px solid var(--line)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Unit Type</div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', marginTop: '2px' }}>{viewingUnit.unitType || '2 BHK'}</div>
                    </div>
                    <div style={{ padding: '10px', background: '#FAFAF7', border: '1px solid var(--line)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Floor Level</div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', marginTop: '2px' }}>{viewingUnit.floor || '1st Floor'}</div>
                    </div>
                    <div style={{ padding: '10px', background: '#FAFAF7', border: '1px solid var(--line)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Area (Sq.Ft)</div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', marginTop: '2px' }}>{viewingUnit.areaSqFt ? `${viewingUnit.areaSqFt} sq.ft` : '1,000 sq.ft'}</div>
                    </div>
                    <div style={{ padding: '10px', background: '#FAFAF7', border: '1px solid var(--line)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Furnishing</div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', marginTop: '2px' }}>{viewingUnit.furnishing || 'Semi-Furnished'}</div>
                    </div>
                  </div>
                </div>

                {/* Financial Summary */}
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                    Financial Terms
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ padding: '12px', border: '1px solid var(--line)', borderRadius: '6px', background: 'var(--surface)' }}>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Monthly Rent</div>
                      <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)', marginTop: '2px' }}>
                        {getCurrencySymbol(viewingUnit.currency || DEFAULT_CURRENCY_SYMBOL)}{viewingUnit.rent?.toLocaleString()}
                      </div>
                    </div>
                    <div style={{ padding: '12px', border: '1px solid var(--line)', borderRadius: '6px', background: 'var(--surface)' }}>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Security Deposit Held</div>
                      <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)', marginTop: '2px' }}>
                        {getCurrencySymbol(viewingUnit.currency || DEFAULT_CURRENCY_SYMBOL)}{viewingUnit.deposit?.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Occupant / Tenant Overview */}
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                    Resident & Occupancy
                  </div>
                  <div style={{ padding: '12px', border: '1px solid var(--line)', borderRadius: '6px', background: 'var(--surface)' }}>
                    {viewingUnit.tenant ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--brass-soft, #eef3ef)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brass)', fontWeight: 700 }}>
                              <User size={18} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '14.5px' }}>{viewingUnit.tenant}</div>
                              {matchedTenant?.email && (
                                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Mail size={11} /> {matchedTenant.email}
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => {
                              setViewingUnit(null);
                              navigate('/owner/tenants');
                            }}
                          >
                            View Tenant
                          </button>
                        </div>
                        {matchedTenant?.phone && (
                          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Phone size={12} /> Contact: <b>{matchedTenant.phone}</b>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <span style={{ fontWeight: 600, color: 'var(--ink-soft)' }}>Currently Vacant</span>
                          <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--ink-soft)' }}>
                            No active lease assigned. This unit is available for occupancy.
                          </p>
                        </div>
                        <span className="badge amber">Ready to Lease</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sub-Meters */}
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                    Utility Sub-Meters
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ padding: '10px', background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Zap size={11} /> Electricity Meter
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '13px', marginTop: '2px' }}>
                        {viewingUnit.electricityMeter || <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>Not recorded</span>}
                      </div>
                    </div>
                    <div style={{ padding: '10px', background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Gauge size={11} /> Water Meter
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '13px', marginTop: '2px' }}>
                        {viewingUnit.waterMeter || <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>Not recorded</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Photo Gallery */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                    Unit Photos ({allPhotos.length})
                  </div>
                  {allPhotos.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {allPhotos.map((img, idx) => (
                        <div
                          key={idx}
                          style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            border: '1px solid var(--line)',
                            cursor: 'pointer',
                          }}
                          onClick={() => setPreviewPhotoModal({ title: `Unit ${viewingUnit.unitNumber} — Photo ${idx + 1}`, url: img })}
                          title="Click to view full size"
                        >
                          <img src={img} alt={`Unit photo ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '14px', border: '1px dashed var(--line)', borderRadius: '6px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '12.5px' }}>
                      No photos uploaded for this unit. You can add photos in Edit mode.
                    </div>
                  )}
                </div>
              </div>

              {/* Details Modal Footer */}
              <div className="modal-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap', gap: '8px' }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setViewingUnit(null)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn brass"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => {
                    const u = viewingUnit;
                    setViewingUnit(null);
                    openUnitEdit(u);
                  }}
                >
                  <Edit3 size={14} /> Edit This Unit
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Unit Edit Modal (Dedicated Form Modal) */}
      {editingUnit && (
        <div className="modal-backdrop" onClick={() => setEditingUnit(null)}>
          <div className="modal-card" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Edit3 size={18} style={{ color: 'var(--brass)' }} />
                  Edit Unit {editingUnit.unitNumber || editingUnit.id}
                </h3>
                <div className="hint" style={{ marginTop: '2px' }}>
                  Modify unit specifications, rental rates, and occupancy status
                </div>
              </div>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setEditingUnit(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: 'calc(85vh - 130px)', overflowY: 'auto' }}>
              {/* Unit Identifier & Type */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field">
                  <label>Unit Number / ID *</label>
                  <input
                    type="text"
                    value={editUnitNumber}
                    onChange={(e) => setEditUnitNumber(e.target.value)}
                    placeholder="e.g. 101, A-302"
                  />
                </div>
                <div className="field">
                  <label>Unit Type</label>
                  <select
                    value={editUnitType}
                    onChange={(e) => setEditUnitType(e.target.value)}
                  >
                    {(() => {
                      const parentProp = state.properties.find((p) => p.id === editingUnit.propertyId);
                      return getUnitTypesForProperty(parentProp?.propertyType, editUnitType).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ));
                    })()}
                  </select>
                </div>
              </div>

              {/* Floor Level & Carpet Area */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field">
                  <label>Floor Level</label>
                  <input
                    type="text"
                    value={editFloor}
                    onChange={(e) => setEditFloor(e.target.value)}
                    placeholder="e.g. 1st Floor, 2nd Floor"
                  />
                </div>
                <div className="field">
                  <label>Area (Sq.Ft)</label>
                  <input
                    type="number"
                    value={editAreaSqFt}
                    onChange={(e) => setEditAreaSqFt(Number(e.target.value))}
                    placeholder="1000"
                  />
                </div>
              </div>

              {/* Furnishing Status */}
              <div className="field">
                <label>Furnishing Status</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '4px' }}>
                  {(['Unfurnished', 'Semi-Furnished', 'Fully Furnished'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`btn small ${editFurnishing === f ? 'brass' : 'secondary'}`}
                      style={{ fontSize: '12px', padding: '6px' }}
                      onClick={() => setEditFurnishing(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rent & Deposit */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field">
                  <label>Monthly Rent ({getCurrencySymbol(editingUnit.currency || DEFAULT_CURRENCY_SYMBOL)}) *</label>
                  <input
                    type="number"
                    min="0"
                    value={editRent === 0 ? '' : editRent}
                    placeholder="0"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setEditRent(cleaned === '' ? 0 : Number(cleaned));
                    }}
                  />
                </div>
                <div className="field">
                  <label>Security Deposit ({getCurrencySymbol(editingUnit.currency || DEFAULT_CURRENCY_SYMBOL)})</label>
                  <input
                    type="number"
                    min="0"
                    value={editDeposit === 0 ? '' : editDeposit}
                    placeholder="0"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setEditDeposit(cleaned === '' ? 0 : Number(cleaned));
                    }}
                  />
                </div>
              </div>

              {/* Occupancy Status */}
              <div className="field">
                <label>Occupancy Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                >
                  <option value="vacant">Vacant</option>
                  <option value="occupied">Occupied</option>
                  <option value="reserved">Reserved</option>
                  <option value="maintenance">Under Maintenance</option>
                </select>
                {editStatus === 'vacant' && editingUnit.tenant && (
                  <div style={{ fontSize: '11.5px', color: 'var(--amber)', marginTop: '4px' }}>
                    ⚠️ Setting status to Vacant will detach current resident ({editingUnit.tenant}) and initiate Move-Out verification.
                  </div>
                )}
                {editStatus === 'occupied' && (editingUnit.tenant || (editingUnit.deposit || 0) > 0 || editDeposit > 0) && (
                  <div style={{ marginTop: '8px', padding: '10px 12px', background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: 'var(--radius)' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>
                      Security Deposit Settlement ({getCurrencySymbol(editingUnit.currency || DEFAULT_CURRENCY_SYMBOL)}{(editDeposit || editingUnit.deposit || 0).toLocaleString()}):
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="depositHandling"
                          checked={depositHandlingOption === 'paid_offline'}
                          onChange={() => setDepositHandlingOption('paid_offline')}
                        />
                        <span><b>Deposit Collected Offline</b> (Recorded in financial ledger as paid)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="depositHandling"
                          checked={depositHandlingOption === 'pending'}
                          onChange={() => setDepositHandlingOption('pending')}
                        />
                        <span><b>Deposit Due Later</b> (Remains as pending unpaid invoice for resident)</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Utility Sub-Meters */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field">
                  <label>Electricity Meter ID</label>
                  <input
                    type="text"
                    value={editElectricityMeter}
                    onChange={(e) => setEditElectricityMeter(e.target.value)}
                    placeholder="e.g. EM-8821"
                  />
                </div>
                <div className="field">
                  <label>Water Meter ID</label>
                  <input
                    type="text"
                    value={editWaterMeter}
                    onChange={(e) => setEditWaterMeter(e.target.value)}
                    placeholder="e.g. WM-4019"
                  />
                </div>
              </div>

              {/* Unit Photos */}
              <div className="field">
                <label style={{ fontWeight: 600, fontSize: '13px' }}>Unit Photos ({editUnitImages.length})</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                  {editUnitImages.map((img, imgIdx) => (
                    <div
                      key={imgIdx}
                      style={{
                        position: 'relative',
                        width: '70px',
                        height: '70px',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: '1px solid var(--line)',
                      }}
                    >
                      <img src={img} alt="Unit" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        onClick={() => setEditUnitImages((prev) => prev.filter((_, idx) => idx !== imgIdx))}
                        style={{
                          position: 'absolute',
                          top: '2px',
                          right: '2px',
                          background: 'rgba(220, 53, 69, 0.85)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          fontSize: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                        title="Remove photo"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <label
                    style={{
                      width: '70px',
                      height: '70px',
                      borderRadius: '6px',
                      border: '1px dashed #CBD2D9',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '11px',
                      color: 'var(--ink-soft)',
                      background: 'var(--surface-sunken)',
                    }}
                  >
                    <Camera size={16} style={{ marginBottom: '2px' }} />
                    <span>+ Photo</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const files = e.target.files;
                        if (!files || files.length === 0) return;
                        for (const f of Array.from(files)) {
                          try {
                            const optimized = await uploadOrCompressImage(f, `units/edit/${Date.now()}_${f.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
                            setEditUnitImages((prev) => [...prev, optimized]);
                          } catch (err) {
                            console.warn('Unit photo error:', err);
                          }
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                {(!editingUnit.tenant && editingUnit.status !== 'occupied') && (
                  <button
                    type="button"
                    className="btn secondary small"
                    style={{ color: '#dc3545', borderColor: '#f8d7da', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => handleDeleteUnit(editingUnit.id)}
                    title="Delete this vacant unit"
                  >
                    <Trash2 size={13} /> Delete Unit
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setEditingUnit(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn brass"
                  onClick={handleSaveUnitEdit}
                >
                  Save Unit Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Move-Out & Settlement Confirmation Dialog */}
      {vacateConfirmTarget && (
        <div className="modal-backdrop" onClick={() => setVacateConfirmTarget(null)}>
          <div className="modal-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={18} style={{ color: 'var(--brass)' }} />
                Move-Out & Settlement Confirmation
              </h3>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setVacateConfirmTarget(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ fontSize: '13.5px', lineHeight: '1.5' }}>
              <p style={{ margin: '0 0 12px' }}>
                Unit <b>{vacateConfirmTarget.unit.unitNumber || vacateConfirmTarget.unit.id}</b> currently has an active resident: <b>{vacateConfirmTarget.unit.tenant}</b>.
              </p>
              <div style={{ padding: '12px', background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Original Security Deposit Held:</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', marginTop: '2px' }}>
                  {getCurrencySymbol(vacateConfirmTarget.unit.currency || DEFAULT_CURRENCY_SYMBOL)}
                  {(vacateConfirmTarget.unit.deposit || 0).toLocaleString()}
                </div>
              </div>
              <p style={{ margin: '0 0 8px', color: 'var(--ink-soft)' }}>
                Vacating this unit will terminate the active lease agreement. How would you like to process this move-out?
              </p>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setVacateConfirmTarget(null)}
                disabled={isProcessingUnitAction}
              >
                Cancel
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ color: '#dc3545', borderColor: '#f8d7da' }}
                  onClick={() => executeImmediateVacate(vacateConfirmTarget.updatedData)}
                  disabled={isProcessingUnitAction}
                >
                  Force Vacant Immediately
                </button>
                <button
                  type="button"
                  className="btn brass"
                  onClick={() => {
                    setVacateConfirmTarget(null);
                    setEditingUnit(null);
                    navigate('/owner/vacates');
                  }}
                  disabled={isProcessingUnitAction}
                >
                  Go to Move-Out & Settlement
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Public Listing Modal */}
      {unitToConfirmListing && (
        <div className="modal-backdrop" onClick={() => setUnitToConfirmListing(null)}>
          <div className="modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Publish Unit to Public Landing Page</h3>
              <button type="button" className="btn secondary small" onClick={() => setUnitToConfirmListing(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to list <b>Unit {unitToConfirmListing.unitNumber}</b> ({getCurrencySymbol(unitToConfirmListing.currency)}{unitToConfirmListing.rent.toLocaleString()}/mo) publicly?
              </p>
              <p className="hint" style={{ marginTop: '8px' }}>
                This will immediately display the unit on the public Propithub homepage where prospective tenants can view it.
              </p>
            </div>
            <div
              className="modal-foot"
              style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}
            >
              <button type="button" className="btn secondary btn-mobile-full" onClick={() => setUnitToConfirmListing(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn brass btn-mobile-full"
                onClick={() => {
                  handleToggleListing(unitToConfirmListing.id);
                  setUnitToConfirmListing(null);
                }}
              >
                Confirm Public Listing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Boost to Popular Modal - Standalone On-Demand Boost Plans ($5, $55, $550) */}
      {unitToBoost && (() => {
        const selectedPlan = availableBoostPlans.find((p) => p.id === selectedBoostPlanId) || availableBoostPlans[0];
        const isCurrentlyBoosted = Boolean(
          unitToBoost.isPopular &&
          unitToBoost.popularUntil &&
          new Date(unitToBoost.popularUntil).getTime() > Date.now()
        );
        const daysRemaining = isCurrentlyBoosted
          ? Math.max(1, Math.ceil((new Date(unitToBoost.popularUntil!).getTime() - Date.now()) / 86400000))
          : 0;

        return (
          <div className="modal-backdrop" onClick={() => !isApplyingBoost && setUnitToBoost(null)}>
            <div className="modal-card" style={{ maxWidth: '560px', width: '95vw' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '22px' }}>🔥</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px' }}>Boost Listing to Popular</h3>
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                      Unit {unitToBoost.unitNumber} · Guaranteed top placement on /homes & Landing Page
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn secondary small"
                  disabled={isApplyingBoost}
                  onClick={() => setUnitToBoost(null)}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                  Get an <b>Owner Spotlight Pass</b> to feature all your available listings directly at the top of <b>/homes</b> and the public landing page with a verified <b>🔥 Popular</b> badge for the full duration. You can also toggle individual listings ON or OFF anytime.
                </p>

                {/* If unit is already boosted */}
                {isCurrentlyBoosted && (
                  <div
                    style={{
                      padding: '12px 14px',
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🚫</span> Active Popular Spotlight (Repurchase Locked)
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'var(--ink)', marginTop: '4px' }}>
                      Currently featured until{' '}
                      <b>{new Date(unitToBoost.popularUntil!).toLocaleDateString()} ({daysRemaining} day{daysRemaining === 1 ? '' : 's'} remaining)</b>.
                    </div>
                    <div style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                      You cannot repurchase a boost plan for this unit until the current plan expires.
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <button
                        type="button"
                        className="btn danger small"
                        disabled={isApplyingBoost}
                        onClick={() => handleCancelPopularBoost(unitToBoost)}
                      >
                        <ButtonProcessing loading={isApplyingBoost} loadingText="Cancelling..." defaultText="Cancel Boost Early" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 3 Standalone Boost Plans */}
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)', display: 'block', marginBottom: '10px' }}>
                    Choose a Boost Plan (Admin-Controlled Pricing & Days):
                  </label>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {availableBoostPlans.map((plan) => {
                      const isSelected = selectedPlan?.id === plan.id;
                      return (
                        <div
                          key={plan.id}
                          onClick={() => setSelectedBoostPlanId(plan.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                            padding: '14px 16px',
                            borderRadius: '10px',
                            border: isSelected
                              ? '2px solid #d97706'
                              : '1px solid var(--line)',
                            background: isSelected
                              ? 'rgba(245, 158, 11, 0.08)'
                              : 'var(--surface)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                            <input
                              type="radio"
                              name="boostPlanOption"
                              checked={isSelected}
                              onChange={() => setSelectedBoostPlanId(plan.id)}
                              style={{ cursor: 'pointer', accentColor: '#d97706' }}
                            />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <b style={{ fontSize: '14px', color: 'var(--ink)' }}>{plan.name}</b>
                                {plan.isPopular && (
                                  <span
                                    style={{
                                      fontSize: '10px',
                                      fontWeight: 800,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.04em',
                                      padding: '1px 6px',
                                      borderRadius: '999px',
                                      background: '#d97706',
                                      color: '#fff',
                                    }}
                                  >
                                    ★ Most Popular
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                                {plan.days} Days Duration
                              </div>
                            </div>
                          </div>

                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '18px', fontWeight: 800, color: isSelected ? '#b45309' : 'var(--ink)' }}>
                              ${plan.price}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 600 }}>
                              {plan.days} Days
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div
                className="modal-foot"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '14px 20px',
                  borderTop: '1px solid var(--line)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>
                  {selectedPlan ? (
                    <span>Total: <b style={{ color: 'var(--ink)', fontSize: '15px' }}>${selectedPlan.price}</b> for <b>{selectedPlan.days} days</b></span>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={isApplyingBoost}
                    onClick={() => setUnitToBoost(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn brass"
                    disabled={Boolean(isApplyingBoost || !selectedPlan || isCurrentlyBoosted)}
                    onClick={() => selectedPlan && !isCurrentlyBoosted && handleApplyPopularBoostPlan(unitToBoost, selectedPlan)}
                  >
                    <ButtonProcessing
                      loading={isApplyingBoost}
                      loadingText="Activating..."
                      defaultText={
                        isCurrentlyBoosted
                          ? `Pass Active (${daysRemaining}d left · Locked)`
                          : selectedPlan
                          ? `Pay $${selectedPlan.price} & Activate Pass (${selectedPlan.days}d) 🔥`
                          : 'Select Plan'
                      }
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add Property Modal - 4-Step Enterprise Real Estate Wizard */}
      {isAddPropOpen && (
        <div className="modal-backdrop" onClick={() => setIsAddPropOpen(false)}>
          <div
            className="modal-card prop-wizard-modal"
            style={{ maxWidth: '1200px', width: '95vw', maxHeight: '94vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header & Progress Stepper */}
            <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', padding: '18px 24px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Add New Property & Configure Units</h3>
              </div>
              <button type="button" className="btn secondary small" onClick={() => setIsAddPropOpen(false)}>
                ✕
              </button>
            </div>

            {/* Stepper Tabs Bar */}
            <div
              className="stepper-tabs-bar"
              style={{
                display: 'flex',
                background: '#FAFAF7',
                borderBottom: '1px solid var(--line)',
                padding: '0 24px',
                gap: '8px',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {[
                { step: 1, label: 'Identity & Structure' },
                { step: 2, label: 'Policies & Amenities' },
                { step: 3, label: `Units Builder (${initialUnits.length})` },
                { step: 4, label: 'Photos & Review' },
              ].map((s) => {
                const isActive = modalStep === s.step;
                const isPassed = modalStep > s.step;
                return (
                  <button
                    key={s.step}
                    type="button"
                    onClick={() => {
                      if (s.step > 1) {
                        const errs: Record<string, string> = {};
                        if (!propName.trim()) errs.propName = 'Property name is required';
                        if (!propAddress) errs.propAddress = 'Location is required. Search and select from Google Maps Places.';
                        if (Object.keys(errs).length > 0) {
                          setFieldErrors(errs);
                          showToast('⚠️ Please fill required fields highlighted in red below.');
                          return;
                        }
                      }
                      setModalStep(s.step as any);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      borderBottom: isActive ? '2px solid var(--brass)' : '2px solid transparent',
                      color: isActive ? 'var(--ink)' : isPassed ? 'var(--brass)' : 'var(--ink-soft)',
                      fontWeight: isActive ? 600 : 500,
                      fontSize: '13px',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isPassed && <Check size={14} />}
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* Modal Body - Dynamic by Step */}
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {/* STEP 1: Property Identity & Structure */}
              {modalStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="field">
                    <label style={{ fontWeight: 600, fontSize: '13px', color: fieldErrors.propName ? '#EF4444' : undefined }}>Property Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Maple Heights Residency, Tower A"
                      value={propName}
                      onChange={(e) => {
                        setPropName(e.target.value);
                        if (fieldErrors.propName) {
                          setFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next.propName;
                            return next;
                          });
                        }
                      }}
                      style={{
                        fontSize: '14px',
                        padding: '10px 12px',
                        borderColor: fieldErrors.propName ? '#EF4444' : undefined,
                        boxShadow: fieldErrors.propName ? '0 0 0 1px #EF4444' : undefined,
                      }}
                    />
                    {fieldErrors.propName && (
                      <span style={{ color: '#EF4444', fontSize: '11.5px', marginTop: '4px', display: 'block' }}>
                        ⚠️ {fieldErrors.propName}
                      </span>
                    )}
                  </div>

                  <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                    <div className="field">
                      <label style={{ fontWeight: 600, fontSize: '13px' }}>Country *</label>
                      <select
                        value={propCountry}
                        onChange={(e) => handleCountrySelect(e.target.value)}
                        style={{ padding: '9px 12px' }}
                      >
                        {COUNTRY_OPTIONS.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} ({getCurrencySymbol(c.currency)})
                          </option>
                        ))}
                        <option value="Other">Other Country</option>
                      </select>
                    </div>

                    <div className="field">
                      <label style={{ fontWeight: 600, fontSize: '13px' }}>Property Type</label>
                      <select
                        value={propType}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPropType(val);
                          const defaultStruct = getDefaultPropertyStructure(val);
                          setPropStructure(defaultStruct);
                          const validTypes = getUnitTypesForProperty(val);
                          if (validTypes.length > 0) {
                            setSingleUnitType(validTypes[0]);
                            setBulkUnitType(validTypes[0]);
                          }
                        }}
                        style={{ padding: '9px 12px' }}
                      >
                        <optgroup label="Residential — Multi-Unit">
                          {PROPERTY_TYPE_OPTIONS.filter((o) => o.category === 'residential' && o.defaultStructure === 'multi_unit').map((o) => (
                            <option key={o.label} value={o.label}>{o.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Residential — Single House / Villa">
                          {PROPERTY_TYPE_OPTIONS.filter((o) => o.category === 'residential' && o.defaultStructure === 'single_unit').map((o) => (
                            <option key={o.label} value={o.label}>{o.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Commercial">
                          {PROPERTY_TYPE_OPTIONS.filter((o) => o.category === 'commercial').map((o) => (
                            <option key={o.label} value={o.label}>{o.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Mixed-Use">
                          {PROPERTY_TYPE_OPTIONS.filter((o) => o.category === 'mixed').map((o) => (
                            <option key={o.label} value={o.label}>{o.label}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  </div>

                  {/* Property Structure & Leasing Model Selector */}
                  <div className="field" style={{ background: 'var(--surface-sunken)', padding: '14px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}>
                    <label style={{ fontWeight: 600, fontSize: '13px', display: 'block', marginBottom: '4px' }}>
                      Property Structure & Leasing Model *
                    </label>
                    <div className="hint" style={{ fontSize: '12px', marginBottom: '10px' }}>
                      Choose whether this asset is leased as a whole independent unit or divided into multiple rentable units.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '12px',
                          borderRadius: '8px',
                          border: propStructure === 'single_unit' ? '2px solid var(--brass)' : '1px solid var(--line)',
                          background: propStructure === 'single_unit' ? '#FAF8F5' : '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="radio"
                          name="propStructure"
                          checked={propStructure === 'single_unit'}
                          onChange={() => setPropStructure('single_unit')}
                          style={{ marginTop: '3px' }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px' }}>🏡 Single-Unit Asset</div>
                          <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                            Entire house, standalone 4BHK villa, bungalow, or single shop leased as 1 complete property.
                          </div>
                        </div>
                      </label>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '12px',
                          borderRadius: '8px',
                          border: propStructure === 'multi_unit' ? '2px solid var(--brass)' : '1px solid var(--line)',
                          background: propStructure === 'multi_unit' ? '#FAF8F5' : '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="radio"
                          name="propStructure"
                          checked={propStructure === 'multi_unit'}
                          onChange={() => setPropStructure('multi_unit')}
                          style={{ marginTop: '3px' }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px' }}>🏢 Multi-Unit Complex</div>
                          <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                            Apartment building, gated villa community, or office plaza with multiple leasable units.
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="field">
                    <label style={{ fontWeight: 600, fontSize: '13px' }}>Assigned Property Manager</label>
                    <select
                      value={propAssignedManager}
                      onChange={(e) => setPropAssignedManager(e.target.value)}
                      style={{ padding: '9px 12px' }}
                    >
                      <option value="">None (Direct Owner Operations)</option>
                      {myPropertyManagers.map((m: any) => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.phone ? `(${m.phone})` : m.email ? `(${m.email})` : ''}
                        </option>
                      ))}
                    </select>
                    {myPropertyManagers.length === 0 && (
                      <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '4px' }}>
                        No managers onboarded yet. You can onboard delegated property managers from the <b>Team & Managers</b> page.
                      </div>
                    )}
                  </div>

                  <div className="field">
                    <label style={{ fontWeight: 600, fontSize: '13px', color: fieldErrors.propAddress ? '#EF4444' : undefined }}>Google Maps Places Address *</label>
                    <div className="hint" style={{ marginBottom: '6px', fontSize: '12px' }}>
                      Search and select location to auto-populate city, state, country, and latitude/longitude coordinates.
                    </div>
                    <GooglePlacesAddressPicker
                      onAddressSelect={(addr) => {
                        setPropAddress(addr);
                        if (fieldErrors.propAddress) {
                          setFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next.propAddress;
                            return next;
                          });
                        }
                        if (addr.country) {
                          handleCountrySelect(addr.country);
                        }
                      }}
                    />
                    {fieldErrors.propAddress && (
                      <span style={{ color: '#EF4444', fontSize: '11.5px', marginTop: '4px', display: 'block' }}>
                        ⚠️ {fieldErrors.propAddress}
                      </span>
                    )}
                    {propAddress && (
                      <div
                        style={{
                          marginTop: '8px',
                          padding: '10px 14px',
                          background: 'var(--surface-sunken)',
                          borderRadius: 'var(--radius)',
                          border: '1px solid var(--line)',
                          fontSize: '12.5px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <MapPin size={16} color="var(--ledger)" />
                        <span>
                          <b>Confirmed Location:</b> {propAddress.formattedAddress} ({propAddress.country})
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                    <div className="field">
                      <label style={{ fontWeight: 600, fontSize: '13px' }}>Total Number of Floors</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={propFloors}
                        onChange={(e) => setPropFloors(Math.max(1, Number(e.target.value)))}
                        style={{ padding: '9px 12px' }}
                      />
                    </div>
                    <div className="field">
                      <label style={{ fontWeight: 600, fontSize: '13px' }}>Year Built / Commissioned</label>
                      <input
                        type="number"
                        min="1950"
                        max="2030"
                        placeholder="e.g. 2022"
                        value={propYearBuilt}
                        onChange={(e) => setPropYearBuilt(e.target.value)}
                        style={{ padding: '9px 12px' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Policies, Rules & Amenities */}
              {modalStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Currency Selection - Searchable Dropdown */}
                  <div className="field" style={{ position: 'relative' }}>
                    <label style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span>Operational Rental Currency</span>
                      <span style={{ fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 400 }}>160+ Global Currencies</span>
                    </label>

                    {(() => {
                      const selectedCurrencyObj = GLOBAL_CURRENCIES.find(
                        (c) => c.symbol === propCurrency || c.code === propCurrency || (propCurrency === '$' && c.code === 'USD') || (propCurrency === '₹' && c.code === 'INR') || (propCurrency === '£' && c.code === 'GBP') || (propCurrency === '€' && c.code === 'EUR')
                      ) || GLOBAL_CURRENCIES[0];

                      const filteredCurrencies = GLOBAL_CURRENCIES.filter((c) => {
                        const q = currencySearchQuery.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          c.code.toLowerCase().includes(q) ||
                          c.name.toLowerCase().includes(q) ||
                          c.country.toLowerCase().includes(q) ||
                          c.symbol.toLowerCase().includes(q)
                        );
                      });

                      return (
                        <div>
                          {/* Trigger Button */}
                          <div
                            onClick={() => setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 14px',
                              border: isCurrencyDropdownOpen ? '2px solid var(--primary)' : '1px solid var(--line)',
                              borderRadius: '8px',
                              background: 'var(--surface)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '20px', lineHeight: 1 }}>{selectedCurrencyObj.flag}</span>
                              <div>
                                <span style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--ink)' }}>
                                  {selectedCurrencyObj.code}
                                </span>
                                <span style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginLeft: '8px' }}>
                                  {selectedCurrencyObj.name} ({selectedCurrencyObj.symbol}) • {selectedCurrencyObj.country}
                                </span>
                              </div>
                            </div>
                            <ChevronDown size={18} color="var(--ink-soft)" style={{ transform: isCurrencyDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                          </div>

                          {/* Dropdown with Search */}
                          {isCurrencyDropdownOpen && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                marginTop: '4px',
                                zIndex: 1000,
                                background: 'var(--surface)',
                                border: '1px solid var(--line)',
                                borderRadius: '8px',
                                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2), 0 8px 10px -6px rgba(0,0,0,0.1)',
                                overflow: 'hidden',
                              }}
                            >
                              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)', background: 'var(--surface-sunken)' }}>
                                <div style={{ position: 'relative' }}>
                                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
                                  <input
                                    type="text"
                                    autoFocus
                                    value={currencySearchQuery}
                                    onChange={(e) => setCurrencySearchQuery(e.target.value)}
                                    placeholder="Search by code, country, or currency name (e.g. USD, EUR, INR, Yen, Dirham)..."
                                    style={{
                                      width: '100%',
                                      padding: '8px 10px 8px 30px',
                                      fontSize: '12.5px',
                                      borderRadius: '6px',
                                      border: '1px solid var(--line)',
                                      outline: 'none',
                                      background: 'var(--surface)',
                                      color: 'var(--ink)',
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                              </div>

                              <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                                {filteredCurrencies.length === 0 ? (
                                  <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--ink-soft)' }}>
                                    No currencies found matching "{currencySearchQuery}"
                                  </div>
                                ) : (
                                  filteredCurrencies.map((c) => {
                                    const isSelected = selectedCurrencyObj.code === c.code;
                                    return (
                                      <div
                                        key={c.code}
                                        onClick={() => {
                                          setPropCurrency(c.symbol || c.code);
                                          setIsCurrencyDropdownOpen(false);
                                          setCurrencySearchQuery('');
                                        }}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          padding: '8px 14px',
                                          cursor: 'pointer',
                                          background: isSelected ? 'rgba(47, 93, 80, 0.08)' : 'transparent',
                                          borderBottom: '1px solid var(--line-subtle, rgba(0,0,0,0.04))',
                                        }}
                                        onMouseEnter={(e) => {
                                          if (!isSelected) e.currentTarget.style.background = 'var(--surface-sunken)';
                                        }}
                                        onMouseLeave={(e) => {
                                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                          <span style={{ fontSize: '18px' }}>{c.flag}</span>
                                          <div>
                                            <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--ink)' }}>
                                              {c.code}
                                            </span>
                                            <span style={{ fontSize: '12px', color: 'var(--ink-soft)', marginLeft: '6px' }}>
                                              {c.name} • {c.country}
                                            </span>
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--primary)' }}>
                                            {c.symbol}
                                          </span>
                                          {isSelected && <Check size={16} color="var(--primary)" />}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* House Rules & Lease Defaults */}
                  <div
                    style={{
                      background: '#FAFAF7',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--radius)',
                      padding: '16px',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '10px' }}>
                      Standard House Rules & Lease Policy
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={propRules.petsAllowed}
                          onChange={(e) => setPropRules({ ...propRules, petsAllowed: e.target.checked })}
                        />
                        🐾 Pets Permitted
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={propRules.smokingAllowed}
                          onChange={(e) => setPropRules({ ...propRules, smokingAllowed: e.target.checked })}
                        />
                        🚭 Smoking Permitted
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={propRules.sublettingAllowed}
                          onChange={(e) => setPropRules({ ...propRules, sublettingAllowed: e.target.checked })}
                        />
                        🤝 Subletting Allowed
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                      <div>
                        <label style={{ fontSize: '12px', color: 'var(--ink-soft)', display: 'block', marginBottom: '4px' }}>
                          Standard Minimum Lease Duration
                        </label>
                        <select
                          value={propRules.minLeaseMonths}
                          onChange={(e) => setPropRules({ ...propRules, minLeaseMonths: Number(e.target.value) })}
                          style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                        >
                          <option value={6}>6 Months</option>
                          <option value={11}>11 Months (Standard India)</option>
                          <option value={12}>12 Months (Standard Global)</option>
                          <option value={24}>24 Months</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', color: 'var(--ink-soft)', display: 'block', marginBottom: '4px' }}>
                          Default Notice Period
                        </label>
                        <select
                          value={propRules.noticePeriodDays}
                          onChange={(e) => setPropRules({ ...propRules, noticePeriodDays: Number(e.target.value) })}
                          style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                        >
                          <option value={15}>15 Days</option>
                          <option value={30}>30 Days</option>
                          <option value={60}>60 Days</option>
                          <option value={90}>90 Days</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Building Amenities */}
                  <div className="field">
                    <label style={{ fontWeight: 600, fontSize: '13px' }}>Property Amenities & Perks</label>
                    <div className="hint" style={{ marginBottom: '8px', fontSize: '12px' }}>
                      Select existing amenities or add custom perks unique to this property.
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                      {[
                        '24/7 Security',
                        'Elevator',
                        'Covered Parking',
                        'Gymnasium',
                        'Swimming Pool',
                        'Power Backup',
                        'CCTV Surveillance',
                        'Intercom',
                        'Clubhouse',
                        'EV Charging Station',
                        'Visitor Parking',
                        'Water Softener',
                        'Rooftop Garden',
                        'Solar Water Heater',
                      ].map((am) => {
                        const isSelected = propAmenities.includes(am);
                        const hasPhoto = !!propAmenityPhotos[am];
                        return (
                          <span
                            key={am}
                            className={`badge ${isSelected ? 'green' : 'grey'}`}
                            style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => {
                              setPropAmenities((prev) =>
                                prev.includes(am) ? prev.filter((x) => x !== am) : [...prev, am]
                              );
                            }}
                          >
                            {isSelected ? '✓ ' : '+ '}
                            {hasPhoto && '📷 '}
                            {am}
                          </span>
                        );
                      })}
                      {propAmenities
                        .filter(
                          (a) =>
                            ![
                              '24/7 Security',
                              'Elevator',
                              'Covered Parking',
                              'Gymnasium',
                              'Swimming Pool',
                              'Power Backup',
                              'CCTV Surveillance',
                              'Intercom',
                              'Clubhouse',
                              'EV Charging Station',
                              'Visitor Parking',
                              'Water Softener',
                              'Rooftop Garden',
                              'Solar Water Heater',
                            ].includes(a)
                        )
                        .map((customAm) => {
                          const hasPhoto = !!propAmenityPhotos[customAm];
                          return (
                            <span
                              key={customAm}
                              className="badge green"
                              style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              onClick={() => setPropAmenities((prev) => prev.filter((x) => x !== customAm))}
                            >
                              ✓ {hasPhoto && '📷 '}{customAm} ✕
                            </span>
                          );
                        })}
                    </div>

                    {/* Add Custom Amenity Bar */}
                    <div style={{ display: 'flex', gap: '8px', maxWidth: '460px', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        placeholder="Add custom amenity (e.g. Badminton Court, Co-Working Lounge)"
                        value={customAmenityInput}
                        onChange={(e) => setCustomAmenityInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomAmenity();
                          }
                        }}
                        style={{ padding: '8px 12px', fontSize: '13px', flex: '1 1 200px' }}
                      />
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={handleAddCustomAmenity}
                        disabled={!customAmenityInput.trim()}
                      >
                        + Add Amenity
                      </button>
                    </div>

                    {/* Amenity Photos Showcase & Upload Section */}
                    {propAmenities.length > 0 && (
                      <div style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--line)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                          <div>
                            <label style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Camera size={15} color="var(--ledger)" />
                              Upload Amenity Photos ({Object.keys(propAmenityPhotos).length}/{propAmenities.length} with photos)
                            </label>
                            <div className="hint" style={{ fontSize: '12px', marginTop: '2px' }}>
                              Attach photos for any active amenity (Gymnasium, Pool, Rooftop, etc.) to showcase on the property profile and public directory.
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            justifyContent: 'center',
                            justifyItems: 'center',
                            gap: '12px',
                            marginTop: '10px',
                          }}
                        >
                          {propAmenities.map((am) => {
                            const photo = propAmenityPhotos[am];
                            return (
                              <div
                                key={am}
                                style={{
                                  border: photo ? '1px solid var(--teal-border)' : '1px dashed var(--line-strong)',
                                  background: photo ? 'var(--teal-light)' : 'var(--surface-sunken)',
                                  borderRadius: '8px',
                                  padding: '10px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'space-between',
                                  minHeight: '140px',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                  <span style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--ink)' }}>
                                    {am}
                                  </span>
                                  {photo && (
                                    <span className="badge green" style={{ fontSize: '10px', padding: '1px 5px' }}>
                                      ✓ Photo
                                    </span>
                                  )}
                                </div>

                                {photo ? (
                                  <div style={{ position: 'relative', width: '100%', height: '100px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--line)' }}>
                                    <img src={photo} alt={am} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    <div
                                      style={{
                                        position: 'absolute',
                                        bottom: '4px',
                                        right: '4px',
                                        display: 'flex',
                                        gap: '4px',
                                      }}
                                    >
                                      <label
                                        style={{
                                          background: 'rgba(0,0,0,0.7)',
                                          color: '#fff',
                                          fontSize: '10.5px',
                                          padding: '3px 6px',
                                          borderRadius: '3px',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '3px',
                                        }}
                                        title="Replace photo"
                                      >
                                        Replace
                                        <input
                                          type="file"
                                          accept="image/*"
                                          style={{ display: 'none' }}
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleAmenityPhotoUpload(am, file);
                                          }}
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveAmenityPhoto(am)}
                                        style={{
                                          background: 'rgba(220, 53, 69, 0.85)',
                                          color: '#fff',
                                          border: 'none',
                                          borderRadius: '3px',
                                          padding: '3px 6px',
                                          fontSize: '10.5px',
                                          cursor: 'pointer',
                                        }}
                                        title="Remove photo"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <label
                                    style={{
                                      height: '80px',
                                      border: '1px dashed var(--line-strong)',
                                      borderRadius: '6px',
                                      background: 'var(--surface-sunken)',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      color: 'var(--ink-soft)',
                                      fontSize: '11.5px',
                                      gap: '4px',
                                    }}
                                  >
                                    <Camera size={18} />
                                    <span>+ Upload Photo</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      style={{ display: 'none' }}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleAmenityPhotoUpload(am, file);
                                      }}
                                    />
                                  </label>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 3: Units Setup & Bulk Generator */}
              {modalStep === 3 && (
                propStructure === 'single_unit' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div
                      style={{
                        background: '#FAF8F5',
                        border: '1px solid var(--brass)',
                        borderRadius: 'var(--radius)',
                        padding: '16px 20px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span className="badge brass" style={{ fontSize: '12px' }}>🏡 Single-Unit Asset Mode</span>
                        <span style={{ fontSize: '13.5px', fontWeight: 600 }}>Lease Terms & Property Specifications</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                        This entire property will be leased as a single unified asset (e.g. 4BHK house, luxury villa, standalone commercial facility) without managing internal sub-units.
                      </div>
                    </div>

                    <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                      <div className="field">
                        <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Layout / House Type *</label>
                        <select
                          value={singleUnitType}
                          onChange={(e) => setSingleUnitType(e.target.value)}
                          style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                        >
                          {getUnitTypesForProperty(propType, singleUnitType).map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>

                      <div className="field">
                        <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Property Identifier / Unit Label</label>
                        <input
                          type="text"
                          value={singleUnitLabel}
                          onChange={(e) => setSingleUnitLabel(e.target.value)}
                          placeholder="e.g. Entire House, Main Villa, House #12"
                          style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                        />
                      </div>
                    </div>

                    <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                      <div className="field">
                        <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Expected Monthly Rent ({propCurrency}) *</label>
                        <input
                          type="number"
                          min="0"
                          value={singleUnitRent === 0 ? '' : singleUnitRent}
                          onChange={(e) => setSingleUnitRent(Number(e.target.value))}
                          placeholder="e.g. 35000"
                          style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                        />
                      </div>

                      <div className="field">
                        <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Security Deposit ({propCurrency})</label>
                        <input
                          type="number"
                          min="0"
                          value={singleUnitDeposit === 0 ? '' : singleUnitDeposit}
                          onChange={(e) => setSingleUnitDeposit(Number(e.target.value))}
                          placeholder="e.g. 70000"
                          style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                        />
                      </div>
                    </div>

                    <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                      <div className="field">
                        <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Carpet Area (Sq.Ft)</label>
                        <input
                          type="number"
                          min="0"
                          value={singleUnitAreaSqFt || ''}
                          onChange={(e) => setSingleUnitAreaSqFt(Number(e.target.value))}
                          placeholder="e.g. 2200"
                          style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                        />
                      </div>

                      <div className="field">
                        <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Furnishing State</label>
                        <select
                          value={singleUnitFurnishing}
                          onChange={(e) => setSingleUnitFurnishing(e.target.value as any)}
                          style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                        >
                          <option value="Unfurnished">Unfurnished</option>
                          <option value="Semi-Furnished">Semi-Furnished</option>
                          <option value="Fully Furnished">Fully Furnished</option>
                        </select>
                      </div>
                    </div>

                    <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                      <div className="field">
                        <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Electricity Meter # (Optional)</label>
                        <input
                          type="text"
                          value={singleUnitElectricityMeter}
                          onChange={(e) => setSingleUnitElectricityMeter(e.target.value)}
                          placeholder="e.g. EB-887711"
                          style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                        />
                      </div>

                      <div className="field">
                        <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Water Meter # (Optional)</label>
                        <input
                          type="text"
                          value={singleUnitWaterMeter}
                          onChange={(e) => setSingleUnitWaterMeter(e.target.value)}
                          placeholder="e.g. WTR-4422"
                          style={{ width: '100%', padding: '9px 12px', fontSize: '13px' }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* Stats Bar & Mode Toggles */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#FAFAF7',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius)',
                        padding: '12px 18px',
                        flexWrap: 'wrap',
                        gap: '10px',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>
                          Configured Units: <span style={{ color: 'var(--brass)' }}>{initialUnits.length} Units</span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                          Projected Total Monthly Rent:{' '}
                          <b>
                            {propCurrency}
                            {initialUnits.reduce((sum, u) => sum + (Number(u.rent) || 0), 0).toLocaleString()}
                            {viewCurrency && normalizeCurrencyCode(viewCurrency) !== normalizeCurrencyCode(propCurrency) && (
                              <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontWeight: 500, marginLeft: '6px' }}>
                                (~{format(convert(initialUnits.reduce((sum, u) => sum + (Number(u.rent) || 0), 0), propCurrency, viewCurrency), viewCurrency)})
                              </span>
                            )}
                          </b>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className={`btn ${unitsBuilderMode === 'table' ? 'brass' : 'secondary'} small`}
                          onClick={() => setUnitsBuilderMode('table')}
                        >
                          📋 Units Inventory Table
                        </button>
                        <button
                          type="button"
                          className={`btn ${unitsBuilderMode === 'bulk' ? 'brass' : 'secondary'} small`}
                          onClick={() => setUnitsBuilderMode('bulk')}
                        >
                          ⚡ Bulk Unit Generator
                        </button>
                      </div>
                    </div>

                    {/* Mode: Bulk Generator Box */}
                    {unitsBuilderMode === 'bulk' && (
                      <div
                        style={{
                          background: 'var(--surface-sunken)',
                          border: '1px solid var(--line-strong)',
                          borderRadius: 'var(--radius)',
                          padding: '18px',
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ledger)', marginBottom: '4px' }}>
                          ⚡ Multi-Unit Automated Batch Generator
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '14px' }}>
                          Instantly generate all units across your floors. Existing units in the table will be replaced by this generated batch.
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>From Floor</label>
                            <input
                              type="number"
                              min="1"
                              max="50"
                              value={bulkFloorsStart}
                              onChange={(e) => setBulkFloorsStart(Number(e.target.value))}
                              style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>To Floor</label>
                            <input
                              type="number"
                              min="1"
                              max="50"
                              value={bulkFloorsEnd}
                              onChange={(e) => setBulkFloorsEnd(Number(e.target.value))}
                              style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Units Per Floor</label>
                            <input
                              type="number"
                              min="1"
                              max="20"
                              value={bulkUnitsPerFloor}
                              onChange={(e) => setBulkUnitsPerFloor(Number(e.target.value))}
                              style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Layout / Type</label>
                            <select
                              value={bulkUnitType}
                              onChange={(e) => setBulkUnitType(e.target.value)}
                              style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                            >
                              {getUnitTypesForProperty(propType, bulkUnitType).map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Furnishing</label>
                            <select
                              value={bulkFurnishing}
                              onChange={(e) => setBulkFurnishing(e.target.value as any)}
                              style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                            >
                              <option value="Unfurnished">Unfurnished</option>
                              <option value="Semi-Furnished">Semi-Furnished</option>
                              <option value="Fully Furnished">Fully Furnished</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Carpet Area (Sq Ft)</label>
                            <input
                              type="number"
                              value={bulkAreaSqFt}
                              onChange={(e) => setBulkAreaSqFt(Number(e.target.value))}
                              style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Base Rent ({propCurrency})</label>
                            <input
                              type="number"
                              min="0"
                              value={bulkBaseRent === 0 ? '' : bulkBaseRent}
                              placeholder="0"
                              onWheel={(e) => (e.target as HTMLElement).blur()}
                              onChange={(e) => {
                                const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                                setBulkBaseRent(cleaned === '' ? 0 : Number(cleaned));
                              }}
                              style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Deposit ({propCurrency})</label>
                            <input
                              type="number"
                              min="0"
                              value={bulkBaseDeposit === 0 ? '' : bulkBaseDeposit}
                              placeholder="0"
                              onWheel={(e) => (e.target as HTMLElement).blur()}
                              onChange={(e) => {
                                const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                                setBulkBaseDeposit(cleaned === '' ? 0 : Number(cleaned));
                              }}
                              style={{ width: '100%', padding: '7px 10px', fontSize: '13px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                              Batch Unit Photo (Opt)
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '34px' }}>
                              {bulkDefaultPhoto ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <img
                                    src={bulkDefaultPhoto}
                                    alt="Default layout"
                                    style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover', border: '1px solid var(--line)' }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setBulkDefaultPhoto(null)}
                                    style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '11px', cursor: 'pointer', padding: 0 }}
                                  >
                                    ✕ Remove
                                  </button>
                                </div>
                              ) : (
                                <label
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '6px 8px',
                                    background: '#fff',
                                    border: '1px dashed #CBD2D9',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '11.5px',
                                    color: 'var(--ink-soft)',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  <Camera size={13} />
                                  <span>+ Attach Photo</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        try {
                                          const optimized = await uploadOrCompressImage(file, `units/bulk/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
                                          setBulkDefaultPhoto(optimized);
                                        } catch (err) {
                                          console.warn('Bulk photo error:', err);
                                        }
                                      }
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => setUnitsBuilderMode('table')}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn brass small"
                            onClick={handleGenerateBulkUnits}
                          >
                            ⚡ Generate {(Math.max(1, bulkFloorsEnd) - Math.max(1, bulkFloorsStart) + 1) * bulkUnitsPerFloor} Units Now
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Detailed Units Inventory Table with Horizontal Scrolling */}
                    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                      <div
                        style={{
                          overflowX: 'auto',
                          overflowY: 'auto',
                          maxHeight: '360px',
                          WebkitOverflowScrolling: 'touch',
                        }}
                      >
                        <table style={{ width: '100%', minWidth: '1060px', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                          <thead>
                            <tr style={{ background: '#FAFAF7', borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                              <th style={{ padding: '10px 12px', width: '85px', fontWeight: 600 }}>UNIT #</th>
                              <th style={{ padding: '10px 12px', width: '90px', fontWeight: 600 }}>PHOTO</th>
                              <th style={{ padding: '10px 12px', width: '125px', fontWeight: 600 }}>LAYOUT / TYPE</th>
                              <th style={{ padding: '10px 12px', width: '120px', fontWeight: 600 }}>FLOOR</th>
                              <th style={{ padding: '10px 12px', width: '90px', fontWeight: 600 }}>SQ. FT</th>
                              <th style={{ padding: '10px 12px', width: '155px', fontWeight: 600 }}>FURNISHING</th>
                              <th style={{ padding: '10px 12px', width: '115px', fontWeight: 600 }}>RENT ({propCurrency})</th>
                              <th style={{ padding: '10px 12px', width: '115px', fontWeight: 600 }}>DEPOSIT ({propCurrency})</th>
                              <th style={{ padding: '10px 12px', width: '125px', fontWeight: 600 }}>METER # (OPT)</th>
                              <th style={{ padding: '10px 12px', width: '45px', textAlign: 'center', fontWeight: 600 }}>✕</th>
                            </tr>
                          </thead>
                          <tbody>
                            {initialUnits.length === 0 ? (
                              <tr>
                                <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--ink-soft)' }}>
                                  No units configured yet. Click "+ Add Individual Unit" or use the "⚡ Bulk Unit Generator" above.
                                </td>
                              </tr>
                            ) : (
                              initialUnits.map((u, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                                  <td style={{ padding: '6px 8px' }}>
                                    <input
                                      type="text"
                                      value={u.unitNumber}
                                      placeholder="101"
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setInitialUnits((prev) =>
                                          prev.map((item, idx) => (idx === i ? { ...item, unitNumber: val } : item))
                                        );
                                      }}
                                      style={{ width: '100%', padding: '6px 8px', fontSize: '12.5px', borderRadius: '4px' }}
                                    />
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    {u.images && u.images.length > 0 ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <div
                                          style={{
                                            position: 'relative',
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '4px',
                                            overflow: 'hidden',
                                            border: '1px solid var(--line)',
                                            flexShrink: 0,
                                            cursor: 'pointer',
                                          }}
                                          onClick={() => setPreviewPhotoModal({ title: `Unit ${u.unitNumber} Photo`, url: u.images![0] })}
                                          title="Click to view full photo"
                                        >
                                          <img src={u.images[0]} alt={`Unit ${u.unitNumber}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveUnitPhoto(i, 0)}
                                          style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '12px', cursor: 'pointer', padding: 0 }}
                                          title="Remove photo"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ) : (
                                      <label
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '3px',
                                          padding: '5px 7px',
                                          background: '#fff',
                                          border: '1px dashed #CBD2D9',
                                          borderRadius: '4px',
                                          cursor: 'pointer',
                                          fontSize: '11px',
                                          color: 'var(--ink-soft)',
                                          whiteSpace: 'nowrap',
                                        }}
                                        title="Upload unit photo"
                                      >
                                        <Camera size={12} />
                                        <span>+ Photo</span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          style={{ display: 'none' }}
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleUnitPhotoUpload(i, file);
                                          }}
                                        />
                                      </label>
                                    )}
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <select
                                      value={u.unitType}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setInitialUnits((prev) =>
                                          prev.map((item, idx) => (idx === i ? { ...item, unitType: val } : item))
                                        );
                                      }}
                                      style={{ width: '100%', padding: '6px 8px', fontSize: '12.5px', borderRadius: '4px' }}
                                    >
                                      {getUnitTypesForProperty(propType, u.unitType).map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <input
                                      type="text"
                                      value={u.floor}
                                      placeholder="1st Floor"
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setInitialUnits((prev) =>
                                          prev.map((item, idx) => (idx === i ? { ...item, floor: val } : item))
                                        );
                                      }}
                                      style={{ width: '100%', padding: '6px 8px', fontSize: '12.5px', borderRadius: '4px' }}
                                    />
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <input
                                      type="number"
                                      value={u.areaSqFt}
                                      placeholder="1100"
                                      onChange={(e) => {
                                        const val = Number(e.target.value);
                                        setInitialUnits((prev) =>
                                          prev.map((item, idx) => (idx === i ? { ...item, areaSqFt: val } : item))
                                        );
                                      }}
                                      style={{ width: '100%', padding: '6px 8px', fontSize: '12.5px', borderRadius: '4px' }}
                                    />
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <select
                                      value={u.furnishing}
                                      onChange={(e) => {
                                        const val = e.target.value as any;
                                        setInitialUnits((prev) =>
                                          prev.map((item, idx) => (idx === i ? { ...item, furnishing: val } : item))
                                        );
                                      }}
                                      style={{ width: '100%', padding: '6px 8px', fontSize: '12.5px', borderRadius: '4px' }}
                                    >
                                      <option value="Unfurnished">Unfurnished</option>
                                      <option value="Semi-Furnished">Semi-Furnished</option>
                                      <option value="Fully Furnished">Fully Furnished</option>
                                    </select>
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <input
                                      type="number"
                                      min="0"
                                      value={u.rent === 0 ? '' : u.rent}
                                      placeholder="Rent"
                                      onWheel={(e) => (e.target as HTMLElement).blur()}
                                      onChange={(e) => {
                                        const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                                        const val = cleaned === '' ? 0 : Number(cleaned);
                                        setInitialUnits((prev) =>
                                          prev.map((item, idx) => (idx === i ? { ...item, rent: val } : item))
                                        );
                                      }}
                                      style={{ width: '100%', padding: '6px 8px', fontSize: '12.5px', borderRadius: '4px' }}
                                    />
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <input
                                      type="number"
                                      min="0"
                                      value={u.deposit === 0 ? '' : u.deposit}
                                      placeholder="Deposit"
                                      onWheel={(e) => (e.target as HTMLElement).blur()}
                                      onChange={(e) => {
                                        const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                                        const val = cleaned === '' ? 0 : Number(cleaned);
                                        setInitialUnits((prev) =>
                                          prev.map((item, idx) => (idx === i ? { ...item, deposit: val } : item))
                                        );
                                      }}
                                      style={{ width: '100%', padding: '6px 8px', fontSize: '12.5px', borderRadius: '4px' }}
                                    />
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <input
                                      type="text"
                                      value={u.electricityMeter || ''}
                                      placeholder="MTR-990"
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setInitialUnits((prev) =>
                                          prev.map((item, idx) => (idx === i ? { ...item, electricityMeter: val } : item))
                                        );
                                      }}
                                      style={{ width: '100%', padding: '6px 8px', fontSize: '12.5px', borderRadius: '4px' }}
                                    />
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      onClick={() => setInitialUnits((prev) => prev.filter((_, idx) => idx !== i))}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--danger)',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        padding: '4px',
                                      }}
                                      title="Delete unit row"
                                    >
                                      ✕
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ padding: '10px 14px', background: '#FAFAF7', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn secondary small"
                          onClick={() =>
                            setInitialUnits([
                              ...initialUnits,
                              {
                                unitNumber: `${100 + initialUnits.length + 1}`,
                                unitType: '2 BHK',
                                floor: '1st Floor',
                                areaSqFt: 0,
                                furnishing: 'Semi-Furnished',
                                rent: bulkBaseRent || 0,
                                deposit: bulkBaseDeposit || 0,
                                currency: propCurrency,
                              },
                            ])
                          }
                        >
                          + Add Individual Unit
                        </button>
                        <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                          You can adjust rent, deposit, and listing status anytime per unit.
                        </span>
                      </div>
                    </div>
                  </div>
                )
              )}

              {/* STEP 4: Media, Photos & Review */}
              {modalStep === 4 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Photo Upload Gallery */}
                  <div className="field">
                    <label style={{ fontWeight: 600, fontSize: '13px' }}>Property Photos Gallery</label>
                    <div className="hint" style={{ marginBottom: '8px', fontSize: '12px' }}>
                      Upload exterior, lobby, or amenity photos. Click the star icon to designate the cover photo for public listings.
                    </div>
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '24px 20px',
                        border: '2px dashed var(--line-strong)',
                        borderRadius: 'var(--radius)',
                        background: 'var(--surface-sunken)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        textAlign: 'center',
                        gap: '8px',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--teal-primary)';
                        e.currentTarget.style.background = 'var(--surface)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--line-strong)';
                        e.currentTarget.style.background = 'var(--surface-sunken)';
                      }}
                    >
                      <div
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          background: 'var(--teal-light)',
                          color: 'var(--teal-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Upload size={22} />
                      </div>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)' }}>
                        Click to upload photos <span style={{ fontWeight: 400, color: 'var(--ink-soft)' }}>or drag and drop</span>
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                        Select multiple PNG, JPG, or WEBP photos (up to 10MB each)
                      </div>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleImageUpload}
                      />
                    </label>

                    {propImages.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '12px' }}>
                        {propImages.map((img, idx) => {
                          const isCover = coverPhotoIndex === idx;
                          return (
                            <div
                              key={idx}
                              style={{
                                position: 'relative',
                                width: '100px',
                                height: '100px',
                                borderRadius: '6px',
                                overflow: 'hidden',
                                border: isCover ? '2px solid var(--brass)' : '1px solid var(--line)',
                                boxShadow: isCover ? '0 0 0 2px rgba(197, 160, 89, 0.25)' : 'none',
                              }}
                            >
                              <img
                                src={img}
                                alt="Property preview"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                              {isCover && (
                                <span
                                  style={{
                                    position: 'absolute',
                                    bottom: '0',
                                    left: '0',
                                    right: '0',
                                    background: 'var(--brass)',
                                    color: '#fff',
                                    fontSize: '10px',
                                    textAlign: 'center',
                                    padding: '2px 0',
                                    fontWeight: 600,
                                  }}
                                >
                                  COVER
                                </span>
                              )}
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '4px',
                                  right: '4px',
                                  display: 'flex',
                                  gap: '4px',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => setCoverPhotoIndex(idx)}
                                  title="Set as Cover Photo"
                                  style={{
                                    background: isCover ? 'var(--brass)' : 'rgba(0,0,0,0.6)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '3px',
                                    width: '20px',
                                    height: '20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  ★
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPropImages((prev) => prev.filter((_, i) => i !== idx))}
                                  title="Delete photo"
                                  style={{
                                    background: 'rgba(220, 53, 69, 0.85)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '3px',
                                    width: '20px',
                                    height: '20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Amenity Photos Showcase in Review */}
                  {Object.keys(propAmenityPhotos).length > 0 && (
                    <div
                      style={{
                        background: '#FAFAF7',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius)',
                        padding: '16px',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '13.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Camera size={15} color="var(--ledger)" />
                        <span>Amenity Photos Showcase ({Object.keys(propAmenityPhotos).length} amenities with photos)</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {Object.entries(propAmenityPhotos).map(([name, photo]) => (
                          <div
                            key={name}
                            style={{
                              position: 'relative',
                              width: '110px',
                              height: '80px',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              border: '1px solid var(--line)',
                              cursor: 'pointer',
                            }}
                            onClick={() => setPreviewPhotoModal({ title: name, url: photo })}
                            title="Click to view full photo"
                          >
                            <img src={photo} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <span
                              style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                background: 'rgba(0,0,0,0.7)',
                                color: '#fff',
                                fontSize: '10px',
                                padding: '2px 4px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Configured Units Showcase in Review */}
                  {propStructure === 'single_unit' ? (
                    <div
                      style={{
                        background: '#FAFAF7',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius)',
                        padding: '16px',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '13.5px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Building2 size={15} color="var(--ledger)" />
                        <span>Single-Unit Asset Configuration</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px', fontSize: '12.5px' }}>
                        <div><b>Layout:</b> {singleUnitType}</div>
                        <div><b>Identifier:</b> {singleUnitLabel || 'Entire House'}</div>
                        <div><b>Monthly Rent:</b> {propCurrency}{singleUnitRent.toLocaleString()}/mo</div>
                        <div><b>Deposit:</b> {propCurrency}{singleUnitDeposit.toLocaleString()}</div>
                        <div><b>Area:</b> {singleUnitAreaSqFt} sq.ft</div>
                        <div><b>Furnishing:</b> {singleUnitFurnishing}</div>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        background: '#FAFAF7',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius)',
                        padding: '16px',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '13.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Building2 size={15} color="var(--ledger)" />
                          <span>Configured Units ({initialUnits.length} units total)</span>
                        </div>
                        <span className="badge green" style={{ fontSize: '11px' }}>
                          {initialUnits.filter((u) => u.images && u.images.length > 0).length} with photos
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', maxHeight: '180px', overflowY: 'auto' }}>
                        {initialUnits.map((u, uIdx) => (
                          <div
                            key={uIdx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              background: '#fff',
                              border: '1px solid var(--line)',
                              borderRadius: '6px',
                              padding: '6px 10px',
                              fontSize: '12px',
                            }}
                          >
                            {u.images && u.images.length > 0 ? (
                              <img
                                src={u.images[0]}
                                alt={`Unit ${u.unitNumber}`}
                                style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }}
                                onClick={() => setPreviewPhotoModal({ title: `Unit ${u.unitNumber}`, url: u.images![0] })}
                                title="Click to view full photo"
                              />
                            ) : (
                              <div style={{ width: '32px', height: '32px', background: '#F0F2F5', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)' }}>
                                <Camera size={14} />
                              </div>
                            )}
                            <div>
                              <div style={{ fontWeight: 600 }}>Unit {u.unitNumber} ({u.unitType})</div>
                              <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>
                                {propCurrency}{Number(u.rent).toLocaleString()}/mo • {u.floor}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Comprehensive Review Card */}
                  <div
                    style={{
                      background: '#FAFAF7',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--radius)',
                      padding: '18px',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--ink)', marginBottom: '12px' }}>
                      Property Verification & Summary
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', fontSize: '13px' }}>
                      <div>
                        <span style={{ color: 'var(--ink-soft)' }}>Property Name:</span>{' '}
                        <b>{propName || 'Unnamed Property'}</b>
                      </div>
                      <div>
                        <span style={{ color: 'var(--ink-soft)' }}>Property Type:</span> <b>{propType}</b>
                      </div>
                      <div>
                        <span style={{ color: 'var(--ink-soft)' }}>Country:</span>{' '}
                        <b>{propCountry || propAddress?.country || 'India'}</b>
                      </div>
                      <div>
                        <span style={{ color: 'var(--ink-soft)' }}>Address:</span>{' '}
                        <span>{propAddress?.formattedAddress || 'No address chosen'}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--ink-soft)' }}>Assigned Manager:</span>{' '}
                        <b>
                          {myPropertyManagers.find((m: any) => m.id === propAssignedManager)?.name ||
                            'Owner Managed'}
                        </b>
                      </div>
                      <div>
                        <span style={{ color: 'var(--ink-soft)' }}>Total Units:</span>{' '}
                        <b style={{ color: 'var(--brass)' }}>{initialUnits.length} Units</b>
                      </div>
                      <div>
                        <span style={{ color: 'var(--ink-soft)' }}>Projected Monthly Rent:</span>{' '}
                        <b>
                          <CurrencyAmount amount={initialUnits.reduce((sum, u) => sum + (Number(u.rent) || 0), 0)} currency={propCurrency} />
                        </b>
                      </div>
                      <div>
                        <span style={{ color: 'var(--ink-soft)' }}>Active Amenities:</span>{' '}
                        <span>{propAmenities.join(', ') || 'None selected'}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--ink-soft)' }}>Lease Policy:</span>{' '}
                        <span>
                          Min {propRules.minLeaseMonths}m lease • {propRules.noticePeriodDays}d notice •{' '}
                          {propRules.petsAllowed ? 'Pets OK' : 'No Pets'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Stepper Foot Controls */}
            <div
              className="modal-foot"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 24px',
                borderTop: '1px solid var(--line)',
                background: '#FAFAF7',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                onClick={() => {
                  if (modalStep > 1) {
                    setModalStep((prev) => (prev - 1) as any);
                  } else {
                    setIsAddPropOpen(false);
                  }
                }}
              >
                {modalStep === 1 ? 'Cancel' : '← Back'}
              </button>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {modalStep < 4 ? (
                  <button
                    type="button"
                    className="btn brass btn-mobile-full"
                    onClick={() => {
                      if (modalStep === 1) {
                        const errs: Record<string, string> = {};
                        if (!propName.trim()) {
                          errs.propName = 'Property name is required';
                        }
                        if (!propAddress) {
                          errs.propAddress = 'Location is required. Search and select from Google Maps Places.';
                        }
                        if (Object.keys(errs).length > 0) {
                          setFieldErrors(errs);
                          showToast('⚠️ Please fill required fields highlighted in red below.');
                          return;
                        }
                      }
                      if (modalStep === 3 && propStructure === 'multi_unit' && initialUnits.length === 0) {
                        showToast('Please add at least one unit before proceeding.');
                        return;
                      }
                      setModalStep((prev) => (prev + 1) as any);
                    }}
                  >
                    Next Step →
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`btn brass ${isSubmittingProp ? 'btn-processing' : ''}`}
                    onClick={handleCreateProperty}
                    disabled={isSubmittingProp}
                    style={{ fontWeight: 600 }}
                  >
                    <ButtonProcessing
                      loading={isSubmittingProp}
                      loadingText="Creating Property..."
                      defaultText={propStructure === 'single_unit' ? '✓ Create Single Property' : `✓ Create Property & ${initialUnits.length} Units`}
                    />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Unit to Existing Property Modal */}
      {addUnitProperty && (
        <div className="modal-backdrop" onClick={() => setAddUnitProperty(null)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>Add Unit to {addUnitProperty.name}</h3>
              </div>
              <button type="button" className="btn secondary small" onClick={() => setAddUnitProperty(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Unit Number / Label</label>
                <input
                  type="text"
                  placeholder="e.g. 302 or Penthouse B"
                  value={newUnitNumber}
                  onChange={(e) => setNewUnitNumber(e.target.value)}
                />
              </div>
              <div className="grid grid-2" style={{ gap: '12px' }}>
                <div className="field">
                  <label>Type</label>
                  <select value={newUnitType} onChange={(e) => setNewUnitType(e.target.value)}>
                    {getUnitTypesForProperty(addUnitProperty.propertyType, newUnitType).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Floor</label>
                  <input
                    type="text"
                    placeholder="e.g. 3rd Floor"
                    value={newUnitFloor}
                    onChange={(e) => setNewUnitFloor(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-2" style={{ gap: '12px' }}>
                <div className="field">
                  <label>Monthly Rent ({getCurrencySymbol(addUnitProperty.currency || DEFAULT_CURRENCY_SYMBOL)})</label>
                  <input
                    type="number"
                    min="0"
                    value={newUnitRent === 0 ? '' : newUnitRent}
                    placeholder="0"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setNewUnitRent(cleaned === '' ? 0 : Number(cleaned));
                    }}
                  />
                </div>
                <div className="field">
                  <label>Security Deposit ({getCurrencySymbol(addUnitProperty.currency || DEFAULT_CURRENCY_SYMBOL)})</label>
                  <input
                    type="number"
                    min="0"
                    value={newUnitDeposit === 0 ? '' : newUnitDeposit}
                    placeholder="0"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setNewUnitDeposit(cleaned === '' ? 0 : Number(cleaned));
                    }}
                  />
                </div>
              </div>
              <div className="field" style={{ marginTop: '12px' }}>
                <label style={{ fontWeight: 600, fontSize: '13px' }}>Unit Photos ({newUnitImages.length})</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                  {newUnitImages.map((img, imgIdx) => (
                    <div
                      key={imgIdx}
                      style={{
                        position: 'relative',
                        width: '64px',
                        height: '64px',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: '1px solid var(--line)',
                      }}
                    >
                      <img src={img} alt="Unit" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        onClick={() => setNewUnitImages((prev) => prev.filter((_, idx) => idx !== imgIdx))}
                        style={{
                          position: 'absolute',
                          top: '2px',
                          right: '2px',
                          background: 'rgba(220, 53, 69, 0.85)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '50%',
                          width: '16px',
                          height: '16px',
                          fontSize: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <label
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '6px',
                      border: '1px dashed #CBD2D9',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '11px',
                      color: 'var(--ink-soft)',
                      background: '#FAFAF7',
                    }}
                  >
                    <Camera size={16} style={{ marginBottom: '2px' }} />
                    <span>+ Photo</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const files = e.target.files;
                        if (!files || files.length === 0) return;
                        for (const f of Array.from(files)) {
                          try {
                            const optimized = await uploadOrCompressImage(f, `units/new/${Date.now()}_${f.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
                            setNewUnitImages((prev) => [...prev, optimized]);
                          } catch (err) {
                            console.warn('Unit photo error:', err);
                          }
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button type="button" className="btn secondary btn-mobile-full" onClick={() => setAddUnitProperty(null)}>
                Cancel
              </button>
              <button type="button" className="btn brass btn-mobile-full" onClick={handleAddUnitToProperty}>
                <Plus size={14} /> Add Unit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox / Preview Modal */}
      {previewPhotoModal && (
        <div className="modal-backdrop" onClick={() => setPreviewPhotoModal(null)} style={{ zIndex: 9999 }}>
          <div
            className="modal-card"
            style={{ maxWidth: '640px', width: '90%', padding: 0, overflow: 'hidden', background: '#111', borderRadius: '12px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 18px',
                background: '#1c1c1e',
                color: '#fff',
                borderBottom: '1px solid #333',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '14px' }}>{previewPhotoModal.title}</span>
              <button
                type="button"
                onClick={() => setPreviewPhotoModal(null)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer', padding: '2px 8px' }}
              >
                ✕
              </button>
            </div>
            <div style={{ maxHeight: '75vh', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px', background: '#000' }}>
              <img
                src={previewPhotoModal.url}
                alt={previewPhotoModal.title}
                style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '6px' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Plan Limit Paywall Modal */}
      {limitModalResource && (
        <PlanLimitModal
          resourceType={limitModalResource}
          currentUsage={usage[limitModalResource].used}
          limit={usage[limitModalResource].max}
          planName={currentPlanName}
          onClose={closeLimitModal}
          onUpgrade={() => navigate('/owner/subscription')}
        />
      )}

      {/* Dynamic Mobile Floating Action Button */}
      <FloatingActionButton
        label="Add Property"
        icon={Plus}
        onClick={() => checkAndRun('properties', () => setIsAddPropOpen(true))}
        disabled={!isPlanActive}
        mobileOnly={true}
      />

      {/* Direct Onboarding / Bulk Leasing Modal */}
      {activeOnboardConfig.isOpen && (
        <OnboardResidentModal
          isOpen={activeOnboardConfig.isOpen}
          onClose={() => setActiveOnboardConfig({ isOpen: false })}
          preselectedPropertyId={activeOnboardConfig.propertyId}
          preselectedUnitId={activeOnboardConfig.unitId}
          preselectedUnitIds={activeOnboardConfig.unitIds}
          onSuccess={(tenantName, unitLabel) => {
            showToast(`✓ Tenancy setup initiated for ${tenantName} (${unitLabel}).`);
            setActiveOnboardConfig({ isOpen: false });
            if (activeOnboardConfig.propertyId) {
              setSelectedBulkUnits((prev) => ({ ...prev, [activeOnboardConfig.propertyId!]: [] }));
            }
          }}
        />
      )}
    </div>
  );
};
