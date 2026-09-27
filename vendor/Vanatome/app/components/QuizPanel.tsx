import { CheckCircle2, RotateCcw, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import type { AnatomyStructure } from "../data/anatomy";
import { HARDCODED_ORGAN_QUIZ_SYSTEMS } from "../data/quiz-organ-systems";
import {
  completeQuiz,
  listQuizQuestions,
  startQuiz as createQuizSession,
  submitQuizAnswer,
  type QuizQuestion,
} from "../lib/quiz-api";

const SYSTEM_CHOICES = [
  "Cardiovascular",
  "Digestive",
  "Endocrine",
  "Lymphatic",
  "Muscular",
  "Nervous",
  "Reproductive",
  "Respiratory",
  "Skeletal",
  "Urinary",
  "Regional Anatomy",
];

function createSystemQuestion(structure: AnatomyStructure): {
  question: QuizQuestion;
  correctOption: number;
} {
  const system = HARDCODED_ORGAN_QUIZ_SYSTEMS[structure.id] ?? structure.system;
  const choices = [
    system,
    ...SYSTEM_CHOICES.filter((choice) => choice.toLowerCase() !== system.toLowerCase())
      .slice(0, 3),
  ];
  const seed = Array.from(structure.id).reduce(
    (value, character) => value + character.charCodeAt(0),
    0,
  );
  const offset = seed % choices.length;
  const options = [...choices.slice(offset), ...choices.slice(0, offset)];

  return {
    question: {
      id: `system-check-${structure.id}`,
      organ_id: structure.id,
      question: `Which anatomical system is ${structure.name} mapped to?`,
      options,
    },
    correctOption: options.indexOf(system),
  };
}

type QuizPanelProps = {
  selectedStructure: AnatomyStructure | null;
  isAuthenticated: boolean;
  onRequestSignIn: () => void;
};

export function QuizPanel({
  selectedStructure,
  isAuthenticated,
  onRequestSignIn,
}: QuizPanelProps) {
  const [availableQuestions, setAvailableQuestions] = useState<QuizQuestion[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [completion, setCompletion] = useState<{ score: number; total_questions: number } | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "active" | "complete">("idle");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answered, setAnswered] = useState<number | null>(null);
  const [questionLoadStatus, setQuestionLoadStatus] = useState<"loading" | "ready">("loading");
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [isLocalQuiz, setIsLocalQuiz] = useState(false);
  const [localCorrectOption, setLocalCorrectOption] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const selectedId = selectedStructure?.id;

  useEffect(() => {
    setAvailableQuestions([]);
    setQuestionLoadStatus("loading");
    setError(null);
    if (!selectedId || !isAuthenticated) {
      setQuestionLoadStatus("ready");
      return;
    }

    let active = true;
    void listQuizQuestions(selectedId)
      .then((loadedQuestions) => {
        if (active) {
          setAvailableQuestions(loadedQuestions);
          setQuestionLoadStatus("ready");
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setQuestionLoadStatus("ready");
          setError(reason instanceof Error ? reason.message : "Unable to load quiz questions.");
        }
      })

    return () => {
      active = false;
    };
  }, [isAuthenticated, selectedId]);

  if (!selectedStructure) {
    return <div className="quiz-empty">Select a structure in the model to begin a quiz.</div>;
  }

  const currentQuestion = questions[questionIndex];

  const beginQuiz = async () => {
    if (!isAuthenticated) {
      onRequestSignIn();
      return;
    }
    setStatus("loading");
    setError(null);
    if (availableQuestions.length === 0) {
      const fallback = createSystemQuestion(selectedStructure);
      setSessionId(null);
      setIsLocalQuiz(true);
      setLocalCorrectOption(fallback.correctOption);
      setQuestions([fallback.question]);
      setQuestionIndex(0);
      setAnswered(null);
      setCompletion(null);
      setStatus("active");
      return;
    }

    try {
      const result = await createQuizSession(selectedStructure.id, 5);
      setSessionId(result.session.id);
      setIsLocalQuiz(false);
      setQuestions(result.questions);
      setQuestionIndex(0);
      setAnswered(null);
      setCompletion(null);
      setStatus("active");
    } catch (reason: unknown) {
      setStatus("idle");
      setError(reason instanceof Error ? reason.message : "Unable to start the quiz.");
    }
  };

  const answerQuestion = async (optionIndex: number) => {
    if ((!isLocalQuiz && !sessionId) || !currentQuestion || answered !== null || savingAnswer) return;

    setAnswered(optionIndex);
    setSavingAnswer(true);
    setError(null);
    try {
      if (isLocalQuiz) {
        setCompletion({
          score: optionIndex === localCorrectOption ? 1 : 0,
          total_questions: 1,
        });
        setStatus("complete");
        return;
      }
      if (!sessionId) return;

      await submitQuizAnswer(sessionId, currentQuestion.id, optionIndex);
      const nextIndex = questionIndex + 1;
      if (nextIndex >= questions.length) {
        const result = await completeQuiz(sessionId);
        setCompletion(result);
        setStatus("complete");
      } else {
        setQuestionIndex(nextIndex);
        setAnswered(null);
      }
    } catch (reason: unknown) {
      setAnswered(null);
      setError(reason instanceof Error ? reason.message : "Unable to save your answer.");
    } finally {
      setSavingAnswer(false);
    }
  };

  if (status === "complete" && completion) {
    return (
      <div className="quiz-panel-content quiz-scoreboard">
        <Trophy size={32} />
        <span className="eyebrow">QUIZ COMPLETE</span>
        <h2>{completion.score} / {completion.total_questions}</h2>
        <p className="summary">Your score for {selectedStructure.name}.</p>
        <button type="button" className="quiz-primary-action" onClick={beginQuiz}>
          <RotateCcw size={14} /> TRY AGAIN
        </button>
      </div>
    );
  }

  if (status === "active" && currentQuestion) {
    return (
      <div className="quiz-panel-content">
        <div className="quiz-progress">
          <span>
            {isLocalQuiz
              ? "SYSTEM CHECK · NOT SAVED"
              : `QUESTION ${questionIndex + 1} OF ${questions.length}`}
          </span>
          <strong>{savingAnswer ? "SAVING" : "SELECT ONE"}</strong>
        </div>
        <h3>{currentQuestion.question}</h3>
        <div className="quiz-options">
          {currentQuestion.options.map((option, optionIndex) => (
            <button
              type="button"
              key={option}
              className={answered === optionIndex ? "selected" : ""}
              onClick={() => void answerQuestion(optionIndex)}
              disabled={answered !== null || savingAnswer}
            >
              {answered === optionIndex && <CheckCircle2 size={14} />}
              {option}
            </button>
          ))}
        </div>
        {error && <p className="quiz-error" role="alert">{error}</p>}
      </div>
    );
  }

  const hasQuestions = availableQuestions.length > 0;
  const loadingQuestions = questionLoadStatus === "loading";
  return (
    <div className="quiz-panel-content">
      <span className="eyebrow">KNOWLEDGE CHECK</span>
      <h2>{selectedStructure.name}</h2>
      <p className="summary">Test your understanding with a short set of questions about this structure.</p>
      {!isAuthenticated ? (
        <button type="button" className="quiz-primary-action" onClick={onRequestSignIn}>SIGN IN TO START</button>
      ) : loadingQuestions ? (
        <button type="button" className="quiz-primary-action" disabled>LOADING QUESTIONS</button>
      ) : (
        <button type="button" className="quiz-primary-action" onClick={() => void beginQuiz()}>
          {hasQuestions ? "START QUIZ" : "START SYSTEM CHECK"}
        </button>
      )}
      {hasQuestions && <span className="quiz-meta">{availableQuestions.length} QUESTIONS AVAILABLE</span>}
      {isAuthenticated && !loadingQuestions && !hasQuestions && (
        <span className="quiz-meta">One question based on the atlas system mapping.</span>
      )}
      {error && <p className="quiz-error" role="alert">{error}</p>}
    </div>
  );
}
