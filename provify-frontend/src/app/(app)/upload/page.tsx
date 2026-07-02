"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Loader2, FileArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { uploadProject, startInterview, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Stage = "idle" | "uploading" | "starting" | "error";

const STAGE_COPY: Record<Exclude<Stage, "idle" | "error">, string> = {
  uploading: "Reading your code, chunking it, and embedding it locally…",
  starting: "Generating your first question from your codebase…",
};

export default function UploadPage() {
  const router = useRouter();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (!f.name.endsWith(".zip")) {
      setError("Provify only accepts a .zip of your project.");
      return;
    }
    setError(null);
    setFile(f);
  }

  async function handleSubmit() {
    if (!file) {
      setError("Add a .zip file before starting.");
      return;
    }
    setError(null);

    try {
      setStage("uploading");
      const uploadRes = await uploadProject(file);

      setStage("starting");
      const startRes = await startInterview({
        session_id: uploadRes.session_id,
        project_description: description,
        user_id: user?.id ?? null,
      });

      sessionStorage.setItem(
        `provify:current_question:${startRes.session_id}`,
        JSON.stringify({
          question_number: startRes.question_number,
          question: startRes.question,
          source_file: startRes.source_file,
          total_questions: startRes.total_questions,
          score_so_far: 0,
          scores: [],
        })
      );

      router.push(`/interview/${startRes.session_id}`);
    } catch (err) {
      setStage("error");
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong reaching Provify's backend. Check that the API is running."
      );
    }
  }

  const isBusy = stage === "uploading" || stage === "starting";

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <Card className="w-full max-w-lg shadow-sm border border-border bg-surface">
        <CardHeader className="p-6 pb-4">
          <CardTitle className="text-xl font-semibold text-text">Upload your project</CardTitle>
          <CardDescription className="text-sm text-text-3 font-normal mt-1 leading-relaxed">
            Provify reads the actual code in your archive — variable names,
            functions, structure — and builds questions only the person who
            wrote it could answer.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6 p-6 pt-0">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => !isBusy && inputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 cursor-pointer ${
              dragOver
                ? "border-blue bg-blue-dim/40"
                : "border-border hover:border-blue/40 hover:bg-surface-2"
            } ${isBusy ? "pointer-events-none opacity-60" : ""}`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            {file ? (
              <>
                <div className="p-3 bg-blue-dim rounded-full">
                  <FileArchive className="size-6 text-blue" />
                </div>
                <div>
                  <p className="text-sm text-text font-medium">{file.name}</p>
                  <p className="text-xs text-text-3 mt-1">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB — click or drag to replace
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="p-3 bg-surface-2 rounded-full">
                  <UploadCloud className="size-6 text-text-3" />
                </div>
                <div>
                  <p className="text-sm text-text font-medium">
                    Drag and drop your .zip file here, or click to browse
                  </p>
                  <p className="text-xs text-text-3 mt-1 leading-relaxed">
                    node_modules, .git, and venv are skipped automatically
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description" className="text-xs font-medium text-text-2 uppercase tracking-wider">
              Project context (optional)
            </Label>
            <Textarea
              id="description"
              placeholder="e.g. A Next.js + FastAPI app that lets users track expenses, with JWT auth and a Postgres backend."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isBusy}
              className="min-h-[100px] text-sm"
            />
          </div>

          {isBusy && (
            <div className="flex items-center gap-3 rounded-lg border border-blue-mid bg-blue-dim px-4 py-3 text-sm text-blue-text">
              <Loader2 className="size-4 animate-spin text-blue" />
              <span className="font-medium text-xs tracking-wide">{STAGE_COPY[stage]}</span>
            </div>
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
            disabled={isBusy || !file}
            className="w-full h-11 text-sm font-semibold rounded-lg"
            size="lg"
          >
            {isBusy ? "Setting up your interview…" : "Start interview"}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
