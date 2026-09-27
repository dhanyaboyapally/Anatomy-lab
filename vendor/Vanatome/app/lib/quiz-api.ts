import { requireSupabase } from "./supabase";
import type { ChatConversation } from "./chat-api";

export type QuizQuestion = {
  id: string;
  organ_id: string;
  question: string;
  options: string[];
  session_question_id?: string;
  question_order?: number;
};

export type QuizSession = {
  id: string;
  user_id?: string;
  organ_id: string;
  score: number;
  total_questions: number;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

export type QuizSessionStart = {
  session: QuizSession;
  questions: QuizQuestion[];
};

export type QuizCompletion = {
  session: QuizSession;
  score: number;
  total_questions: number;
};

export type ProgressResponse = {
  summary: {
    organs_studied: number;
    quiz_accuracy: number;
    completed_quizzes: number;
  };
  quiz_sessions: QuizSession[];
  chat_conversations: ChatConversation[];
};

async function quizApiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) {
    throw new Error("Sign in before using the quiz.");
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "error" in payload && payload.error
        ? payload.error
        : "Unable to sync the quiz.",
    );
  }
  return payload as T;
}

export function listQuizQuestions(organId: string): Promise<QuizQuestion[]> {
  return quizApiRequest(`/api/quiz/questions?organ_id=${encodeURIComponent(organId)}`);
}

export function startQuiz(organId: string, questionCount = 5): Promise<QuizSessionStart> {
  return quizApiRequest("/api/quiz/sessions", {
    method: "POST",
    body: JSON.stringify({ organ_id: organId, question_count: questionCount }),
  });
}

export function submitQuizAnswer(
  sessionId: string,
  questionId: string,
  selectedOption: number,
) {
  return quizApiRequest(`/api/quiz/sessions/${sessionId}/answers`, {
    method: "POST",
    body: JSON.stringify({ question_id: questionId, selected_option: selectedOption }),
  });
}

export function completeQuiz(sessionId: string): Promise<QuizCompletion> {
  return quizApiRequest(`/api/quiz/sessions/${sessionId}/complete`, { method: "POST" });
}

export function listQuizSessions(): Promise<QuizSession[]> {
  return quizApiRequest("/api/quiz/sessions");
}

export function getProgress(): Promise<ProgressResponse> {
  return quizApiRequest("/api/progress");
}
