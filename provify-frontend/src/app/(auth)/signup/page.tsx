"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName,
        }),
      });

      if (!res.ok) {
        let detail = res.statusText;
        try {
          const body = await res.json();
          detail = body.detail ?? JSON.stringify(body);
        } catch {
          // ignore JSON parse failure
        }
        setError(detail);
        return;
      }

      // Success — redirect to login
      router.push("/login");
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-bg px-6 py-16">
      <Card className="w-full max-w-md border border-border bg-surface shadow-sm rounded-xl">
        <CardHeader className="space-y-2 p-6 pb-4">
          <div className="flex items-center gap-2">
            <span className="font-sans text-2xl font-bold tracking-tight text-text">
              provify
            </span>
            <span className="rounded-full bg-blue/10 px-2 py-0.5 text-[10px] font-semibold text-blue font-mono-tag">
              beta
            </span>
          </div>
          <CardTitle className="text-xl font-semibold text-text">Create your account</CardTitle>
          <CardDescription className="text-sm text-text-3 font-normal">
            Track your interview history and stats over time.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="full-name" className="text-xs font-semibold text-text-2 uppercase tracking-wider">
                Full name
              </Label>
              <Input
                id="full-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ada Lovelace"
                className="h-10 text-sm focus-visible:ring-blue-mid/40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-text-2 uppercase tracking-wider">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-10 text-sm focus-visible:ring-blue-mid/40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-text-2 uppercase tracking-wider">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10 text-sm focus-visible:ring-blue-mid/40"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-mid bg-red-dim px-4 py-3 text-xs font-medium text-red-text" role="alert">
                {error}
              </div>
            )}

            <Button type="submit" disabled={submitting} className="mt-2 h-11 text-sm font-semibold rounded-lg">
              {submitting ? "Creating account…" : "Create account"}
            </Button>

            <p className="text-center text-xs text-text-3 mt-2 font-normal">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-blue hover:underline transition-colors"
              >
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
