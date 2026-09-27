"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  MessageSquare,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  AtlasLoaderError,
  createDemoHumanAtlas,
  createOfficialHumanAtlas,
} from "@vixotic/vanatome-atlas";
import type { VanatomeAtlas } from "@vixotic/vanatome-react";
import {
  ATLAS_CATALOG_IS_DEMO,
  ATLAS_CATALOG_URL,
} from "../config/atlas";
import { getProgress, type QuizSession } from "../lib/quiz-api";
import type { ChatConversation } from "../lib/chat-api";
import { supabase } from "../lib/supabase";

const AnatomyScene = dynamic(
  () => import("./AnatomyScene").then((module) => module.AnatomyScene),
  {
    ssr: false,
    loading: () => (
      <div className="progress-scene-loading">
        <div className="scanner-ring" />
        <span>Loading progress model</span>
      </div>
    ),
  },
);

function formatQuizDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatChatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function quizStatus(session: QuizSession) {
  const accuracy = session.total_questions
    ? session.score / session.total_questions
    : 0;
  if (accuracy === 1) return "Strong result";
  if (accuracy < 0.6) return "Keep practicing";
  return "Review one topic";
}

function getActivityVisibleIds(
  atlases: readonly VanatomeAtlas[],
  quizSessions: readonly QuizSession[],
  chatConversations: readonly ChatConversation[],
) {
  const structures = atlases.flatMap((atlas) => atlas.structures);
  const structureIds = new Set(structures.map((structure) => structure.id));
  const activityRoots = new Set([
    ...quizSessions.map((session) => session.organ_id),
    ...chatConversations.flatMap((conversation) => [
      conversation.target_organ_id,
      conversation.selected_structure_id,
    ]),
  ].filter((id): id is string => id !== null && structureIds.has(id)));
  const childrenByParent = new Map<string, string[]>();
  const parentById = new Map<string, string>();

  for (const structure of structures) {
    if (!structure.parentId) continue;
    parentById.set(structure.id, structure.parentId);
    const children = childrenByParent.get(structure.parentId) ?? [];
    children.push(structure.id);
    childrenByParent.set(structure.parentId, children);
  }

  const visibleIds = new Set(activityRoots);
  const pending = [...activityRoots];
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id) continue;
    for (const childId of childrenByParent.get(id) ?? []) {
      if (visibleIds.has(childId)) continue;
      visibleIds.add(childId);
      pending.push(childId);
    }
  }
  for (const rootId of activityRoots) {
    let parentId = parentById.get(rootId);
    while (parentId) {
      if (visibleIds.has(parentId)) break;
      visibleIds.add(parentId);
      parentId = parentById.get(parentId);
    }
  }

  return structures
    .filter((structure) => structure.id !== "body-shell" && !visibleIds.has(structure.id))
    .map((structure) => structure.id);
}

function SessionColumn({
  title,
  eyebrow,
  icon: Icon,
  children,
}: {
  title: string;
  eyebrow: string;
  icon: typeof MessageSquare;
  children: React.ReactNode;
}) {
  return (
    <section className="progress-session-column">
      <div className="progress-column-heading">
        <div className="progress-column-icon"><Icon size={16} /></div>
        <div>
          <span className="progress-eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="progress-session-list">{children}</div>
    </section>
  );
}

export function ProgressDashboard() {
  const loader = useMemo(
    () =>
      ATLAS_CATALOG_IS_DEMO
        ? createDemoHumanAtlas({ catalogUrl: ATLAS_CATALOG_URL })
        : createOfficialHumanAtlas({ catalogUrl: ATLAS_CATALOG_URL }),
    [],
  );
  const [atlases, setAtlases] = useState<readonly VanatomeAtlas[]>([]);
  const [modelError, setModelError] = useState<string | null>(null);
  const [quizSessions, setQuizSessions] = useState<QuizSession[]>([]);
  const [chatConversations, setChatConversations] = useState<ChatConversation[]>([]);
  const [progressSummary, setProgressSummary] = useState({
    organs_studied: 0,
    quiz_accuracy: 0,
    completed_quizzes: 0,
  });
  const [progressState, setProgressState] = useState<"loading" | "signed-in" | "signed-out" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    void loader
      .loadProfile("full-body", { signal: controller.signal })
      .then((bundle) => setAtlases([bundle.atlas]))
      .catch((reason: unknown) => {
        if (reason instanceof AtlasLoaderError && reason.code === "aborted") return;
        setModelError("Unable to load the progress anatomy model.");
      });
    return () => controller.abort();
  }, [loader]);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    const loadProgress = async (signedIn: boolean) => {
      if (!signedIn) {
        if (active) {
          setQuizSessions([]);
          setChatConversations([]);
          setProgressSummary({ organs_studied: 0, quiz_accuracy: 0, completed_quizzes: 0 });
          setProgressState("signed-out");
        }
        return;
      }

      setProgressState("loading");
      try {
        const progress = await getProgress();
        if (!active) return;
        setQuizSessions(progress.quiz_sessions);
        setChatConversations(progress.chat_conversations);
        setProgressSummary(progress.summary);
        setProgressState("signed-in");
      } catch {
        if (active) setProgressState("error");
      }
    };

    void supabase.auth.getSession().then(({ data }) => {
      void loadProgress(Boolean(data.session));
    });
    const { data: authSubscription } = supabase.auth.onAuthStateChange(
      (_event, session) => void loadProgress(Boolean(session)),
    );

    return () => {
      active = false;
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  const visibleLayers = useMemo(
    () => [...new Set(atlases.flatMap((atlas) => atlas.structures.map((structure) => structure.layer)))],
    [atlases],
  );
  const highlightedOrganId = useMemo(() => {
    const latestQuiz = quizSessions[0];
    const latestChat = chatConversations[0];
    const latestOrganId = latestChat && (!latestQuiz || new Date(latestChat.updated_at) > new Date(latestQuiz.created_at))
      ? latestChat.target_organ_id ?? latestChat.selected_structure_id
      : latestQuiz?.organ_id;
    if (!latestOrganId) return null;
    return atlases.some((atlas) =>
      atlas.structures.some((structure) => structure.id === latestOrganId),
    )
      ? latestOrganId
      : null;
  }, [atlases, chatConversations, quizSessions]);
  const latestActivity = useMemo(() => {
    const latestQuiz = quizSessions[0];
    const latestChat = chatConversations[0];
    return latestChat && (!latestQuiz || new Date(latestChat.updated_at) > new Date(latestQuiz.created_at))
      ? "chat"
      : "quiz";
  }, [chatConversations, quizSessions]);
  const highlightedOrganName = highlightedOrganId
    ? latestActivity === "chat" && chatConversations[0]?.target_organ_id === highlightedOrganId && chatConversations[0].target_organ_name
      ? chatConversations[0].target_organ_name
      : atlases.flatMap((atlas) => atlas.structures).find((structure) => structure.id === highlightedOrganId)?.name
    : null;
  const hiddenProgressStructureIds = useMemo(
    () => getActivityVisibleIds(atlases, quizSessions, chatConversations),
    [atlases, chatConversations, quizSessions],
  );

  return (
    <main className="progress-page-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="progress-topbar">
        <Link href="/" className="progress-brand" aria-label="Return to AnatomyLens">
          <span className="brand-mark"><img src="/favicon.svg" alt="" /></span>
          <span>
            <strong className="brand-name">AnatomyLens</strong>
            <small className="brand-subtitle">LEARNING PROGRESS</small>
          </span>
        </Link>
        <div className="progress-topbar-status">
          <span className="status-dot" /> {progressState === "signed-in" ? "SAVED PROGRESS" : progressState === "loading" ? "LOADING PROGRESS" : "SIGN IN REQUIRED"}
        </div>
        <Link href="/" className="progress-back-link">
          <ArrowLeft size={15} /> BACK TO LAB
        </Link>
      </header>

      <div className="progress-page-content">
        <header className="progress-page-heading">
          <div>
            <span className="progress-eyebrow">STUDY COMMAND CENTER</span>
            <h1>Your learning progress</h1>
            <p>Review the anatomy topics you have explored and tested.</p>
          </div>
          <div className="progress-stat-strip" aria-label="Progress summary">
            <div><span>ORGANS STUDIED</span><strong>{String(progressSummary.organs_studied).padStart(2, "0")}</strong></div>
            <div><span>QUIZ ACCURACY</span><strong>{progressSummary.quiz_accuracy}%</strong></div>
            <div><span>COMPLETED QUIZZES</span><strong>{progressSummary.completed_quizzes}</strong></div>
          </div>
        </header>

        <section className="progress-model-card" aria-label="Anatomy progress model">
          <div className="progress-card-heading">
            <div>
              <span className="progress-eyebrow">ANATOMY COVERAGE</span>
              <h2>Explore your studied regions</h2>
            </div>
          </div>
          <div className="progress-model-stage">
            {modelError ? (
              <div className="progress-scene-loading"><span>{modelError}</span></div>
            ) : atlases.length > 0 ? (
              <AnatomyScene
                atlases={atlases}
                selectedId={highlightedOrganId}
                isolation={null}
                visibleLayers={visibleLayers}
                focusRequestKey={0}
                resetViewKey={0}
                interactive={false}
                focusOnSelection={false}
                hiddenIds={hiddenProgressStructureIds}
                onSelect={() => undefined}
                onStructureContextMenu={() => undefined}
                onEscape={() => undefined}
              />
            ) : null}
            <div className="progress-model-overlay">
              <span>{highlightedOrganName ? `LATEST ${latestActivity.toUpperCase()} ACTIVITY` : "FULL-BODY ATLAS"}</span>
              <strong>{highlightedOrganName ?? `${progressSummary.organs_studied} regions visited`}</strong>
            </div>
          </div>
        </section>

        <section className="progress-session-grid" aria-label="Study session history">
          <SessionColumn title="Chat sessions" eyebrow="RECENT LEARNING" icon={MessageSquare}>
            {progressState === "loading" ? (
              <article className="progress-empty-state"><span>Loading saved chat sessions…</span></article>
            ) : progressState === "signed-out" ? (
              <article className="progress-empty-state"><span>Sign in to view chat history.</span></article>
            ) : chatConversations.length === 0 ? (
              <article className="progress-empty-state"><Brain size={17} /><span>No saved chat sessions yet.</span></article>
            ) : (
              chatConversations.map((conversation) => (
                <article className="progress-session-item" key={conversation.id}>
                  <div className="progress-session-item-icon"><MessageSquare size={15} /></div>
                  <div className="progress-session-item-copy">
                    <strong>{conversation.title}</strong>
                    <span>{conversation.target_organ_name ?? conversation.selected_structure_name ?? "General anatomy"}</span>
                  </div>
                  <div className="progress-session-meta"><span>{formatChatDate(conversation.updated_at)}</span></div>
                </article>
              ))
            )}
          </SessionColumn>

          <SessionColumn title="Quiz sessions" eyebrow="KNOWLEDGE CHECKS" icon={Trophy}>
            {progressState === "loading" ? (
              <article className="progress-empty-state"><span>Loading saved quiz sessions…</span></article>
            ) : progressState === "signed-out" ? (
              <article className="progress-empty-state"><span>Sign in to view saved quiz sessions.</span></article>
            ) : quizSessions.length === 0 ? (
              <article className="progress-empty-state"><span>No completed quiz sessions yet.</span></article>
            ) : (
              quizSessions.map((session) => {
                const accuracy = session.total_questions
                  ? Math.round((session.score / session.total_questions) * 100)
                  : 0;
                return (
                  <article className="progress-session-item" key={session.id}>
                    <div className="progress-session-item-icon quiz"><CheckCircle2 size={15} /></div>
                    <div className="progress-session-item-copy">
                      <strong>{session.organ_id} quiz</strong>
                      <span>{quizStatus(session)}</span>
                    </div>
                    <div className="progress-quiz-score"><strong>{session.score} / {session.total_questions}</strong><span>{accuracy}% · {formatQuizDate(session.created_at)}</span></div>
                  </article>
                );
              })
            )}
          </SessionColumn>
        </section>
      </div>
    </main>
  );
}
