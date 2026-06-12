"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter, usePathname } from "next/navigation";

export interface UserProfile {
  uid: string;
  email: string | null;
  role: "operator" | "client";
  clientId?: string;
  name?: string;
  instagramConnected?: boolean;
  profilePhoto?: string;
  followers?: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);

        // Fetch role from Firestore
        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        let role: "operator" | "client" = "operator";
        let clientId: string | undefined;
        let name: string | undefined;

        let instagramConnected: boolean | undefined;
        let profilePhoto: string | undefined;
        let followers: string | undefined;

        if (userDoc.exists()) {
          const data = userDoc.data();
          role = data.role || "operator";
          clientId = data.clientId;
          name = data.name;
          instagramConnected = data.instagramConnected;
          profilePhoto = data.profilePhoto;
          followers = data.followers;
        }

        const userProfile: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          role,
          clientId,
          name,
          instagramConnected,
          profilePhoto,
          followers,
        };
        setProfile(userProfile);

        // Role-based routing
        if (role === "client" && pathname !== "/portal") {
          router.push("/portal");
        } else if (role === "operator" && pathname === "/portal") {
          router.push("/");
        }
      } else {
        setUser(null);
        setProfile(null);
        if (pathname !== "/login") {
          router.push("/login");
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router, pathname]);

  return { user, profile, loading };
}
