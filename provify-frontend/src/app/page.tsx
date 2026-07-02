"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace("/upload");
    } else {
      router.replace("/login");
    }
  }, [user, loading, router]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted" />
    </div>
  );
}
