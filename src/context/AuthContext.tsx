import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole, TenantRecord, OwnerSettings } from '../types';
import { loadState, saveState, AppState, INITIAL_STATE, saveTrialPolicyCache, loadCachedTrialDays } from '../lib/store';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions, isFirebaseConfigured, createSecondaryAuthUser } from '../lib/firebase';

export interface LoginResult {
  success: boolean;
  role?: UserRole;
  error?: string;
}

export interface ProvisionUserParams {
  name: string;
  email: string;
  password: string;
  role: 'manager' | 'staff' | 'tenant';
  phone?: string;
  ownerId: string;
  ownerName?: string;
}

export interface ProvisionUserResult {
  success: boolean;
  uid?: string;
  error?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  role: UserRole;
  login: (email: string, password?: string, portalType?: 'standard' | 'admin') => Promise<LoginResult>;
  registerOwner: (name: string, email: string, password: string, country: string, phone?: string) => Promise<boolean>;
  registerTenant: (name: string, email: string, password: string, phone?: string, country?: string) => Promise<boolean>;
  provisionUser: (params: ProvisionUserParams) => Promise<ProvisionUserResult>;
  updateUserProfile: (updates: Partial<UserProfile>) => Promise<void>;
  logout: () => void;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  checkDeletionEligibility: () => Promise<{ canDelete: boolean; reasons: string[] }>;
  requestAccountDeletion: () => Promise<{ success: boolean; scheduledAt?: string; error?: string }>;
  cancelAccountDeletion: () => Promise<{ success: boolean; error?: string }>;
  isOwnerPlanActive: (ownerId?: string) => boolean;
  updateAdminEmail: (newEmail: string, currentPassword: string) => Promise<{ success: boolean; error?: string }>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appState, setAppState] = useState<AppState>(loadState);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const savedUserId = localStorage.getItem('keystone_active_user_id');
    if (savedUserId) {
      const fresh = loadState();
      const found = fresh.users.find((u) => u.id === savedUserId);
      if (found) {
        if (found.phone === '+91 98000 11111' || found.phone === '+91 98000 00000') {
          return { ...found, phone: '' };
        }
        return found;
      }
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(isFirebaseConfigured);

  const getLiveTrialDays = async (): Promise<number> => {
    const cached = loadCachedTrialDays();
    if (isFirebaseConfigured) {
      try {
        const snap = await getDoc(doc(db, 'platformConfig', 'trialPolicy'));
        if (snap.exists() && typeof snap.data().defaultTrialDays === 'number') {
          const days = Math.max(0, snap.data().defaultTrialDays);
          saveTrialPolicyCache(days);
          setAppState((prev) => ({ ...prev, defaultTrialDays: days }));
          return days;
        }
      } catch (err) {
        console.warn('Failed to load live trial policy:', err);
      }
    }
    if (cached !== null) {
      return cached;
    }
    return typeof appState.defaultTrialDays === 'number' ? appState.defaultTrialDays : 14;
  };

  // Live real-time sync for platform trial policy and owner settings in AuthContext
  useEffect(() => {
    if (!isFirebaseConfigured) return;

    // Immediate query on mount for instant zero-latency sync
    getDoc(doc(db, 'platformConfig', 'trialPolicy')).then((snap) => {
      if (snap.exists() && typeof snap.data().defaultTrialDays === 'number') {
        const days = Math.max(0, snap.data().defaultTrialDays);
        saveTrialPolicyCache(days);
        setAppState((prev) => ({ ...prev, defaultTrialDays: days }));
      }
    }).catch(console.warn);

    const unsubTrial = onSnapshot(doc(db, 'platformConfig', 'trialPolicy'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (typeof data.defaultTrialDays === 'number') {
          const days = Math.max(0, data.defaultTrialDays);
          saveTrialPolicyCache(days);
          setAppState((prev) => ({
            ...prev,
            defaultTrialDays: days,
          }));
        }
      }
    }, (err) => {
      console.warn('AuthContext trialPolicy listener warning:', err);
    });

    const unsubOwners = onSnapshot(collection(db, 'owners'), (snapshot) => {
      const nextSettings: Record<string, OwnerSettings> = {};
      const currentDays = loadCachedTrialDays() ?? 14;
      snapshot.forEach((d) => {
        const data = d.data() as OwnerSettings;
        if (currentDays === 0 && data.planStatus === 'trialing' && !data.subscriptionEndsAt) {
          nextSettings[d.id] = { ...data, ownerId: d.id, planStatus: 'expired', trialEndsAt: null };
        } else {
          nextSettings[d.id] = data;
        }
      });
      setAppState((prev) => ({
        ...prev,
        ownerSettings: {
          ...prev.ownerSettings,
          ...nextSettings,
        },
      }));
    }, (err) => {
      console.warn('AuthContext owners listener warning:', err);
    });

    return () => {
      unsubTrial();
      unsubOwners();
    };
  }, []);

  // Sync auth state if live Firebase is configured
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsLoading(false);
      return;
    }

    let unsubUserDoc: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      let resolvedUser: UserProfile | null = null;

      if (fbUser) {
        try {
          unsubUserDoc = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
            if (snap.exists()) {
              const uData = snap.data() as UserProfile;
              setCurrentUser((prev) => ({
                ...(prev || {}),
                ...uData,
                id: fbUser.uid,
              } as UserProfile));
              if (uData.role) {
                localStorage.setItem('keystone_active_user_role', uData.role);
              }
            }
          });

          const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data() as UserProfile;
            resolvedUser = data;
            if (data.role === 'owner') {
              try {
                const ownerDoc = await getDoc(doc(db, 'owners', data.id));
                const currentTrialDays = await getLiveTrialDays();
                if (ownerDoc.exists()) {
                  const oData = ownerDoc.data() as any;
                  // Self-heal: If trial policy was set to 0d (no trial) and owner was trialing without an active paid subscription, enforce expiry
                  if (currentTrialDays === 0 && oData.planStatus === 'trialing' && !oData.subscriptionEndsAt) {
                    oData.planStatus = 'expired';
                    oData.trialEndsAt = null;
                    await setDoc(doc(db, 'owners', data.id), { planStatus: 'expired', trialEndsAt: null }, { merge: true });
                  }
                  appState.ownerSettings[data.id] = oData;
                  setAppState((prev) => ({
                    ...prev,
                    ownerSettings: { ...prev.ownerSettings, [data.id]: oData },
                  }));
                } else if (!appState.ownerSettings[data.id]) {
                  const isTrial = currentTrialDays > 0;
                  const newSettings = {
                    ownerId: data.id,
                    planId: isTrial ? 'free_trial' : (data.plan?.toLowerCase() || 'starter'),
                    planName: data.plan || (isTrial ? 'Free Trial' : 'Starter'),
                    planStatus: (isTrial ? 'trialing' : 'expired') as 'trialing' | 'expired',
                    trialEndsAt: isTrial ? new Date(Date.now() + currentTrialDays * 86400000).toISOString() : null,
                    subscriptionEndsAt: null,
                    paymentMethods: appState.ownerPaymentMethods || INITIAL_STATE.ownerPaymentMethods,
                    lateFeeConfig: appState.lateFeeSettings || INITIAL_STATE.lateFeeSettings,
                    taxConfig: appState.taxSettings || INITIAL_STATE.taxSettings,
                  };
                  appState.ownerSettings[data.id] = newSettings;
                  setAppState((prev) => ({
                    ...prev,
                    ownerSettings: { ...prev.ownerSettings, [data.id]: newSettings },
                  }));
                  await setDoc(doc(db, 'owners', data.id), newSettings, { merge: true });
                }
              } catch (oErr) {
                console.warn('Firestore owner doc load warning:', oErr);
              }
            }
          }
        } catch (err) {
          console.warn('Failed to load profile from Firestore:', err);
        }
      }

      // If Firestore didn't provide a user, check local storage session
      if (!resolvedUser) {
        const savedUserId = localStorage.getItem('keystone_active_user_id');
        const fresh = loadState();
        if (savedUserId) {
          resolvedUser = fresh.users.find((u) => u.id === savedUserId) || null;
        }
        if (!resolvedUser && fbUser?.email) {
          resolvedUser = fresh.users.find((u) => u.email.toLowerCase() === fbUser.email?.toLowerCase()) || null;
        }
      }

      if (resolvedUser) {
        setCurrentUser(resolvedUser);
        localStorage.setItem('keystone_active_user_id', resolvedUser.id);
        localStorage.setItem('keystone_active_user_role', resolvedUser.role);
      } else {
        setCurrentUser(null);
        localStorage.removeItem('keystone_active_user_id');
        localStorage.removeItem('keystone_active_user_role');
      }
      setIsLoading(false);
    });

    return () => {
      if (unsubUserDoc) unsubUserDoc();
      unsubscribe();
    };
  }, []);

  const cachedRole = (typeof window !== 'undefined' ? localStorage.getItem('keystone_active_user_role') : null) as UserRole | null;
  const currentRole: UserRole = currentUser?.role || cachedRole || 'owner';

  const login = async (
    email: string,
    password?: string,
    portalType: 'standard' | 'admin' = 'standard'
  ): Promise<LoginResult> => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      return { success: false, error: 'Please enter your registered email address.' };
    }
    if (!password || password.trim().length === 0) {
      return { success: false, error: 'Please enter your password to sign in.' };
    }

    // 1. Attempt Live Firebase Auth if configured
    if (isFirebaseConfigured) {
      try {
        const cred = await signInWithEmailAndPassword(auth, trimmed, password);
        const userDoc = await getDoc(doc(db, 'users', cred.user.uid));

        // If admin logs in for the first time in Firebase, auto-provision their superadmin Firestore profile
        if (!userDoc.exists() && (portalType === 'admin' || trimmed === 'admin@gmail.com')) {
          const adminProfile: UserProfile = {
            id: cred.user.uid,
            email: trimmed,
            displayName: cred.user.displayName || 'Propithub Platform Admin',
            role: 'superadmin',
            phone: '',
            status: 'active',
            createdAt: new Date().toISOString(),
          };
          await setDoc(doc(db, 'users', cred.user.uid), adminProfile);
          setCurrentUser(adminProfile);
          localStorage.setItem('keystone_active_user_id', adminProfile.id);
          return { success: true, role: 'superadmin' };
        }

        // If owner logs in for the first time in Firebase without a Firestore record
        if (!userDoc.exists() && portalType === 'standard') {
          const trialDays = await getLiveTrialDays();
          const isTrial = trialDays > 0;
          const initialPlan = isTrial ? 'Free Trial' : 'Starter';
          const initialPlanId = isTrial ? 'free_trial' : 'starter';
          const ownerProfile: UserProfile = {
            id: cred.user.uid,
            email: trimmed,
            displayName: cred.user.displayName || trimmed.split('@')[0],
            role: 'owner',
            phone: cred.user.phoneNumber || '',
            status: 'active',
            createdAt: new Date().toISOString(),
            plan: isTrial ? initialPlan : 'Starter (Subscription Required)',
          };
          await setDoc(doc(db, 'users', cred.user.uid), ownerProfile);
          const newSettings = {
            ownerId: cred.user.uid,
            planId: initialPlanId,
            planName: initialPlan,
            planStatus: (isTrial ? 'trialing' : 'expired') as 'trialing' | 'expired',
            trialEndsAt: isTrial ? new Date(Date.now() + trialDays * 86400000).toISOString() : null,
            subscriptionEndsAt: null,
            paymentMethods: {
              cash: { enabled: true },
              upi: { enabled: true, upiId: '', qrImage: null },
              bank: { enabled: true, accountName: ownerProfile.displayName, accountNumber: '', country: 'India', routing: '' },
              paypal: { enabled: false, email: '' },
              razorpay: { enabled: false, keyId: '', keySecret: '' },
              stripe: { enabled: false, pubKey: '', secretKey: '' },
            },
            lateFeeConfig: { enabled: true, graceDays: 5, type: 'percent' as const, value: 2, cap: 1000 },
            taxConfig: { label: 'Service Tax', percent: 0 },
          };
          await setDoc(doc(db, 'owners', cred.user.uid), newSettings, { merge: true });
          setAppState((prev) => ({
            ...prev,
            ownerSettings: { ...prev.ownerSettings, [cred.user.uid]: newSettings as any },
          }));
          setCurrentUser(ownerProfile);
          localStorage.setItem('keystone_active_user_id', ownerProfile.id);
          localStorage.setItem('keystone_active_user_role', ownerProfile.role);
          return { success: true, role: 'owner' };
        }

        if (userDoc.exists()) {
          const profile = userDoc.data() as UserProfile;
          if (portalType === 'standard' && profile.role === 'superadmin') {
            await signOut(auth);
            return {
              success: false,
              error: 'Access denied: Administrators must sign in through the Admin Portal.',
            };
          }
          if (portalType === 'admin' && profile.role !== 'superadmin') {
            await signOut(auth);
            return {
              success: false,
              error: 'Access denied: This portal is strictly for Superadmins.',
            };
          }
          if (profile.role === 'owner' && !appState.ownerSettings[profile.id]) {
            const dynamicTrialDays = await getLiveTrialDays();
            const isTrial = dynamicTrialDays > 0;
            const newSettings = {
              ownerId: profile.id,
              planId: isTrial ? 'free_trial' : (profile.plan?.toLowerCase() || 'starter'),
              planName: profile.plan || (isTrial ? 'Free Trial' : 'Starter'),
              planStatus: (isTrial ? 'trialing' : 'expired') as 'trialing' | 'expired',
              trialEndsAt: isTrial ? new Date(Date.now() + dynamicTrialDays * 86400000).toISOString() : null,
              subscriptionEndsAt: null,
              paymentMethods: appState.ownerPaymentMethods || INITIAL_STATE.ownerPaymentMethods,
              lateFeeConfig: appState.lateFeeSettings || INITIAL_STATE.lateFeeSettings,
              taxConfig: appState.taxSettings || INITIAL_STATE.taxSettings,
            };
            appState.ownerSettings[profile.id] = newSettings;
            setAppState((prev) => ({
              ...prev,
              ownerSettings: { ...prev.ownerSettings, [profile.id]: newSettings },
            }));
          }
          setCurrentUser(profile);
          localStorage.setItem('keystone_active_user_id', profile.id);
          localStorage.setItem('keystone_active_user_role', profile.role);
          return { success: true, role: profile.role };
        }
      } catch (fbErr: any) {
        console.warn('Firebase auth attempt failed:', fbErr?.message);
        const code = fbErr?.code || '';
        if (
          code === 'auth/wrong-password' ||
          code === 'auth/invalid-credential' ||
          code === 'auth/user-not-found' ||
          code === 'auth/user-disabled' ||
          code === 'auth/too-many-requests'
        ) {
          return {
            success: false,
            error:
              code === 'auth/wrong-password' || code === 'auth/invalid-credential'
                ? 'Invalid email or password. Please verify your credentials.'
                : code === 'auth/user-not-found'
                ? 'No account registered with this email address. Please check your credentials or register.'
                : code === 'auth/user-disabled'
                ? 'This user account has been disabled. Please contact platform support.'
                : code === 'auth/too-many-requests'
                ? 'Too many failed login attempts. Please wait a few moments or reset your password.'
                : fbErr?.message || 'Authentication failed. Please verify your credentials.',
          };
        }
      }
    }

    // 2. Production Local Store fallback
    const freshState = loadState();
    const found = freshState.users.find((u) => u.email.toLowerCase() === trimmed);
    if (!found) {
      return {
        success: false,
        error: 'No account registered with this email address. Please check your credentials or register as an owner.',
      };
    }

    // Check role-portal boundary
    if (portalType === 'standard' && found.role === 'superadmin') {
      return {
        success: false,
        error: 'Access denied: Administrators must sign in through the dedicated Admin Portal.',
      };
    }

    if (portalType === 'admin' && found.role !== 'superadmin') {
      return {
        success: false,
        error: 'Access denied: You cannot login here. This portal is strictly for Superadmins.',
      };
    }

    if (found.tempPassword && password !== found.tempPassword) {
      return {
        success: false,
        error: 'Invalid password. Please check the credentials provided by the property owner.',
      };
    }

    setAppState(freshState);
    setCurrentUser(found);
    localStorage.setItem('keystone_active_user_id', found.id);
    localStorage.setItem('keystone_active_user_role', found.role);
    return { success: true, role: found.role };
  };

  const registerOwner = async (
    name: string,
    email: string,
    password: string,
    _country: string,
    phone?: string
  ): Promise<boolean> => {
    const cleanEmail = email.trim().toLowerCase();
    const newOwnerId = `usr_owner_${Date.now()}`;
    const trialDays = await getLiveTrialDays();
    const isTrial = trialDays > 0;
    const initialPlan = isTrial ? 'Free Trial' : 'Starter';
    const initialPlanId = isTrial ? 'free_trial' : 'starter';
    const cleanPhone = phone?.trim() || '';
    const newOwner: UserProfile = {
      id: newOwnerId,
      email: cleanEmail,
      displayName: name.trim(),
      role: 'owner',
      phone: cleanPhone,
      status: 'active',
      createdAt: new Date().toISOString(),
      plan: isTrial ? initialPlan : 'Starter (Subscription Required)',
    };

    const newSettings = {
      ownerId: newOwnerId,
      planId: initialPlanId,
      planName: initialPlan,
      planStatus: (isTrial ? 'trialing' : 'expired') as 'trialing' | 'expired',
      trialEndsAt: isTrial ? new Date(Date.now() + trialDays * 86400000).toISOString() : null,
      isInitialTrial: isTrial,
      subscriptionEndsAt: null,
      paymentMethods: {
        cash: { enabled: true },
        upi: { enabled: true, upiId: '', qrImage: null },
        bank: { enabled: true, accountName: name, accountNumber: '', country: 'India', routing: '' },
        paypal: { enabled: false, email: '' },
        razorpay: { enabled: false, keyId: '', keySecret: '' },
        stripe: { enabled: false, pubKey: '', secretKey: '' },
      },
      lateFeeConfig: { enabled: true, graceDays: 5, type: 'percent' as const, value: 2, cap: 1000 },
      taxConfig: { label: 'Service Tax', percent: 0 },
    };

    // 1. Sync to Firebase if configured
    if (isFirebaseConfigured) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await updateProfile(cred.user, { displayName: name.trim() });
        newOwner.id = cred.user.uid;
        newSettings.ownerId = cred.user.uid;
        await setDoc(doc(db, 'users', cred.user.uid), newOwner);
        await setDoc(doc(db, 'owners', cred.user.uid), newSettings);
      } catch (err: any) {
        console.warn('Firebase registration failed, using local registration:', err?.message);
      }
    }

    const freshPersisted = loadState();
    const updatedState = {
      ...freshPersisted,
      users: [...(freshPersisted.users || []).filter((u) => u.id !== newOwner.id), newOwner],
      ownerSettings: {
        ...(freshPersisted.ownerSettings || {}),
        [newOwner.id]: newSettings,
      },
    };

    setAppState(updatedState);
    saveState(updatedState);
    setCurrentUser(newOwner);
    localStorage.setItem('keystone_active_user_id', newOwner.id);
    localStorage.setItem('keystone_active_user_role', newOwner.role);
    return true;
  };

  const registerTenant = async (
    name: string,
    email: string,
    password: string,
    phone?: string,
    _country?: string
  ): Promise<boolean> => {
    const cleanEmail = email.trim().toLowerCase();
    let newTenantId = `usr_tenant_${Date.now()}`;
    const cleanPhone = phone?.trim() || '';
    const newTenantUser: UserProfile = {
      id: newTenantId,
      email: cleanEmail,
      displayName: name.trim(),
      role: 'tenant',
      phone: cleanPhone,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    const newTenantRecord: TenantRecord = {
      id: newTenantId,
      name: name.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      unit: 'Unassigned',
      owner: 'Unassigned',
      ownerId: '',
      leaseStart: '',
      leaseEnd: '',
      rent: 0,
      deposit: 0,
      rating: 5.0,
      unitsRented: [],
      history: [],
      kycDocuments: [],
    };

    if (isFirebaseConfigured) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await updateProfile(cred.user, { displayName: name.trim() });
        newTenantUser.id = cred.user.uid;
        newTenantRecord.id = cred.user.uid;
        newTenantId = cred.user.uid;
        await setDoc(doc(db, 'users', cred.user.uid), newTenantUser);
        await setDoc(doc(db, 'tenants', cred.user.uid), newTenantRecord);
      } catch (err: any) {
        console.warn('Firebase tenant registration failed, using local registration:', err?.message);
      }
    }

    const freshPersisted = loadState();
    const updatedState = {
      ...freshPersisted,
      users: [...(freshPersisted.users || []).filter((u) => u.email.toLowerCase() !== cleanEmail), newTenantUser],
      tenants: [...(freshPersisted.tenants || []).filter((t) => t.email.toLowerCase() !== cleanEmail), newTenantRecord],
    };

    setAppState(updatedState);
    saveState(updatedState);
    setCurrentUser(newTenantUser);
    localStorage.setItem('keystone_active_user_id', newTenantUser.id);
    localStorage.setItem('keystone_active_user_role', newTenantUser.role);
    return true;
  };

  const provisionUser = async (params: ProvisionUserParams): Promise<ProvisionUserResult> => {
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanName = params.name.trim();
    let uid = `usr_${params.role}_${Date.now()}`;

    if (isFirebaseConfigured) {
      try {
        uid = await createSecondaryAuthUser(cleanEmail, params.password);
      } catch (err: any) {
        console.warn('Firebase secondary user creation warning:', err?.message);
        if (err?.code === 'auth/email-already-in-use') {
          return { success: false, error: 'An account with this email address already exists.' };
        }
        if (err?.code === 'auth/weak-password') {
          return { success: false, error: 'Password should be at least 6 characters long.' };
        }
      }
    }

    const newUserProfile: UserProfile = {
      id: uid,
      email: cleanEmail,
      displayName: cleanName,
      role: params.role,
      phone: params.phone?.trim() || '',
      ownerId: params.ownerId,
      ownerName: params.ownerName || 'Property Owner',
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'users', uid), newUserProfile, { merge: true });
        // Write a claim request document — triggers `setClaimsOnRequest` Cloud Function
        // which calls auth.setCustomUserClaims(uid, { role, ownerId }) server-side.
        // This is the standard Firestore-trigger pattern for setting custom claims
        // from client-side provisioning flows where the caller must preserve their session.
        await setDoc(doc(db, 'userClaimRequests', uid), {
          uid,
          role: params.role,
          ownerId: params.ownerId || null,
          requestedAt: new Date().toISOString(),
          processed: false,
        });
      } catch (err: any) {
        console.error('Firestore setDoc user profile error:', err);
        return {
          success: false,
          error: err?.message || 'Database error: Failed to provision user profile. Please check permissions.',
        };
      }
    }

    setAppState((prev) => {
      const nextUsers = [...prev.users.filter((u) => u.id !== uid && u.email.toLowerCase() !== cleanEmail), newUserProfile];
      const updated = { ...prev, users: nextUsers };
      saveState(updated);
      return updated;
    });

    return { success: true, uid };
  };

  const logout = async () => {
    if (isFirebaseConfigured) {
      try {
        await signOut(auth);
      } catch (err) {
        console.error('Firebase signout error:', err);
      }
    }
    setCurrentUser(null);
    localStorage.removeItem('keystone_active_user_id');
    localStorage.removeItem('keystone_active_user_role');
    sessionStorage.removeItem('propithub_admin_pin_verified');
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    if (!isFirebaseConfigured) {
      return { success: false, error: 'Password reset requires Firebase to be configured. Contact your platform administrator.' };
    }
    if (!email.trim()) {
      return { success: false, error: 'Please enter your email address.' };
    }
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      return { success: true };
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        return { success: false, error: 'No account found with this email address.' };
      }
      if (err.code === 'auth/invalid-email') {
        return { success: false, error: 'Please enter a valid email address.' };
      }
      return { success: false, error: err.message || 'Failed to send password reset email.' };
    }
  };

  const updateUserProfile = async (updates: Partial<UserProfile>): Promise<void> => {
    if (!currentUser) return;
    const updatedUser: UserProfile = {
      ...currentUser,
      ...updates,
    };
    setCurrentUser(updatedUser);

    // Update in appState and persist
    const fresh = loadState();
    const userIndex = fresh.users.findIndex((u) => u.id === currentUser.id);
    if (userIndex !== -1) {
      fresh.users[userIndex] = updatedUser;
    } else {
      fresh.users.push(updatedUser);
    }
    saveState(fresh);
    setAppState(fresh);

    // If live Firebase is configured, sync to Firestore
    if (isFirebaseConfigured && auth.currentUser) {
      try {
        await setDoc(doc(db, 'users', currentUser.id), updates, { merge: true });
      } catch (e) {
        console.warn('Firebase profile sync error:', e);
      }
    }
  };

  const isOwnerPlanActive = (ownerId?: string): boolean => {
    const targetOwner = ownerId || currentUser?.id;
    if (!targetOwner) return false;

    // Superadmin is never paywalled
    if (currentUser?.role === 'superadmin') return true;

    // Check if owner has an active/paid platform invoice
    const hasPaidInvoice = (appState.platformInvoices || []).some(
      (inv) =>
        inv.status === 'paid' &&
        (inv.ownerId === targetOwner || (currentUser?.email && inv.ownerEmail?.toLowerCase() === currentUser.email.toLowerCase())) &&
        (!inv.periodEnd || new Date(inv.periodEnd).getTime() > Date.now())
    );
    if (hasPaidInvoice) return true;

    // Check specific ownerSettings
    const settings = appState.ownerSettings[targetOwner];

    if (settings) {
      if (settings.planStatus === 'active') {
        if (!settings.subscriptionEndsAt) return true;
        return new Date(settings.subscriptionEndsAt).getTime() > Date.now();
      }
      if (settings.planStatus === 'trialing') {
        const cached = loadCachedTrialDays();
        const dynamicTrialDays = typeof appState.defaultTrialDays === 'number'
          ? appState.defaultTrialDays
          : (cached !== null ? cached : 14);
        if (dynamicTrialDays === 0) return false;
        if (!settings.trialEndsAt) return true;
        return new Date(settings.trialEndsAt).getTime() > Date.now();
      }
      if (settings.planStatus === 'expired' || settings.planStatus === 'past_due') {
        return false;
      }
    }

    // Dynamic global trial policy configured by Superadmin:
    // If no explicit settings record exists yet, newly authenticated/registered owners
    // dynamically inherit the admin's trial duration policy.
    const cached = loadCachedTrialDays();
    const dynamicTrialDays = typeof appState.defaultTrialDays === 'number'
      ? appState.defaultTrialDays
      : (cached !== null ? cached : 14);
    return dynamicTrialDays > 0;
  };

  const checkDeletionEligibility = async (): Promise<{ canDelete: boolean; reasons: string[] }> => {
    if (!currentUser) return { canDelete: false, reasons: ['Not authenticated.'] };
    const reasons: string[] = [];
    const uid = currentUser.id;
    const role = currentUser.role;

    if (role === 'superadmin') {
      return { canDelete: false, reasons: ['Superadmin platform console accounts cannot be deleted.'] };
    }

    if (isFirebaseConfigured) {
      try {
        const checkFn = httpsCallable<any, { canDelete: boolean; reasons: string[] }>(
          functions,
          'checkAccountDeletionEligibility'
        );
        const res = await checkFn({});
        if (res.data) return res.data;
      } catch (err: any) {
        console.warn('Fallback to client query for checkDeletionEligibility:', err?.message || err);
      }
    }

    // If client query via Firebase was attempted, also ensure local AppState is verified
    try {
      if (isFirebaseConfigured) {
        if (role === 'owner') {
          const agSnap = await getDocs(
            query(
              collection(db, 'agreements'),
              where('ownerId', '==', uid),
              where('status', 'in', ['active', 'pending_approval', 'pending_deposit'])
            )
          );
          if (!agSnap.empty) {
            reasons.push(`You have ${agSnap.size} active or pending lease(s). Active tenancies must be terminated or concluded first.`);
          }
          const depSnap = await getDocs(
            query(
              collection(db, 'depositSettlements'),
              where('ownerId', '==', uid),
              where('status', 'in', ['settlement_pending', 'awaiting_tenant_approval'])
            )
          );
          if (!depSnap.empty) {
            reasons.push(`You have ${depSnap.size} unsettled deposit refund(s). Please settle deposit disbursements first.`);
          }
        } else if (role === 'tenant') {
          const agSnap = await getDocs(
            query(
              collection(db, 'agreements'),
              where('tenantId', '==', uid),
              where('status', 'in', ['active', 'pending_approval', 'pending_deposit'])
            )
          );
          if (!agSnap.empty) {
            reasons.push('You have an active or pending lease. Please initiate a move-out notice first.');
          }
          const invSnap = await getDocs(
            query(
              collection(db, 'invoices'),
              where('tenantId', '==', uid),
              where('status', 'in', ['sent', 'overdue', 'pending_confirmation'])
            )
          );
          if (!invSnap.empty) {
            reasons.push(`You have ${invSnap.size} unpaid invoice(s). Settle rental and utility balance to $0.00 first.`);
          }
        } else if (role === 'staff') {
          const tSnap = await getDocs(
            query(
              collection(db, 'tickets'),
              where('assignedStaffId', '==', uid),
              where('status', 'in', ['assigned', 'in_progress'])
            )
          );
          if (!tSnap.empty) {
            reasons.push(`You have ${tSnap.size} active repair ticket(s) assigned.`);
          }
        } else if (role === 'manager') {
          const pSnap = await getDocs(
            query(collection(db, 'properties'), where('assignedManagerId', '==', uid))
          );
          if (!pSnap.empty) {
            reasons.push('You are assigned to manage properties. Please ask the property owner to unassign you first.');
          }
        }
      } else {
        // Local AppState check for offline / demo mode
        if (role === 'owner') {
          const activeLeases = (appState.agreements || []).filter(
            (a) => a.ownerId === uid && ['active', 'pending_approval', 'pending_deposit'].includes(a.status)
          );
          if (activeLeases.length > 0) {
            reasons.push(`You have ${activeLeases.length} active or pending lease(s). Active tenancies must be terminated first.`);
          }
          const unsettledDeposits = (appState.depositSettlements || []).filter(
            (d) => d.ownerId === uid && ['settlement_pending', 'awaiting_tenant_approval'].includes(d.status)
          );
          if (unsettledDeposits.length > 0) {
            reasons.push(`You have ${unsettledDeposits.length} unsettled deposit refund(s). Please settle deposit disbursements first.`);
          }
        } else if (role === 'tenant') {
          const activeLeases = (appState.agreements || []).filter(
            (a) => a.tenantId === uid && ['active', 'pending_approval', 'pending_deposit'].includes(a.status)
          );
          if (activeLeases.length > 0) {
            reasons.push('You have an active lease. Please conclude your tenancy first.');
          }
          const unpaidInvs = (appState.invoices || []).filter(
            (i) => i.tenantId === uid && ['sent', 'overdue', 'pending_confirmation'].includes(i.status)
          );
          if (unpaidInvs.length > 0) {
            reasons.push(`You have ${unpaidInvs.length} unpaid invoice(s). Settle balances to $0.00 first.`);
          }
        } else if (role === 'staff') {
          const activeTickets = (appState.tickets || []).filter(
            (t) => t.assignedStaffId === uid && ['assigned', 'in_progress'].includes(t.status)
          );
          if (activeTickets.length > 0) {
            reasons.push(`You have ${activeTickets.length} active repair ticket(s) assigned.`);
          }
        } else if (role === 'manager') {
          const assignedProps = (appState.properties || []).filter((p) => p.assignedManagerId === uid);
          if (assignedProps.length > 0) {
            reasons.push('You are assigned to manage properties. Please ask the owner to unassign you first.');
          }
        }
      }
    } catch (e: any) {
      console.warn('Client query error for deletion eligibility:', e?.message || e);
    }

    return { canDelete: reasons.length === 0, reasons };
  };

  const requestAccountDeletion = async (): Promise<{ success: boolean; scheduledAt?: string; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    const scheduledTime = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    let scheduledAt = scheduledTime;

    if (isFirebaseConfigured) {
      try {
        const reqFn = httpsCallable<any, { success: boolean; scheduledPermanentDeletionAt: string }>(
          functions,
          'requestAccountDeletion'
        );
        const res = await reqFn({});
        if (res.data?.scheduledPermanentDeletionAt) {
          scheduledAt = res.data.scheduledPermanentDeletionAt;
        }
      } catch (err: any) {
        console.warn('Fallback direct firestore set for deletion request:', err?.message || err);
      }

      try {
        await setDoc(
          doc(db, 'users', currentUser.id),
          {
            deletionStatus: 'pending_deletion',
            deletionRequestedAt: new Date().toISOString(),
            scheduledPermanentDeletionAt: scheduledAt,
          },
          { merge: true }
        );
      } catch (e) {
        console.warn('Firestore setDoc deletion error:', e);
      }
    }

    // Always update currentUser in memory and persist in local storage
    const updatedUser: UserProfile = {
      ...currentUser,
      deletionStatus: 'pending_deletion',
      deletionRequestedAt: new Date().toISOString(),
      scheduledPermanentDeletionAt: scheduledAt,
    };
    setCurrentUser(updatedUser);

    const fresh = loadState();
    const idx = fresh.users.findIndex((u) => u.id === currentUser.id);
    if (idx !== -1) {
      fresh.users[idx] = updatedUser;
    }
    saveState(fresh);
    setAppState(fresh);

    return { success: true, scheduledAt };
  };

  const cancelAccountDeletion = async (): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };

    if (isFirebaseConfigured) {
      try {
        const cancelFn = httpsCallable<any, { success: boolean }>(functions, 'cancelAccountDeletion');
        await cancelFn({});
      } catch (err: any) {
        console.warn('Fallback direct cancel:', err?.message || err);
      }

      try {
        await setDoc(
          doc(db, 'users', currentUser.id),
          {
            deletionStatus: 'none',
            deletionRequestedAt: null,
            scheduledPermanentDeletionAt: null,
          },
          { merge: true }
        );
      } catch (e) {
        console.warn('Firestore setDoc cancel error:', e);
      }
    }

    // Always update in memory and persist in local storage
    const restoredUser: UserProfile = {
      ...currentUser,
      deletionStatus: 'none',
      deletionRequestedAt: null,
      scheduledPermanentDeletionAt: null,
    };
    setCurrentUser(restoredUser);

    const fresh = loadState();
    const idx = fresh.users.findIndex((u) => u.id === currentUser.id);
    if (idx !== -1) {
      fresh.users[idx] = restoredUser;
    }
    saveState(fresh);
    setAppState(fresh);

    return { success: true };
  };

  const updateAdminEmail = async (newEmail: string, currentPassword: string): Promise<{ success: boolean; error?: string }> => {
    const cleanNewEmail = newEmail.trim().toLowerCase();
    if (!cleanNewEmail || !cleanNewEmail.includes('@') || !cleanNewEmail.includes('.')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (!currentUser || currentUser.role !== 'superadmin') {
      return { success: false, error: 'Only administrators can perform this action.' };
    }
    if (cleanNewEmail === currentUser.email.toLowerCase()) {
      return { success: false, error: 'New email must be different from your current email.' };
    }
    if (!currentPassword) {
      return { success: false, error: 'Please enter your current password to verify your identity.' };
    }

    // 1. Firebase Auth re-authentication and update if configured
    if (isFirebaseConfigured && auth.currentUser) {
      try {
        const credential = EmailAuthProvider.credential(auth.currentUser.email || currentUser.email, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
        await updateEmail(auth.currentUser, cleanNewEmail);
      } catch (err: any) {
        console.error('Firebase updateEmail error:', err);
        if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
          return { success: false, error: 'Incorrect current password. Please try again.' };
        }
        if (err.code === 'auth/email-already-in-use') {
          return { success: false, error: 'This email is already registered to another account.' };
        }
        if (err.code === 'auth/invalid-email') {
          return { success: false, error: 'The email address format is invalid.' };
        }
        if (err.code === 'auth/requires-recent-login') {
          return { success: false, error: 'For security reasons, please log out and log back in before changing your email.' };
        }
        return { success: false, error: err.message || 'Failed to update email with authentication service.' };
      }

      // Update Firestore user document
      try {
        await setDoc(doc(db, 'users', currentUser.id), { email: cleanNewEmail }, { merge: true });
      } catch (e) {
        console.warn('Firestore update admin email error:', e);
      }
    }

    // 2. Update local state and persistence
    const updatedUser: UserProfile = {
      ...currentUser,
      email: cleanNewEmail,
    };
    setCurrentUser(updatedUser);

    const fresh = loadState();
    const idx = fresh.users.findIndex((u) => u.id === currentUser.id || u.role === 'superadmin');
    if (idx !== -1) {
      fresh.users[idx] = { ...fresh.users[idx], email: cleanNewEmail };
    } else {
      fresh.users.push(updatedUser);
    }
    saveState(fresh);
    setAppState(fresh);

    return { success: true };
  };

  return (
    <AuthContext.Provider
      value={{
        user: currentUser,
        role: currentRole,
        login,
        registerOwner,
        registerTenant,
        provisionUser,
        updateUserProfile,
        logout,
        resetPassword,
        checkDeletionEligibility,
        requestAccountDeletion,
        cancelAccountDeletion,
        isOwnerPlanActive,
        updateAdminEmail,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
