import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useAuth, canEdit } from "../auth";
import { useData } from "../data";

type ToolEvent = { name: string; detail: string; link?: string };
type ChatMsg =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; tools: ToolEvent[]; error?: string };

const TOOL_LABELS: Record<string, string> = {
  search_docs: "🔍 Searched docs",
  read_doc: "📖 Read",
  list_categories: "🗂 Listed categories",
  create_category: "🗂 Created category",
  create_doc: "📄 Created doc",
  update_doc: "✏️ Updated doc",
  fetch_webpage: "🌐 Fetched page",
};

function Markdown({ text }: { text: string }) {
  const html = DOMPurify.sanitize(marked.parse(text, { async: false }) as string);
  return <div className="ai-md" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function AiPanel() {
  const { user } = useAuth();
  const { reload } = useData();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages([...history, { role: "assistant", content: "", tools: [] }]);

    let wrote = false;
    const update = (fn: (m: Extract<ChatMsg, { role: "assistant" }>) => void) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = { ...(next[next.length - 1] as Extract<ChatMsg, { role: "assistant" }>) };
        last.tools = [...last.tools];
        fn(last);
        next[next.length - 1] = last;
        return next;
      });
    };

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}) as { error?: string });
        throw new Error((err as { error?: string }).error ?? `AI request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const ev = JSON.parse(line.slice(6)) as
            | { t: "text"; v: string }
            | { t: "tool"; name: string; detail: string; link?: string }
            | { t: "done" }
            | { t: "error"; v: string };
          if (ev.t === "text") update((m) => (m.content += ev.v));
          else if (ev.t === "tool") {
            update((m) => m.tools.push({ name: ev.name, detail: ev.detail, link: ev.link }));
            if (ev.name.startsWith("create_") || ev.name === "update_doc") wrote = true;
          } else if (ev.t === "error") update((m) => (m.error = ev.v));
        }
      }
    } catch (e) {
      update((m) => (m.error = e instanceof Error ? e.message : "AI request failed"));
    } finally {
      setBusy(false);
      if (wrote) reload().catch(() => {});
    }
  };

  if (!user) return null;

  return (
    <>
      {!open && (
        <button className="ai-fab" onClick={() => setOpen(true)} title="Ask AI">
          ✨ Ask AI
        </button>
      )}
      {open && (
        <div className="ai-panel">
          <div className="ai-head">
            <span>✨ AI Assistant</span>
            <div>
              <button className="link-btn" onClick={() => setMessages([])} title="Clear conversation">
                Clear
              </button>{" "}
              <button className="link-btn" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
          </div>
          <div className="ai-body" ref={bodyRef}>
            {messages.length === 0 && (
              <div className="ai-hint">
                Ask anything about the docs — I'll search them and answer with links.
                {canEdit(user) && (
                  <>
                    {" "}
                    You can also ask me to <b>create categories or docs</b>, or{" "}
                    <b>clone a page from the internet</b> into the docs.
                  </>
                )}
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ai-msg ai-user">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="ai-msg ai-assistant">
                  {m.tools.map((t, j) => (
                    <div key={j} className="ai-tool">
                      {TOOL_LABELS[t.name] ?? t.name}
                      {t.detail ? ": " : ""}
                      {t.link ? <Link to={t.link}>{t.detail}</Link> : t.detail}
                    </div>
                  ))}
                  {m.content ? <Markdown text={m.content} /> : !m.error && <div className="ai-thinking">Thinking…</div>}
                  {m.error && <div className="error">{m.error}</div>}
                </div>
              ),
            )}
          </div>
          <div className="ai-input">
            <textarea
              placeholder="Ask the docs…"
              value={input}
              rows={2}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button className="btn" onClick={send} disabled={busy || !input.trim()}>
              {busy ? "…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
