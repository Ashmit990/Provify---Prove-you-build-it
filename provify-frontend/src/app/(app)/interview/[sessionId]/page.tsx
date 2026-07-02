"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { ScoreMeter } from "@/components/score-meter";
import { SourceTag } from "@/components/source-tag";
import { submitAnswer, peekQuestion, ApiError } from "@/lib/api";
import { isCompleted } from "@/lib/types";

interface LocalQuestionState {
  question_number: number;
  question: string;
  source_file: string;
  total_questions: number;
  score_so_far: number;
  scores: number[];
}

interface LastFeedback {
  question_number: number;
  score: number;
  feedback: string;
  ideal_answer: string;
}

type Phase = "answering" | "submitting" | "feedback";

function AnimatedScore({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) {
      setDisplayValue(end);
      return;
    }

    const duration = 500; // ms
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

export default function InterviewPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = params.sessionId;

  const [current, setCurrent] = useState<LocalQuestionState | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(
      `provify:current_question:${sessionId}`
    );
    return raw ? JSON.parse(raw) : null;
  });
  const [answer, setAnswer] = useState("");
  const [peeked, setPeeked] = useState(false);
  const [peekContent, setPeekContent] = useState<string | null>(null);
  const [peekLoading, setPeekLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("answering");
  const [lastFeedback, setLastFeedback] = useState<LastFeedback | null>(null);
  const [error, setError] = useState<string | null>(() =>
    typeof window !== "undefined" &&
    !sessionStorage.getItem(`provify:current_question:${sessionId}`)
      ? "No active interview found for this session. Start a new one from the upload page."
      : null
  );

  function persist(state: LocalQuestionState) {
    sessionStorage.setItem(
      `provify:current_question:${sessionId}`,
      JSON.stringify(state)
    );
    setCurrent(state);
  }

  async function handlePeek() {
    if (peekContent || peekLoading) return;
    setPeekLoading(true);
    try {
      const res = await peekQuestion(
        sessionId,
        (current?.question_number ?? 1) - 1
      );
      setPeekContent(res.code_reference);
      setPeeked(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't load that reference."
      );
    } finally {
      setPeekLoading(false);
    }
  }

  async function handleSubmit() {
    if (!current || !answer.trim()) return;
    setError(null);
    setPhase("submitting");

    try {
      const res = await submitAnswer({
        session_id: sessionId,
        answer,
        peeked,
      });

      if (isCompleted(res)) {
        sessionStorage.setItem(
          `provify:results:${sessionId}`,
          JSON.stringify(res)
        );
        sessionStorage.removeItem(`provify:current_question:${sessionId}`);
        router.push(`/results/${sessionId}`);
        return;
      }

      setLastFeedback({
        question_number: current.question_number,
        score: res.last_score,
        feedback: res.last_feedback,
        ideal_answer: res.ideal_answer,
      });

      const updatedScores = [...current.scores];
      updatedScores[current.question_number - 1] = res.last_score;

      persist({
        question_number: res.question_number,
        question: res.question,
        source_file: res.source_file,
        total_questions: current.total_questions,
        score_so_far: res.score_so_far,
        scores: updatedScores,
      });

      setPhase("feedback");
    } catch (err) {
      setPhase("answering");
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't reach Provify's backend while scoring your answer."
      );
    }
  }

  function handleNext() {
    setAnswer("");
    setPeeked(false);
    setPeekContent(null);
    setLastFeedback(null);
    setPhase("answering");
  }

  if (error && !current) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="flex items-center gap-2 rounded-lg border border-red-mid bg-red-dim px-4 py-3 text-xs font-medium text-red-text" role="alert">
          {error}
        </div>
      </main>
    );
  }

  if (!current) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Loader2 className="size-5 animate-spin text-text-4" />
      </main>
    );
  }

  return (
    <main className="flex flex-1 justify-center px-6 py-10 max-w-3xl mx-auto w-full">
      <div className="flex w-full flex-col gap-6">
        {/* Progress & Meter */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-text-3">
            <span>
              Question {current.question_number} of {current.total_questions}
            </span>
            <span>Score: {current.score_so_far}</span>
          </div>
          <ScoreMeter scores={current.scores} total={current.total_questions} />
        </div>

        {phase === "feedback" && lastFeedback ? (
          <FeedbackCard feedback={lastFeedback} onNext={handleNext} />
        ) : (
          <Card className="border border-border bg-surface shadow-sm rounded-xl">
            <CardHeader className="gap-4 p-6 pb-4">
              <div className="flex">
                <SourceTag file={current.source_file} />
              </div>
              <CardTitle className="text-xl font-semibold leading-relaxed text-text">
                {current.question}
              </CardTitle>
            </CardHeader>

            <CardContent className="flex flex-col gap-5 p-6 pt-0">
              <Textarea
                placeholder="Explain it the way you'd explain it to a senior engineer reviewing your PR…"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={phase === "submitting"}
                className="min-h-[160px] text-sm focus-visible:ring-blue-mid/40"
              />

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handlePeek}
                  disabled={phase === "submitting" || peekLoading}
                  className="flex items-center gap-2 text-xs font-semibold text-text-3 hover:text-amber-text transition-colors disabled:opacity-50"
                >
                  {peekLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : peeked ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                  {peeked
                    ? "Code reference viewed — score is halved"
                    : "Peek at the code this question is grounded in (halves your score)"}
                </button>
                {peeked && <Badge variant="warning">Score ×0.5</Badge>}
              </div>

              {peekContent && (
                <pre className="overflow-x-auto rounded-lg border border-border/80 bg-surface-2 p-4 text-xs font-mono-tag text-text-2 leading-relaxed">
                  {peekContent}
                </pre>
              )}

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-mid bg-red-dim px-4 py-3 text-xs font-medium text-red-text" role="alert">
                  {error}
                </div>
              )}
            </CardContent>

            <CardFooter className="p-6 pt-0">
              <Button
                onClick={handleSubmit}
                disabled={phase === "submitting" || !answer.trim()}
                className="w-full h-11 text-sm font-semibold rounded-lg"
                size="lg"
              >
                {phase === "submitting" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Scoring your answer against the code…
                  </>
                ) : (
                  "Submit answer"
                )}
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </main>
  );
}

function FeedbackCard({
  feedback,
  onNext,
}: {
  feedback: LastFeedback;
  onNext: () => void;
}) {
  const scoreVariant =
    feedback.score >= 7 ? "success" : feedback.score >= 4 ? "score" : "warning";

  return (
    <Card className="border border-border bg-surface shadow-sm rounded-xl">
      <CardHeader className="flex flex-row items-center justify-between gap-4 p-6 pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-text-3">
            Question {feedback.question_number} Result
          </span>
          <CardTitle className="text-lg font-semibold mt-1">Here&apos;s how that answer landed</CardTitle>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <Badge variant={scoreVariant} className="text-lg px-4 py-1.5 font-bold tracking-tight">
            <AnimatedScore value={feedback.score} />
            <span className="text-xs font-normal opacity-70">/10</span>
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6 p-6 pt-0">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-3">
            Feedback
          </p>
          <p className="text-sm leading-relaxed text-text font-normal">
            {feedback.feedback}
          </p>
        </div>

        <div className="rounded-xl border border-blue-mid bg-blue-dim/40 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-text">
            What a strong senior answer would have said
          </p>
          <p className="text-sm leading-relaxed text-text font-normal">
            {feedback.ideal_answer}
          </p>
        </div>
      </CardContent>

      <CardFooter className="p-6 pt-0">
        <Button onClick={onNext} className="w-full h-11 text-sm font-semibold rounded-lg gap-2" size="lg">
          Next question
          <ArrowRight className="size-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
