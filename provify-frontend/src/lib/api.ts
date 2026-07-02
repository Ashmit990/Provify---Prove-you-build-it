import type {
  UploadResponse,
  InterviewStartRequest,
  InterviewStartResponse,
  InterviewAnswerRequest,
  InterviewAnswerResponse,
  PeekResponse,
  SessionsListResponse,
  SessionDetailResponse,
  UserStatsResponse,
} from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      // response body wasn't JSON — fall back to statusText
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export async function uploadProject(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/api/upload/`, {
    method: "POST",
    body: formData,
  });
  return handle<UploadResponse>(res);
}

export async function startInterview(
  payload: InterviewStartRequest
): Promise<InterviewStartResponse> {
  const res = await fetch(`${API_BASE_URL}/api/interview/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<InterviewStartResponse>(res);
}

export async function submitAnswer(
  payload: InterviewAnswerRequest
): Promise<InterviewAnswerResponse> {
  const res = await fetch(`${API_BASE_URL}/api/interview/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<InterviewAnswerResponse>(res);
}

export async function peekQuestion(
  sessionId: string,
  questionIndex: number
): Promise<PeekResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/interview/peek/${sessionId}/${questionIndex}`
  );
  return handle<PeekResponse>(res);
}

// ── History ───────────────────────────────────────────────
// Assumes the history router is mounted at /api/history in main.py —
// adjust the prefix below if it's mounted elsewhere.

export async function getUserSessions(
  userId: string
): Promise<SessionsListResponse> {
  const res = await fetch(`${API_BASE_URL}/api/history/sessions/${userId}`);
  return handle<SessionsListResponse>(res);
}

export async function getSessionDetail(
  sessionId: string
): Promise<SessionDetailResponse> {
  const res = await fetch(`${API_BASE_URL}/api/history/session/${sessionId}`);
  return handle<SessionDetailResponse>(res);
}

export async function getUserStats(
  userId: string
): Promise<UserStatsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/history/stats/${userId}`);
  return handle<UserStatsResponse>(res);
}

export { ApiError };
