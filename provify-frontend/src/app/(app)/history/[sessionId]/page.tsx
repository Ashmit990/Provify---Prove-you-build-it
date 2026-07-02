"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, FileCode2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreMeter } from "@/components/score-meter";
import { getSessionDetail, ApiError } from "@/lib/api";
import type { SessionDetailResponse } from "@/lib/types";

export default function SessionDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getSessionDetail(params.sessionId);
        if (!cancelled) setDetail(res);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Couldn't load this session."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.sessionId]);

  if (error) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="flex items-center gap-2 rounded-lg border border-red-mid bg-red-dim px-4 py-3 text-xs font-medium text-red-text" role="alert">
          {error}
        </div>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Loader2 className="size-5 animate-spin text-text-4" />
      </main>
    );
  }

  const { session, questions } = detail;
  const scores = questions.map((q) => q.score ?? 0);

  return (
    <main className="flex flex-1 justify-center px-6 py-12">
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <Link
          href="/history"
          className="flex items-center gap-2 text-xs font-semibold text-text-3 hover:text-text transition-colors w-fit"
        >
          <ArrowLeft className="size-3.5" />
          Back to history
        </Link>

        {/* Project details card */}
        <Card className="border border-border bg-surface shadow-sm rounded-xl">
          <CardHeader className="gap-2 p-6 pb-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <FileCode2 className="size-5 text-blue" />
                <CardTitle className="text-lg font-semibold">{session.project_name}</CardTitle>
              </div>
              <Badge variant={session.status === "completed" ? "success" : "neutral"}>
                {session.status}
              </Badge>
            </div>
            {session.project_description && (
              <p className="text-sm text-text-3 font-normal mt-1 leading-relaxed">{session.project_description}</p>
            )}
            <CardDescription className="text-xs text-text-4 font-normal mt-2">
              {new Date(session.created_at).toLocaleString()}
              {session.total_score !== null && (
                <span className="font-semibold text-amber-text ml-2">
                  — scored {session.total_score}{session.max_score ? `/${session.max_score}` : "/100"}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          {questions.length > 0 && (
            <CardContent className="px-6 pb-6">
              <ScoreMeter scores={scores} total={questions.length} />
            </CardContent>
          )}
        </Card>

        {/* Questions lists */}
        <div className="flex flex-col gap-5">
          {questions.map((q, i) => (
            <Card key={q.id} className="border border-border bg-surface shadow-sm rounded-xl">
              <CardHeader className="gap-2.5 p-6 pb-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-3 font-mono-tag">
                    Question {i + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    {q.peeked && <Badge variant="warning">Peeked</Badge>}
                    <Badge variant="score">
                      {q.score ?? "—"}/{q.max_score ?? 10}
                    </Badge>
                  </div>
                </div>
                <CardTitle className="text-base font-semibold leading-relaxed text-text">
                  {q.question_text}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5 px-6 pb-6">
                {q.user_answer && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-3">
                      Your answer
                    </p>
                    <p className="text-sm leading-relaxed text-text font-normal bg-bg/50 border border-border/60 rounded-lg p-3">
                      {q.user_answer}
                    </p>
                  </div>
                )}
                {q.feedback && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-3">
                      Feedback
                    </p>
                    <p className="text-sm leading-relaxed text-text font-normal">
                      {q.feedback}
                    </p>
                  </div>
                )}
                {q.ideal_answer && (
                  <div className="rounded-xl border border-blue-mid bg-blue-dim/40 p-4">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-blue-text">
                      Ideal Answer
                    </p>
                    <p className="text-sm leading-relaxed text-text font-normal">
                      {q.ideal_answer}
                    </p>
                  </div>
                )}
                {q.source_file && (
                  <div className="flex items-center gap-1.5 text-xs text-text-3 font-mono-tag mt-2">
                    <FileCode2 className="size-3.5 text-blue" />
                    <span>{q.source_file}</span>
                  </div>
                )}
                {q.code_reference && (
                  <details className="group mt-2 border border-border/80 rounded-lg overflow-hidden transition-all duration-200">
                    <summary className="cursor-pointer select-none bg-surface-2 px-4 py-2 text-xs font-semibold text-text-3 hover:bg-surface-3 transition-colors">
                      View the code this question was grounded in
                    </summary>
                    <pre className="p-4 overflow-x-auto text-xs font-mono-tag text-text-2 bg-surface leading-relaxed border-t border-border/80">
                      {q.code_reference}
                    </pre>
                  </details>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
