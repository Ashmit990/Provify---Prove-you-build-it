"use client";

import { useEffect, useState } from "react";
import { Loader2, TrendingUp, Trophy, ClipboardList } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { getUserSessions, getUserStats, ApiError } from "@/lib/api";
import type { SessionSummary, UserStatsResponse } from "@/lib/types";

// ---------- Types ----------
interface TrendPoint {
  date: string;
  score: number;
}

interface DistBucket {
  range: string;
  count: number;
}

// ---------- Helpers ----------
function buildTrend(sessions: SessionSummary[]): TrendPoint[] {
  return sessions
    .filter((s) => s.status === "completed" && s.total_score !== null)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    .map((s) => ({
      date: new Date(s.created_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      score: s.total_score as number,
    }));
}

function buildDistribution(sessions: SessionSummary[]): DistBucket[] {
  const buckets: DistBucket[] = [
    { range: "0–20", count: 0 },
    { range: "21–40", count: 0 },
    { range: "41–60", count: 0 },
    { range: "61–80", count: 0 },
    { range: "81–100", count: 0 },
  ];

  sessions
    .filter((s) => s.status === "completed" && s.total_score !== null)
    .forEach((s) => {
      const score = s.total_score as number;
      if (score <= 20) buckets[0].count++;
      else if (score <= 40) buckets[1].count++;
      else if (score <= 60) buckets[2].count++;
      else if (score <= 80) buckets[3].count++;
      else buckets[4].count++;
    });

  return buckets;
}

// ---------- Custom tooltip ----------
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md">
      <p className="text-text-3 mb-0.5">{label}</p>
      <p className="font-semibold text-blue">{payload[0].value}</p>
    </div>
  );
}

// ---------- Stat card ----------
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  colorClass,
  textColorClass,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub?: string;
  colorClass: string;
  textColorClass: string;
}) {
  return (
    <Card className="relative overflow-hidden border border-border shadow-sm bg-surface rounded-xl">
      <CardContent className="flex flex-col gap-2 p-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-3">
            {label}
          </p>
          <div className={`rounded-lg p-2 ${colorClass}`}>
            <Icon className="size-4" />
          </div>
        </div>
        <p className={`text-4xl font-bold tracking-tight ${textColorClass}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-text-3 font-normal">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ---------- Table row ----------
function SessionTableRow({
  session,
  index,
}: {
  session: SessionSummary;
  index: number;
}) {
  const date = new Date(session.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const score = session.total_score;
  const max = session.max_score ?? 100;
  const pct = score !== null ? Math.round((score / max) * 100) : null;

  const scoreColorClass =
    pct === null
      ? "text-text-3"
      : pct >= 80
      ? "text-green-text"
      : pct >= 50
      ? "text-amber-text"
      : "text-red-text";

  return (
    <tr
      className={`border-t border-border/60 transition-colors duration-150 hover:bg-surface-2 ${
        index % 2 === 0 ? "bg-surface" : "bg-bg/40"
      }`}
    >
      <td className="px-6 py-4 text-sm font-semibold text-text">{session.project_name}</td>
      <td className={`px-6 py-4 text-sm font-semibold ${scoreColorClass}`}>
        {score !== null ? `${score}/${max}` : "—"}
      </td>
      <td className="px-6 py-4 text-xs text-text-3">{date}</td>
    </tr>
  );
}

// ---------- Main page ----------
export default function PerformancePage() {
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
            : "Couldn't load your performance data."
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  if (authLoading || (!sessions && !error)) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Loader2 className="size-5 animate-spin text-text-4" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="flex items-center gap-2 rounded-lg border border-red-mid bg-red-dim px-4 py-3 text-xs font-medium text-red-text" role="alert">
          {error}
        </div>
      </main>
    );
  }

  const completedSessions = (sessions ?? []).filter(
    (s) => s.status === "completed"
  );
  const trendData = buildTrend(sessions ?? []);
  const distData = buildDistribution(sessions ?? []);

  const isEmpty = completedSessions.length === 0;

  return (
    <main className="flex flex-1 flex-col px-8 py-8 gap-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-text">Past Performance</h1>
        <p className="text-sm text-text-3 mt-1">
          A visual breakdown of your interview scores over time.
        </p>
      </div>

      {isEmpty ? (
        <Card className="bg-surface border border-border shadow-sm rounded-xl">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ClipboardList className="size-8 text-text-4" />
            <p className="text-sm font-semibold text-text">No completed interviews yet</p>
            <p className="text-xs text-text-3">
              Complete an interview to see your performance stats here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={ClipboardList}
              label="Total Interviews"
              value={stats?.total_interviews ?? completedSessions.length}
              colorClass="bg-blue-dim text-blue"
              textColorClass="text-blue"
            />
            <StatCard
              icon={TrendingUp}
              label="Average Score"
              value={stats?.average_score ?? "—"}
              sub="out of 100"
              colorClass="bg-amber-dim text-amber-text"
              textColorClass="text-amber-text"
            />
            <StatCard
              icon={Trophy}
              label="Best Score"
              value={stats?.best_score ?? "—"}
              sub="out of 100"
              colorClass="bg-green-dim text-green-text"
              textColorClass="text-green-text"
            />
          </div>

          {/* Charts row */}
          {trendData.length > 0 && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Line chart — score trend */}
              <Card className="border border-border bg-surface shadow-sm rounded-xl">
                <CardHeader className="pb-2 p-6">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-text-3">
                    Score trend over time
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-6 pb-6">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart
                      data={trendData}
                      margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(0,0,0,0.04)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "#6B7280", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fill: "#6B7280", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(0,0,0,0.04)" }} />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#3B82F6"
                        strokeWidth={2.5}
                        dot={{ fill: "#3B82F6", r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6, fill: "#3B82F6", strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Bar chart — distribution */}
              <Card className="border border-border bg-surface shadow-sm rounded-xl">
                <CardHeader className="pb-2 p-6">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-text-3">
                    Score distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-6 pb-6">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={distData}
                      margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(0,0,0,0.04)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="range"
                        tick={{ fill: "#6B7280", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: "#6B7280", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.02)" }} />
                      <Bar
                        dataKey="count"
                        fill="#22C55E"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={48}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Sessions table */}
          <Card className="p-0 overflow-hidden border border-border shadow-sm bg-surface rounded-xl">
            <CardHeader className="pb-2 p-6">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-text-3">
                All completed sessions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-text-3 bg-surface-2/40">
                        Project
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-text-3 bg-surface-2/40">
                        Score
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-text-3 bg-surface-2/40">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {completedSessions.map((s, i) => (
                      <SessionTableRow key={s.id} session={s} index={i} />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
