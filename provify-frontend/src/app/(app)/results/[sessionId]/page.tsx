"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoreMeter } from "@/components/score-meter";
import type { InterviewAnswerCompletedResponse } from "@/lib/types";

function AnimatedScore({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) {
      setDisplayValue(end);
      return;
    }

    const duration = 800; // ms
    const startTime = performance.now();

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // easeOutQuad
      const ease = progress * (2 - progress);
      const current = Math.round(ease * end);

      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  }, [value]);

  return <>{displayValue}</>;
}

export default function ResultsPage() {
  const params = useParams<{ sessionId: string }>();
  const [result] = useState<InterviewAnswerCompletedResponse | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(`provify:results:${params.sessionId}`);
    return raw ? JSON.parse(raw) : null;
  });

  if (!result) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <p className="text-sm text-text-3">
          No results found for this session in this browser tab.{" "}
          <Link href="/history" className="text-blue hover:underline">
            Check your history
          </Link>{" "}
          instead.
        </p>
      </main>
    );
  }

  const verdict =
    result.percentage >= 80
      ? "You clearly built this."
      : result.percentage >= 50
      ? "You know this project, with some gaps."
      : "There are real gaps between you and this code.";

  return (
    <main className="flex flex-1 justify-center px-6 py-12">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <Card className="border border-border bg-surface shadow-sm rounded-xl">
          <CardHeader className="items-center text-center gap-2 p-6 pb-4">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-text-3">
              Interview complete
            </CardDescription>
            <CardTitle className="text-5xl font-bold text-blue tracking-tight my-2">
              <AnimatedScore value={result.total_score} />
              <span className="text-xl font-medium text-text-3">/{result.max_score}</span>
            </CardTitle>
            <p className="text-sm font-semibold text-text">{verdict}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 p-6 pt-0">
            <ScoreMeter scores={result.scores} total={result.scores.length} />
            <div className="grid grid-cols-5 gap-2.5 text-center">
              {result.scores.map((s, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border bg-surface-2 py-3 px-2"
                >
                  <p className="text-[10px] font-bold text-text-3 uppercase tracking-wider">Q{i + 1}</p>
                  <p className="text-sm font-semibold text-text mt-1">{s}/10</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border bg-surface shadow-sm rounded-xl">
          <CardHeader className="p-6 pb-4">
            <CardTitle className="text-base font-semibold text-text">Final question feedback</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 p-6 pt-0">
            <p className="text-sm leading-relaxed text-text font-normal">{result.feedback}</p>
            <div className="rounded-xl border border-blue-mid bg-blue-dim/40 p-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-blue-text">
                Ideal answer
              </p>
              <p className="text-sm leading-relaxed text-text font-normal">
                {result.ideal_answer}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button asChild variant="outline" className="flex-1 h-11 text-sm font-semibold rounded-lg">
            <Link href="/history">View history</Link>
          </Button>
          <Button asChild className="flex-1 h-11 text-sm font-semibold rounded-lg">
            <Link href="/upload">Start another interview</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
