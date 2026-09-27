"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowLeft, Brain, History, Plus, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { AnatomyStructure } from "../../../data/anatomy";
import {
  type ChatConversation,
  type ChatMessage,
  createChatConversation,
  getChatConversation,
  listChatConversations,
  saveChatMessage,
  updateChatConversation,
} from "../../../lib/chat-api";
import type { LearningResource } from "../../../lib/learning-resources";
import { createSpeechPlayback, requestSpeech } from "../../../lib/speech";
import { supabase } from "../../../lib/supabase";
import { LearningResourceCard } from "./LearningResourceCard";
import { MermaidDiagram } from "./MermaidDiagram";

type ChatStructure = Pick<
  AnatomyStructure,
  "id" | "name" | "system" | "layer" | "parentId" | "summary" | "function" | "fact"
>;

type AIChatPanelProps = {
  selectedStructure?: AnatomyStructure | null;
  availableStructures?: AnatomyStructure[];
  visibleSystems?: readonly string[];
  mode?: string;
  onFocusStructure?: (id: string, layer?: string) => boolean;
};

const QUICK_ACTIONS = [
  "What does the selected structure do?",
  "Teach me the heart's left ventricle",
  "What is located behind the stomach?",
];

function chatTitle(message: string) {
  const title = message.trim().split(/\s+/).slice(0, 8).join(" ");
  return title.length > 72 ? `${title.slice(0, 69).trimEnd()}...` : title || "New anatomy chat";
}

function messageText(message: { parts: Array<{ type: string; text?: string }> }) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

function hideMermaidSource(text: string) {
  return text
    .replace(/```mermaid\s*[\s\S]*?```/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type ChatPart = {
  type: string;
  text?: string;
  state?: string;
  output?: unknown;
};

type RichMessagePart =
  | { type: "diagram"; title: string; code: string }
  | { type: "resources"; resources: LearningResource[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function speechText(text: string) {
  return hideMermaidSource(text)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[`*_#]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function targetFromToolPart(part: unknown) {
  if (!isRecord(part) || part.type !== "tool-focusStructure" || part.state !== "output-available") {
    return null;
  }
  if (!isRecord(part.output) || part.output.found !== true || typeof part.output.structureId !== "string") {
    return null;
  }
  const structure = isRecord(part.output.structure) ? part.output.structure : null;
  return {
    id: part.output.structureId,
    name: structure && typeof structure.name === "string" ? structure.name : null,
  };
}

function targetFromMessages(messages: ChatMessage[]) {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const parts = messages[messageIndex].parts;
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const target = targetFromToolPart(parts[partIndex]);
      if (target) return target;
    }
  }
  return null;
}

function richMessageParts(parts: ChatPart[]): RichMessagePart[] {
  return parts.reduce<RichMessagePart[]>((richParts, part) => {
    if (part.state !== "output-available" || !isRecord(part.output)) return richParts;

    if (
      part.type === "tool-createDiagram" &&
      part.output.type === "diagram" &&
      part.output.valid === true &&
      typeof part.output.title === "string" &&
      typeof part.output.code === "string"
    ) {
      richParts.push({ type: "diagram", title: part.output.title, code: part.output.code });
      return richParts;
    }

    if (
      part.type === "tool-findLearningResource" &&
      part.output.type === "learning-resources" &&
      Array.isArray(part.output.items)
    ) {
      const resources = part.output.items.filter((item): item is LearningResource => (
        isRecord(item) &&
        (item.type === "image" || item.type === "video") &&
        typeof item.title === "string" &&
        typeof item.url === "string" &&
        typeof item.thumbnailUrl === "string" &&
        typeof item.source === "string"
      ));
      if (resources.length) richParts.push({ type: "resources", resources });
    }

    return richParts;
  }, []);
}

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(!\[[^\]]*\]\(https?:\/\/[^)\s]+\)|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        const image = part.match(/^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/);
        if (image) {
          return (
            <img
              key={index}
              className="chat-inline-image"
              src={image[2]}
              alt={image[1]}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          );
        }
        return part.startsWith("**") && part.endsWith("**") ? (
          <strong key={index} className="text-white font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={index}>{part}</span>
        );
      })}
    </>
  );
}

function MarkdownText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split(/\r?\n/).map((line, index) => {
        const heading = line.match(/^#{1,6}\s+(.+)$/);
        const bullet = line.match(/^\s*[-*]\s+(.+)$/);
        const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);

        if (!line.trim()) return <div key={index} className="h-1" />;
        if (heading) {
          return (
            <h4 key={index} className="text-sm font-semibold text-white mt-2">
              <InlineMarkdown text={heading[1]} />
            </h4>
          );
        }
        if (bullet || numbered) {
          return (
            <div key={index} className="flex gap-2">
              <span className="text-cyan-400">{bullet ? "•" : "–"}</span>
              <span><InlineMarkdown text={(bullet ?? numbered)?.[1] ?? ""} /></span>
            </div>
          );
        }
        return <p key={index}><InlineMarkdown text={line} /></p>;
      })}
    </div>
  );
}

function MessageBubble({
  message,
  onSpeak,
  speaking,
}: {
  message: { role: string; parts: ChatPart[] };
  onSpeak?: (text: string) => void;
  speaking?: boolean;
}) {
  const isAI = message.role === "assistant";
  const content = isAI ? hideMermaidSource(messageText(message)) : messageText(message);
  const richParts = richMessageParts(message.parts);

  if (!content && richParts.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex gap-2.5 ${isAI ? "" : "flex-row-reverse"}`}
    >
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
          isAI
            ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white"
            : "bg-gradient-to-br from-violet-500 to-purple-600 text-white"
        }`}
      >
        {isAI ? <Brain size={14} /> : "S"}
      </div>
      <div
        className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
          isAI
            ? "bg-gray-800/80 border border-white/8 text-gray-200 rounded-tl-sm"
            : "bg-gradient-to-br from-cyan-600/30 to-blue-600/20 border border-cyan-500/25 text-gray-100 rounded-tr-sm"
        }`}
      >
        {content && <MarkdownText text={content} />}
        {richParts.map((part, index) => part.type === "diagram" ? (
          <MermaidDiagram key={`diagram-${index}`} title={part.title} code={part.code} />
        ) : (
          <LearningResourceCard key={`resources-${index}`} resources={part.resources} />
        ))}
        {isAI && content && onSpeak && (
          <button
            type="button"
            onClick={() => onSpeak(content)}
            className="mt-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-cyan-400/80 hover:text-cyan-300 transition-colors"
            aria-label={speaking ? "Stop reading response" : "Read response aloud"}
          >
            {speaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
            {speaking ? "Stop" : "Listen"}
          </button>
        )}
      </div>
    </motion.div>
  );
}

export function AIChatPanel({
  selectedStructure = null,
  availableStructures = [],
  visibleSystems = [],
  mode = "chat",
  onFocusStructure = () => false,
}: AIChatPanelProps) {
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const conversationPromiseRef = useRef<Promise<string | null> | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const onFocusStructureRef = useRef(onFocusStructure);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopSpeechRef = useRef<(() => void) | null>(null);
  const speechRequestRef = useRef(0);

  useEffect(() => {
    onFocusStructureRef.current = onFocusStructure;
  }, [onFocusStructure]);
  const catalog = useMemo<ChatStructure[]>(
    () => availableStructures.map(({ id, name, system, layer, parentId, summary, function: structureFunction, fact }) => ({
      id,
      name,
      system,
      layer,
      parentId,
      summary,
      function: structureFunction,
      fact,
    })),
    [availableStructures],
  );
  const selectedContext = useMemo(
    () => catalog.find((structure) => structure.id === selectedStructure?.id) ?? null,
    [catalog, selectedStructure?.id],
  );

  const persistMessage = useCallback(async (
    currentConversationId: string | null,
    message: { role: "user" | "assistant" | "system"; content: string; parts: unknown[] },
  ) => {
    if (!currentConversationId) return;
    try {
      await saveChatMessage(currentConversationId, message);
    } catch (error) {
      setPersistenceError(error instanceof Error ? error.message : "Unable to save chat history.");
    }
  }, []);

  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    onFinish: ({ message, isAbort, isDisconnect, isError }) => {
      for (const part of message.parts) {
        const toolPart = part as {
          type?: string;
          state?: string;
          output?: {
            found?: boolean;
            structureId?: string;
            layer?: string;
            structure?: { name?: string };
          };
        };
        if (
          toolPart.type === "tool-focusStructure" &&
          toolPart.state === "output-available" &&
          toolPart.output?.found &&
          toolPart.output.structureId
        ) {
          onFocusStructure(toolPart.output.structureId, toolPart.output.layer);
          const structure = isRecord(toolPart.output.structure) ? toolPart.output.structure : null;
          const targetOrganName = structure && typeof structure.name === "string" ? structure.name : null;
          if (conversationIdRef.current) {
            void updateChatConversation(conversationIdRef.current, {
              targetOrganId: toolPart.output.structureId,
              targetOrganName,
            }).catch((reason: unknown) => {
              setPersistenceError(reason instanceof Error ? reason.message : "Unable to save chat target.");
            });
          }
        }
      }
      if (!isAbort && !isDisconnect && !isError) {
        void persistMessage(conversationIdRef.current, {
          role: "assistant",
          content: messageText(message),
          parts: message.parts,
        });
      }
    },
  });
  const isThinking = status === "submitted" || status === "streaming";

  const handleSpeak = useCallback(async (messageId: string, text: string) => {
    if (speakingMessageId === messageId) {
      speechRequestRef.current += 1;
      stopSpeechRef.current?.();
      stopSpeechRef.current = null;
      audioRef.current?.pause();
      audioRef.current = null;
      setSpeakingMessageId(null);
      return;
    }

    const textToSpeak = speechText(text);
    if (!textToSpeak) return;

    speechRequestRef.current += 1;
    const requestId = speechRequestRef.current;
    stopSpeechRef.current?.();
    stopSpeechRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    setVoiceError(null);
    setSpeakingMessageId(messageId);

    try {
      const playback = await createSpeechPlayback(await requestSpeech(textToSpeak));
      if (requestId !== speechRequestRef.current) {
        playback.stop();
        return;
      }

      const audio = playback.audio;
      audioRef.current = audio;
      stopSpeechRef.current = playback.stop;
      audio.onended = () => {
        playback.stop();
        stopSpeechRef.current = null;
        audioRef.current = null;
        setSpeakingMessageId(null);
      };
      audio.onerror = () => {
        playback.stop();
        stopSpeechRef.current = null;
        audioRef.current = null;
        setSpeakingMessageId(null);
        setVoiceError("Unable to play the voice response.");
      };
      await audio.play();
    } catch (reason: unknown) {
      if (requestId !== speechRequestRef.current) return;
      setSpeakingMessageId(null);
      setVoiceError(reason instanceof Error ? reason.message : "Unable to generate the voice response.");
    }
  }, [speakingMessageId]);

  useEffect(() => () => {
    speechRequestRef.current += 1;
    stopSpeechRef.current?.();
    audioRef.current?.pause();
    audioRef.current = null;
    stopSpeechRef.current = null;
  }, []);

  const ensureConversation = useCallback(async (title?: string) => {
    if (conversationId) return conversationId;
    if (!supabase) return null;
    if (!conversationPromiseRef.current) {
      conversationPromiseRef.current = createChatConversation({
        title: title ? chatTitle(title) : undefined,
        targetOrganId: selectedContext?.id ?? null,
        targetOrganName: selectedContext?.name ?? null,
        selectedStructureId: selectedContext?.id ?? null,
        selectedStructureName: selectedContext?.name ?? null,
        mode,
      })
        .then((conversation) => {
          conversationIdRef.current = conversation.id;
          setConversationId(conversation.id);
          setPersistenceError(null);
          return conversation.id;
        })
        .catch((reason: unknown) => {
          setPersistenceError(reason instanceof Error ? reason.message : "Unable to save chat history.");
          return null;
        })
        .finally(() => {
          conversationPromiseRef.current = null;
        });
    }
    return conversationPromiseRef.current;
  }, [conversationId, mode, selectedContext]);

  const loadConversations = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setConversations(await listChatConversations());
      setPersistenceError(null);
    } catch (reason: unknown) {
      setPersistenceError(reason instanceof Error ? reason.message : "Unable to load chat history.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setHistoryLoading(true);
    try {
      const detail = await getChatConversation(id);
      conversationIdRef.current = detail.conversation.id;
      setConversationId(detail.conversation.id);
      setMessages(detail.messages.map((message) => ({
        id: message.id,
        role: message.role,
        parts: message.parts,
      })) as UIMessage[]);
      const recoveredTarget = targetFromMessages(detail.messages);
      const target = detail.conversation.target_organ_id
        ? { id: detail.conversation.target_organ_id, name: detail.conversation.target_organ_name }
        : recoveredTarget ?? (detail.conversation.selected_structure_id
          ? { id: detail.conversation.selected_structure_id, name: detail.conversation.selected_structure_name }
          : null);
      if (target) {
        onFocusStructureRef.current(target.id);
        if (!detail.conversation.target_organ_id && recoveredTarget) {
          void updateChatConversation(detail.conversation.id, {
            targetOrganId: recoveredTarget.id,
            targetOrganName: recoveredTarget.name,
          }).catch((reason: unknown) => {
            setPersistenceError(reason instanceof Error ? reason.message : "Unable to save chat target.");
          });
        }
      }
      setHistoryOpen(false);
      setPersistenceError(null);
    } catch (reason: unknown) {
      setPersistenceError(reason instanceof Error ? reason.message : "Unable to open chat history.");
    } finally {
      setHistoryLoading(false);
    }
  }, [setMessages]);

  const startNewConversation = useCallback(() => {
    conversationIdRef.current = null;
    setConversationId(null);
    setMessages([]);
    setPersistenceError(null);
    setHistoryOpen(false);
  }, [setMessages]);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    const loadLatestConversation = async (signedIn: boolean) => {
      if (!signedIn) {
        if (active) {
          conversationIdRef.current = null;
          setConversationId(null);
          setPersistenceError(null);
          setMessages([]);
          setConversations([]);
        }
        return;
      }

      try {
        const conversations = await listChatConversations();
        if (!active) return;
        setConversations(conversations);
        const latest = conversations[0];
        if (!latest) {
          conversationIdRef.current = null;
          setConversationId(null);
          return;
        }
        const detail = await getChatConversation(latest.id);
        if (!active) return;
        setConversationId(detail.conversation.id);
        conversationIdRef.current = detail.conversation.id;
        setMessages(detail.messages.map((message) => ({
          id: message.id,
          role: message.role,
          parts: message.parts,
        })) as UIMessage[]);
        const recoveredTarget = targetFromMessages(detail.messages);
        const target = detail.conversation.target_organ_id
          ? { id: detail.conversation.target_organ_id, name: detail.conversation.target_organ_name }
          : recoveredTarget ?? (detail.conversation.selected_structure_id
            ? { id: detail.conversation.selected_structure_id, name: detail.conversation.selected_structure_name }
            : null);
        if (target) {
          onFocusStructureRef.current(target.id);
          if (!detail.conversation.target_organ_id && recoveredTarget) {
            void updateChatConversation(detail.conversation.id, {
              targetOrganId: recoveredTarget.id,
              targetOrganName: recoveredTarget.name,
            }).catch((reason: unknown) => {
              setPersistenceError(reason instanceof Error ? reason.message : "Unable to save chat target.");
            });
          }
        }
        setPersistenceError(null);
      } catch (reason: unknown) {
        if (active) {
          setPersistenceError(reason instanceof Error ? reason.message : "Unable to load chat history.");
        }
      }
    };

    void supabase.auth.getSession().then(({ data }) => {
      void loadLatestConversation(Boolean(data.session));
    });
    const { data: authSubscription } = supabase.auth.onAuthStateChange(
      (_event, session) => void loadLatestConversation(Boolean(session)),
    );

    return () => {
      active = false;
      authSubscription.subscription.unsubscribe();
    };
  }, [setMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const handleSend = useCallback(async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || isThinking) return;

    setInput("");
    const currentConversationId = await ensureConversation(message);
    await persistMessage(currentConversationId, {
      role: "user",
      content: message,
      parts: [{ type: "text", text: message }],
    });
    await sendMessage(
      { text: message },
      {
        body: {
          selectedStructure: selectedContext,
          visibleSystems,
          mode,
          structureCatalog: catalog,
        },
      },
    );
  }, [catalog, ensureConversation, input, isThinking, mode, persistMessage, selectedContext, sendMessage, visibleSystems]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/8 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
          <Brain size={16} className="text-white" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-white">AnatomyAI</span>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <p className="text-xs text-gray-500">
            {persistenceError ? "Chat history unavailable" : "Your anatomy tutor"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {historyOpen && (
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/8 transition-colors"
              aria-label="Back to chat"
              title="Back to chat"
            >
              <ArrowLeft size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setHistoryOpen(true);
              void loadConversations();
            }}
            className="p-2 rounded-lg text-gray-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
            aria-label="Open chat history"
            title="Chat history"
          >
            <History size={15} />
          </button>
        </div>
      </div>

      {historyOpen ? (
        <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-400/70">Saved sessions</p>
              <h3 className="text-sm font-semibold text-white mt-1">Chat history</h3>
            </div>
            <button
              type="button"
              onClick={startNewConversation}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-cyan-500/15 border border-cyan-500/25 text-cyan-300 hover:bg-cyan-500/25 transition-colors"
            >
              <Plus size={13} />
              New chat
            </button>
          </div>

          {historyLoading ? (
            <p className="text-xs text-gray-500 py-6 text-center">Loading chat history...</p>
          ) : conversations.length === 0 ? (
            <div className="rounded-xl border border-white/8 bg-gray-800/40 px-4 py-6 text-center">
              <History size={20} className="mx-auto text-gray-600 mb-2" />
              <p className="text-xs text-gray-500">No saved chat sessions yet.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => void openConversation(conversation.id)}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                    conversation.id === conversationId
                      ? "border-cyan-500/35 bg-cyan-500/10"
                      : "border-white/8 bg-gray-800/35 hover:border-cyan-500/25 hover:bg-gray-800/70"
                  }`}
                >
                  <span className="block text-xs font-medium text-gray-200 truncate">{conversation.title}</span>
                  <span className="block text-[10px] text-gray-500 mt-1">
                    {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(conversation.updated_at))}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>

      {selectedContext && (
        <div className="flex-shrink-0 px-3 py-2 mx-3 mt-2 rounded-lg bg-cyan-500/8 border border-cyan-500/20">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="text-xs text-cyan-300 font-medium">{selectedContext.name}</span>
            <span className="text-xs text-gray-500">selected</span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20 flex items-center justify-center">
              <Sparkles size={22} className="text-cyan-400" />
            </div>
            <p className="text-gray-500 text-sm text-center px-4">
              Select a structure or ask me to teach you about any part of the body.
            </p>
          </div>
        )}

        <AnimatePresence>
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onSpeak={message.role === "assistant" ? (text) => void handleSpeak(message.id, text) : undefined}
              speaking={speakingMessageId === message.id}
            />
          ))}
        </AnimatePresence>

        {isThinking && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Brain size={14} className="text-white" />
            </div>
            <div className="bg-gray-800/80 border border-white/8 rounded-xl rounded-tl-sm px-4 py-3 text-xs text-cyan-300">
              Thinking about the anatomy...
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
            {error.message || "The anatomy tutor is unavailable right now."}
          </p>
        )}

        {voiceError && (
          <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
            {voiceError}
          </p>
        )}

        <div ref={messagesEndRef} />
      </div>

      {messages.length === 0 && (
        <div className="flex-shrink-0 px-3 pb-2">
          <p className="text-xs text-gray-600 mb-2 px-1">Try asking</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => void handleSend(action)}
                className="px-2.5 py-1.5 rounded-full text-xs bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 hover:bg-cyan-500/20 transition-colors"
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-shrink-0 px-3 pb-3 pt-1">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend();
          }}
          className="flex gap-2 items-center bg-gray-800/60 border border-white/10 rounded-xl px-3 py-2 focus-within:border-cyan-500/40 transition-colors"
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask your anatomy tutor..."
            disabled={isThinking}
            className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none min-w-0"
          />
          <button
            type="submit"
            disabled={!input.trim() || isThinking}
            className="w-7 h-7 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:bg-gray-700 disabled:opacity-40 flex items-center justify-center transition-all"
            aria-label="Send message"
          >
            <Send size={13} className="text-white" />
          </button>
        </form>
      </div>
        </>
      )}
    </div>
  );
}
