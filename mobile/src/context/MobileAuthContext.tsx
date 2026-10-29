import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions, isFirebaseConfigured } from '../lib/firebase';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { MobileUserProfile, UserRole } from '../types';

export interface LoginResult {
  success: boolean;
  role?: UserRole;
  error?: string;
}

interface MobileAuthContextType {
  user: MobileUserProfile | null;
  role: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  register: (name: string, email: string, password: string, phone?: string, role?: UserRole) => Promise<LoginResult>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  switchRole: (newRole: UserRole) => void;
  updateUserProfile: (updates: Partial<MobileUserProfile>) => Promise<void>;
  checkDeletionEligibility: () => Promise<{ canDelete: boolean; reasons: string[] }>;
  requestAccountDeletion: () => Promise<{ success: boolean; scheduledAt?: string; error?: string }>;
  cancelAccountDeletion: () => Promise<{ success: boolean; error?: string }>;
  isOwnerPlanActive: boolean;
}

const MobileAuthContext = createContext<MobileAuthContextType | undefined>(undefined);

export const MobileAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<MobileUserProfile | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole>('owner');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const isRegisteringRef = React.useRef<boolean>(false);

  // Live Firebase Auth listener
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsLoading(false);
      return;
    }

    let unsubUserDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (fbUser) {
        // Register device APNs / FCM push token and sync to Firestore
        registerForPushNotificationsAsync(fbUser.uid).catch((err) =>
          console.warn('[PushNotifications] Background registration warning:', err)
        );

        try {
          // Listen to real-time updates on users collection
          unsubUserDoc = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
            if (snap.exists()) {
              const uData = snap.data();
              const profile: MobileUserProfile = {
                id: fbUser.uid,
                email: fbUser.email || uData.email || '',
                displayName: uData.displayName || uData.name || fbUser.displayName || 'Propithub User',
                role: (uData.role as UserRole) || 'owner',
                phone: uData.phone || '',
                ownerId: uData.ownerId || fbUser.uid,
                ownerName: uData.ownerName || null,
                propertyId: uData.propertyId,
                avatarUrl: uData.avatarUrl || null,
                plan: uData.plan || 'pro',
                hasCompletedTour: Boolean(uData.hasCompletedTour),
              };
              setCurrentUser(profile);
              setActiveRole(profile.role);
            }
          });

          // If register() is actively creating this user's profile, let register() finish
          if (isRegisteringRef.current) {
            return;
          }

          // Initial getDoc
          const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
          if (userDoc.exists()) {
            const uData = userDoc.data();
            const profile: MobileUserProfile = {
              id: fbUser.uid,
              email: fbUser.email || uData.email || '',
              displayName: uData.displayName || uData.name || fbUser.displayName || 'Propithub User',
              role: (uData.role as UserRole) || 'owner',
              phone: uData.phone || '',
              ownerId: uData.ownerId || fbUser.uid,
              ownerName: uData.ownerName || null,
              propertyId: uData.propertyId,
              avatarUrl: uData.avatarUrl || null,
              plan: uData.plan || 'pro',
              hasCompletedTour: Boolean(uData.hasCompletedTour),
            };
            setCurrentUser(profile);
            setActiveRole(profile.role);
          } else {
            // Document doesn't exist yet: check if user was invited in tenants or staff collections
            let detectedRole: UserRole = 'owner';
            let detectedOwnerId = fbUser.uid;
            let detectedName = fbUser.displayName || fbUser.email?.split('@')[0] || 'User';
            let detectedPhone = '';

            try {
              if (fbUser.email) {
                const cleanEmail = fbUser.email.toLowerCase();
                const tenantSnap = await getDocs(
                  query(collection(db, 'tenants'), where('email', '==', cleanEmail))
                );
                if (!tenantSnap.empty) {
                  const tData = tenantSnap.docs[0].data();
                  detectedRole = 'tenant';
                  detectedOwnerId = tData.ownerId || fbUser.uid;
                  detectedName = tData.name || detectedName;
                  detectedPhone = tData.phone || '';
                } else {
                  const staffSnap = await getDocs(
                    query(collection(db, 'staff'), where('email', '==', cleanEmail))
                  );
                  if (!staffSnap.empty) {
                    const sData = staffSnap.docs[0].data();
                    const sRole = (sData.role || '').toLowerCase();
                    detectedRole = sRole.includes('manager') ? 'manager' : 'staff';
                    detectedOwnerId = sData.ownerId || fbUser.uid;
                    detectedName = sData.name || detectedName;
                    detectedPhone = sData.phone || '';
                  }
                }
              }
            } catch (queryErr) {
              console.warn('Role auto-detection error:', queryErr);
            }

            const fallbackProfile: MobileUserProfile = {
              id: fbUser.uid,
              email: fbUser.email || '',
              displayName: detectedName,
              role: detectedRole,
              phone: detectedPhone,
              ownerId: detectedOwnerId,
              ownerName: null,
              avatarUrl: null,
              plan: 'pro',
              hasCompletedTour: false,
            };
            setCurrentUser(fallbackProfile);
            setActiveRole(detectedRole);
            await setDoc(doc(db, 'users', fbUser.uid), fallbackProfile, { merge: true });
          }
        } catch (err) {
          console.warn('Error fetching live user profile from Firestore:', err);
        }
      } else {
        setCurrentUser(null);
      }
      if (!isRegisteringRef.current) {
        setIsLoading(false);
      }
    });

    return () => {
      if (unsubUserDoc) unsubUserDoc();
      unsubscribeAuth();
    };
  }, []);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    setIsLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
      let userRole: UserRole = 'owner';

      if (userDoc.exists()) {
        const uData = userDoc.data();
        userRole = (uData.role as UserRole) || 'owner';
        const profile: MobileUserProfile = {
          id: cred.user.uid,
          email: cred.user.email || uData.email || '',
          displayName: uData.displayName || uData.name || cred.user.displayName || 'Propithub User',
          role: userRole,
          phone: uData.phone || '',
          ownerId: uData.ownerId || cred.user.uid,
          ownerName: uData.ownerName || null,
          propertyId: uData.propertyId,
          avatarUrl: uData.avatarUrl || null,
          plan: uData.plan || 'pro',
          hasCompletedTour: Boolean(uData.hasCompletedTour),
        };
        setCurrentUser(profile);
        setActiveRole(userRole);
      }
      return { success: true, role: userRole };
    } catch (err: any) {
      let message = 'Failed to sign in. Please verify your email and password.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        message = 'Invalid email or password. Please verify your credentials.';
      } else if (err.code === 'auth/too-many-requests') {
        message = 'Access temporarily disabled due to many failed attempts. Try again later.';
      } else if (err.message) {
        message = err.message;
      }
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    phone?: string,
    role: UserRole = 'owner'
  ): Promise<LoginResult> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters long.' };
    }
    if (!name.trim()) {
      return { success: false, error: 'Please enter your full name.' };
    }

    isRegisteringRef.current = true;
    setIsLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const newProfile: MobileUserProfile = {
        id: cred.user.uid,
        email: cleanEmail,
        displayName: name.trim(),
        role,
        phone: phone?.trim() || '',
        ownerId: cred.user.uid,
        ownerName: role === 'owner' ? name.trim() : null,
        avatarUrl: null,
        plan: 'starter',
        hasCompletedTour: false,
      };
      await setDoc(doc(db, 'users', cred.user.uid), newProfile, { merge: true });
      if (role === 'owner') {
        let trialDays = 14;
        try {
          const policySnap = await getDoc(doc(db, 'platformConfig', 'trialPolicy'));
          if (policySnap.exists() && typeof policySnap.data()?.defaultTrialDays === 'number') {
            trialDays = Math.max(0, policySnap.data()!.defaultTrialDays);
          }
        } catch (_) {}

        const isTrial = trialDays > 0;
        await setDoc(
          doc(db, 'owners', cred.user.uid),
          {
            ownerId: cred.user.uid,
            planId: isTrial ? 'free_trial' : 'starter',
            planName: isTrial ? 'Free Trial' : 'Starter',
            planStatus: isTrial ? 'trialing' : 'expired',
            trialEndsAt: isTrial ? new Date(Date.now() + trialDays * 86400000).toISOString() : null,
            isInitialTrial: isTrial,
          },
          { merge: true }
        );
      }
      setCurrentUser(newProfile);
      setActiveRole(role);
      return { success: true, role };
    } catch (err: any) {
      let msg = 'Registration failed. Please try again.';
      if (err?.code === 'auth/email-already-in-use') {
        msg = 'An account with this email address already exists. Please sign in instead.';
      } else if (err?.code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters long.';
      } else if (err?.message) {
        msg = err.message;
      }
      return { success: false, error: msg };
    } finally {
      isRegisteringRef.current = false;
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await signOut(auth);
      setCurrentUser(null);
      setActiveRole('owner');
    } catch (err) {
      console.warn('Logout error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to send password reset email.' };
    }
  };

  const switchRole = (newRole: UserRole) => {
    setActiveRole(newRole);
    if (currentUser) {
      setCurrentUser((prev) => (prev ? { ...prev, role: newRole } : null));
    }
  };

  const updateUserProfile = async (updates: Partial<MobileUserProfile>) => {
    if (!currentUser) return;
    setCurrentUser((prev) => (prev ? { ...prev, ...updates } : null));
    try {
      await setDoc(doc(db, 'users', currentUser.id), updates, { merge: true });
    } catch (err) {
      console.warn('Failed to update user profile in Firestore:', err);
    }
  };

  const checkDeletionEligibility = async (): Promise<{ canDelete: boolean; reasons: string[] }> => {
    if (!currentUser) return { canDelete: false, reasons: ['Not authenticated.'] };
    const reasons: string[] = [];
    const uid = currentUser.id;
    const role = currentUser.role;

    if (isFirebaseConfigured) {
      try {
        const checkFn = httpsCallable<any, { canDelete: boolean; reasons: string[] }>(
          functions,
          'checkAccountDeletionEligibility'
        );
        const res = await checkFn({});
        return res.data;
      } catch (err: any) {
        console.warn('Fallback to client query for checkDeletionEligibility:', err?.message || err);
      }
    }

    try {
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
    } catch (e: any) {
      console.warn('Client query error:', e?.message || e);
    }

    return { canDelete: reasons.length === 0, reasons };
  };

  const requestAccountDeletion = async (): Promise<{ success: boolean; scheduledAt?: string; error?: string }> => {
    if (!currentUser) return { success: false, error: 'Not authenticated' };
    const scheduledTime = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

    if (isFirebaseConfigured) {
      try {
        const reqFn = httpsCallable<any, { success: boolean; scheduledPermanentDeletionAt: string }>(
          functions,
          'requestAccountDeletion'
        );
        const res = await reqFn({});
        const scheduledAt = res.data?.scheduledPermanentDeletionAt || scheduledTime;
        setCurrentUser((prev) =>
          prev
            ? {
                ...prev,
                deletionStatus: 'pending_deletion',
                deletionRequestedAt: new Date().toISOString(),
                scheduledPermanentDeletionAt: scheduledAt,
              }
            : null
        );
        return { success: true, scheduledAt };
      } catch (err: any) {
        console.warn('Fallback direct firestore set for deletion request:', err?.message || err);
      }
    }

    try {
      await setDoc(
        doc(db, 'users', currentUser.id),
        {
          deletionStatus: 'pending_deletion',
          deletionRequestedAt: new Date().toISOString(),
          scheduledPermanentDeletionAt: scheduledTime,
        },
        { merge: true }
      );
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              deletionStatus: 'pending_deletion',
              deletionRequestedAt: new Date().toISOString(),
              scheduledPermanentDeletionAt: scheduledTime,
            }
          : null
      );
      return { success: true, scheduledAt: scheduledTime };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to schedule deletion.' };
    }
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
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              deletionStatus: 'none',
              deletionRequestedAt: null,
              scheduledPermanentDeletionAt: null,
            }
          : null
      );
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to restore account.' };
    }
  };

  return (
    <MobileAuthContext.Provider
      value={{
        user: currentUser,
        role: activeRole,
        isAuthenticated: !!currentUser,
        isLoading,
        login,
        register,
        logout,
        resetPassword,
        switchRole,
        updateUserProfile,
        checkDeletionEligibility,
        requestAccountDeletion,
        cancelAccountDeletion,
        isOwnerPlanActive: true,
      }}
    >
      {children}
    </MobileAuthContext.Provider>
  );
};

export const useMobileAuth = () => {
  const context = useContext(MobileAuthContext);
  if (!context) {
    throw new Error('useMobileAuth must be used within a MobileAuthProvider');
  }
  return context;
};
