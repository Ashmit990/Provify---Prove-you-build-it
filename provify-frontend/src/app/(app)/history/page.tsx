"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, FileCode2, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { getUserSessions, getUserStats, ApiError } from "@/lib/api";
import type { SessionSummary, UserStatsResponse } from "@/lib/types";

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [stats, setStats] = useState<UserStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    let cancelled = false;
    (async () => {
      try {
        const [sessionsRes, statsRes] = await Promise.all([
          getUserSessions(user.id),
          getUserStats(user.id),
        ]);
        if (cancelled) return;
        setSessions(sessionsRes.sessions);
        setStats(statsRes);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't reach Provify's backend to load your history."
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  if (authLoading) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Loader2 className="size-5 animate-spin text-text-4" />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-8 py-8 gap-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Interview History</h1>
          <p className="text-sm text-text-3 mt-1">Review your past coding interviews and detailed scores.</p>
        </div>
        <Button asChild size="sm" className="h-9 px-4 text-xs font-semibold gap-1.5">
          <Link href="/upload">
            <Plus className="size-3.5" />
            New interview
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && stats.total_interviews > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile label="Interviews" value={stats.total_interviews} />
          <StatTile label="Average score" value={stats.average_score} />
          <StatTile label="Best score" value={stats.best_score} />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-mid bg-red-dim px-4 py-3 text-xs font-medium text-red-text" role="alert">
          {error}
        </div>
      )}

      {!sessions && !error && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-5 animate-spin text-text-4" />
        </div>
      )}

      {sessions && sessions.length === 0 && (
        <Card className="bg-surface border border-border shadow-sm">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <FileCode2 className="size-8 text-text-4" />
            <p className="text-sm font-semibold text-text">No interviews yet</p>
            <p className="text-xs text-text-3">
              Upload a project to run your first one.
            </p>
          </CardContent>
        </Card>
      )}

      {sessions && sessions.length > 0 && (
        <Card className="p-0 overflow-hidden border border-border shadow-sm bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-text-3">
                    Project
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-text-3">
                    Status
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-text-3">
                    Score
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-text-3">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sessions.map((s, i) => (
                  <SessionTableRow key={s.id} session={s} index={i} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card className="bg-surface border border-border shadow-sm">
      <CardContent className="flex flex-col gap-1 p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-text-3">{label}</p>
        <p className="text-4xl font-bold text-blue tracking-tight mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

function SessionTableRow({ session, index }: { session: SessionSummary; index: number }) {
  const statusVariant = session.status === "completed" ? "success" : "neutral";
  const date = new Date(session.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <tr
      className={`transition-colors duration-150 hover:bg-surface-2 ${
        index % 2 === 0 ? "bg-surface" : "bg-bg/40"
      }`}
    >
      <td className="px-6 py-4">
        <Link href={`/history/${session.id}`} className="block group">
          <div className="flex items-center gap-2">
            <FileCode2 className="size-4 text-blue shrink-0" />
            <p className="text-sm font-semibold text-text group-hover:text-blue transition-colors">
              {session.project_name}
            </p>
          </div>
          {session.project_description && (
            <p className="text-xs text-text-3 font-normal mt-0.5 max-w-md truncate pl-6">
              {session.project_description}
            </p>
          )}
        </Link>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Badge variant={statusVariant}>{session.status}</Badge>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-amber-text">
        {session.total_score !== null ? (
          <span>
            {session.total_score}
            <span className="text-text-4 font-normal">/{session.max_score || 100}</span>
          </span>
        ) : (
          <span className="text-text-4 font-normal">—</span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-xs text-text-3">
        {date}
      </td>
    </tr>
  );
}
