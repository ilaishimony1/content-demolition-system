"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export interface UserProfile {
  uid: string;
  email: string | null;
  role: "operator" | "client";
  clientId?: string;
  name?: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);

        // Fetch role from Firestore
        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const userProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            role: data.role || "operator",
            clientId: data.clientId,
            name: data.name,
          };
          setProfile(userProfile);

          // Redirect based on role
          if (data.role === "client") {
            router.push("/portal");
          }
        } else {
          // No Firestore doc = operator (you/Yuval)
          setProfile({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            role: "operator",
          });
        }
      } else {
        setUser(null);
        setProfile(null);
        router.push("/login");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  return { user, profile, loading };
}
