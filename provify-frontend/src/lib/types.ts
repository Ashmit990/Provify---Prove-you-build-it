// Types mirror Provify's FastAPI response/request models exactly.
// Keep this file in lockstep with the backend contract — do not rename fields.

export interface UploadResponse {
  session_id: string;
  files_extracted: number;
  file_list: string[];
}

export interface InterviewStartRequest {
  session_id: string;
  project_description: string;
  user_id?: string | null;
}

export interface InterviewStartResponse {
  session_id: string;
  question_number: number; // always 1 on start
  question: string;
  source_file: string;
  total_questions: number; // always 10
}

export interface InterviewAnswerRequest {
  session_id: string;
  answer: string;
  peeked: boolean;
}

export interface InterviewAnswerInProgressResponse {
  status: "in_progress";
  question_number: number; // the NEXT question's number
  question: string; // the NEXT question text
  source_file: string;
  score_so_far: number;
  last_feedback: string; // feedback on the answer just submitted
  last_score: number; // score on the answer just submitted (0-10)
  ideal_answer: string; // ideal answer for the PREVIOUS question
}

export interface InterviewAnswerCompletedResponse {
  status: "completed";
  total_score: number;
  max_score: number; // always 100
  percentage: number;
  feedback: string; // feedback on final answer
  ideal_answer: string; // ideal answer for final question
  scores: number[]; // all 10 individual scores
}

export type InterviewAnswerResponse =
  | InterviewAnswerInProgressResponse
  | InterviewAnswerCompletedResponse;

export interface PeekResponse {
  source_file: string;
  code_reference: string;
  warning: string;
}

// ── History ───────────────────────────────────────────────
// Field set inferred from your `sessions` / `questions` Supabase tables.
// Unknown/optional fields are typed loosely on purpose — tighten these
// once you confirm the exact columns.
export interface SessionSummary {
  id: string;
  user_id: string | null;
  project_name: string;
  project_description: string | null;
  status: string; // e.g. "pending" | "in_progress" | "completed"
  total_score: number | null;
  max_score: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface SessionsListResponse {
  sessions: SessionSummary[];
  total: number;
}

export interface QuestionRecord {
  id: string;
  session_id: string;
  question_text: string;
  code_reference: string | null;
  source_file: string | null;
  user_answer: string | null;
  peeked: boolean;
  score: number;
  max_score: number;
  feedback: string | null;
  ideal_answer: string | null;
  created_at: string;
}

export interface SessionDetailResponse {
  session: SessionSummary;
  questions: QuestionRecord[];
}

export interface UserStatsResponse {
  total_interviews: number;
  average_score: number;
  best_score: number;
}

export function isCompleted(
  res: InterviewAnswerResponse
): res is InterviewAnswerCompletedResponse {
  return res.status === "completed";
}
