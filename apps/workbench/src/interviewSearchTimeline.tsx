import { Search } from "lucide-react";
import * as React from "react";
import { projectAIInvocationTimeline } from "@agent-platform/ai-connect-react/components/AIInvocationTimeline";
import type { AIExtensionEvent } from "@agent-platform/ai-connect/browser";
import type { ConversationEntry, InteractiveTimelineItem } from "@agent-platform/ai-connect-react/chat";
import type { InterviewMessage, InterviewState } from "./interviewContract.js";

type TimelineHook = ReturnType<typeof projectAIInvocationTimeline>["hooks"][number];
type SearchRecord = {
  callId: string;
  status: TimelineHook["status"];
  title: string;
  query: string;
  refs: string[];
  rawTexts: string[];
};

export function projectInterviewSearchActivity(state: InterviewState): TimelineHook[] {
  return state.messages.flatMap((message) => {
    const queries = new Map<string, string>();
    const searchHooks = new Map<string, TimelineHook>();
    const projected = projectAIInvocationTimeline(message.aiEvents, (event) => {
      const payload = searchPayload(event);
      const hook = projectSearchHook(event, message.id, queries);
      if (payload && hook) searchHooks.set(payload.callId, hook);
      return null;
    });
    // WHY：开始和终态属于同一次工具调用；活动只投影该调用的最新事实。
    return [...projected.hooks, ...searchHooks.values()].sort((a, b) => a.createdAt - b.createdAt)
      .map((hook) => ({
      ...hook, relatedMessageId: message.id,
    }));
  });
}

export function projectInterviewSearchEntries(
  message: InterviewMessage,
  createdAt: number,
): ConversationEntry<InteractiveTimelineItem>[] {
  if (message.role !== "assistant") return [];
  const queries = new Map<string, string>();
  const records = new Map<string, SearchRecord>();
  for (const event of message.aiEvents) {
    if (event.type !== "extension") continue;
    const payload = searchPayload(event);
    if (!payload) continue;
    const hook = projectSearchHook(event, message.id, queries);
    if (!hook) continue;
    const previous = records.get(payload.callId);
    const output = asRecord(payload.data.output);
    const query = searchQuery(asRecord(output?.details)) || searchQuery(payload.data.input)
      || queries.get(payload.callId) || previous?.query || "";
    records.set(payload.callId, {
      callId: payload.callId,
      status: hook.status,
      title: hook.title,
      query,
      refs: payload.data.type === "tool.execution.completed" ? searchResultRefs(output) : previous?.refs ?? [],
      rawTexts: payload.data.type === "tool.execution.completed" ? searchResultTexts(output) : previous?.rawTexts ?? [],
    });
  }
  // WHY：一个工具调用可有开始与终态事件；历史界面只放一条真实调用，刷新后从 aiEvents 重建。
  return [...records.values()].map((record) => {
    const id = `${message.id}:search:${record.callId}`;
    return {
      id, role: "assistant", createdAt,
      value: { kind: "content", id, content: <SearchEvidence record={record} />,
        fallbackText: record.query ? `${record.title}：${record.query}` : record.title },
    };
  });
}

function SearchEvidence({ record }: { record: SearchRecord }) {
  return <section className="interview-search-record" data-interview-search-record={record.status}>
    <div className="interview-search-summary">
      <Search size={14} aria-hidden="true" />
      <strong>{record.title}</strong>
    </div>
    {(record.query || record.refs.length > 0 || record.rawTexts.length > 0) && <details>
      <summary>查看搜索依据</summary>
      {record.query && <p>查询：{record.query}</p>}
      {record.refs.length > 0 && <ul>{record.refs.map((url) => <li key={url}>
        <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
      </li>)}</ul>}
      {record.rawTexts.map((value, index) => <pre key={index}>{value}</pre>)}
    </details>}
  </section>;
}

function searchPayload(event: AIExtensionEvent) {
  if (event.namespace !== "agent-platform.pi-agent-session") return null;
  const data = asRecord(event.payload);
  if (!data || !["web_search", "search_sources"].includes(String(data.toolName))) return null;
  if (!["tool.execution.started", "tool.execution.completed", "tool.execution.failed"].includes(String(data.type))) return null;
  return typeof data.callId === "string" && data.callId ? { callId: data.callId, data } : null;
}

function projectSearchHook(event: AIExtensionEvent, messageId: string, queries: Map<string, string>): TimelineHook | null {
  const payload = searchPayload(event);
  if (!payload) return null;
  const { callId, data } = payload;
  if (data.type === "tool.execution.started") queries.set(callId, searchQuery(data.input));
  const output = asRecord(data.output);
  const details = asRecord(output?.details);
  const unavailable = data.type === "tool.execution.failed" || Boolean(details?.error)
    || details?.successfulQueries === 0 || details?.status === "unavailable";
  const status: TimelineHook["status"] = data.type === "tool.execution.started" ? "running"
    : unavailable ? "error" : "completed";
  return {
    kind: "tool-progress", status,
    title: status === "running" ? "搜索中" : status === "error" ? "搜索未完成" : "搜索完成",
    description: "",
    createdAt: event.createdAt, relatedMessageId: messageId,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function searchQuery(value: unknown) {
  const input = asRecord(value);
  if (typeof input?.query === "string") return input.query.trim();
  return Array.isArray(input?.queries) ? input.queries.filter((item): item is string => typeof item === "string").join("、") : "";
}

function searchResultTexts(output: Record<string, unknown> | null) {
  return (Array.isArray(output?.content) ? output.content : []).flatMap((content) => {
    const value = asRecord(content)?.text;
    return typeof value === "string" && value.trim() ? [value] : [];
  });
}

function searchResultRefs(output: Record<string, unknown> | null) {
  const refs = new Set<string>();
  const contentTexts = searchResultTexts(output);
  const definitions = new Map<string, string>();
  for (const value of contentTexts) {
    for (const match of value.matchAll(/^\s{0,3}\[([^\]\r\n]+)\]:\s*<?(https?:\/\/[^\s>]+)>?/gmu)) {
      definitions.set(match[1]!.trim().toLowerCase(), match[2]!);
    }
  }
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    try {
      const url = new URL(value);
      if (["http:", "https:"].includes(url.protocol)) { url.hash = ""; refs.add(url.href); }
    } catch { /* 搜索结果不是可引用的 HTTP URL。 */ }
  };
  for (const value of contentTexts) {
    for (const match of value.matchAll(/\[[^\]\r\n]+\]\((https?:\/\/[^\s)]+)\)|^\s*(https?:\/\/\S+)\s*$/gmu)) {
      add(match[1] ?? match[2]);
      if (refs.size === 2) return [...refs];
    }
    for (const match of value.matchAll(/\[([^\]\r\n]+)\]\[([^\]\r\n]+)\]/gu)) {
      add(definitions.get(match[2]!.trim().toLowerCase()));
      if (refs.size === 2) return [...refs];
    }
    try {
      const parsed = asRecord(JSON.parse(value));
      for (const result of Array.isArray(parsed?.results) ? parsed.results : []) add(asRecord(result)?.url);
    } catch { /* 普通搜索文本仍可通过链接语法提取引用。 */ }
    if (refs.size >= 2) return [...refs].slice(0, 2);
  }
  return [...refs].slice(0, 2);
}
