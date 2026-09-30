import { Button } from "@radix-ui/themes";
import { CircleAlert, LoaderCircle, RotateCcw } from "lucide-react";
import { useState } from "react";

export function InterviewTurnFailure({ latest, blocked, onRetry }: {
  latest: boolean; blocked: boolean; onRetry(): Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  async function retry() {
    if (blocked || submitting) return;
    setSubmitting(true);
    setRequestFailed(false);
    try { await onRetry(); }
    catch { setRequestFailed(true); }
    finally { setSubmitting(false); }
  }
  // WHY：状态和重试共享原轮次身份；旧失败只读，不重试旧输入，也不伪造业务成功。
  return <div className="interview-turn-failure" role={latest ? "alert" : undefined}>
    <CircleAlert size={15} aria-hidden="true" />
    <div className="interview-turn-failure-copy"><strong>本轮未提交</strong>
      <span>{requestFailed ? "重试请求未提交，请再试。" : latest ? "对话已保留，可重试本轮。" : "保留该轮失败记录。"}</span>
    </div>
    {latest && <Button size="1" variant="soft" color="gray" disabled={blocked || submitting}
      aria-busy={submitting} onClick={() => void retry()}>
      {submitting ? <LoaderCircle size={13} className="spin" aria-hidden="true" /> : <RotateCcw size={13} aria-hidden="true" />}
      {submitting ? "正在提交…" : "重试本轮"}
    </Button>}
  </div>;
}
