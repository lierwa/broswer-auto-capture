import type { DatabaseSync } from "node:sqlite"
import { snapshot } from "./report.ts"
import { page } from "./pages.ts"

const escape = (value: unknown) => String(value ?? "—").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;")
export async function overview(base: string, db: DatabaseSync) {
  const report = await snapshot(base, db)
  const cases = db.prepare("SELECT id,kind,variant,created FROM cases WHERE kind IN ('catalog','booking') ORDER BY created DESC LIMIT 12").all()
  const metrics = report.detectorMetrics
  const funnel = "appsec-challenge" in metrics ? Object.values(metrics["appsec-challenge"].funnel) : []
  const count = (name: string) => funnel.reduce((sum, item) => sum + (item[name] ?? 0), 0)
  return page("反爬检测服务", `<p><a href="https://localhost:4185/measurement/check">打开真人 / 机器人检测网站 →</a></p><p>这里是管理入口。检测网站独立运行，B-A-T与真人可使用同一检测页面。</p>
  <p><strong>CrowdSec 1.8.1 · 原始 balanced 规则 · 拒绝阈值 75 分</strong></p>
  <p>地理数据：${escape(report.geographySource.status)} · <a href="https://db-ip.com">IP Geolocation by DB-IP</a>（CC BY 4.0，国家/ASN线索）</p>
  <table><tr><th>当前引擎周期</th><th>次数</th></tr><tr><td>请求挑战</td><td>${count("requested")}</td></tr>
  <tr><td>挑战完成</td><td>${count("solved")}</td></tr><tr><td>提交被拒绝</td><td>${count("rejected_submission")}</td></tr></table>
  <p><small>计数随引擎重启归零；历史拒绝和业务记录保留。没有记录不表示通过。采集状态：${escape(metrics.status)}</small></p>
  <h2>创建一个独立场景</h2><p>每个场景使用新的本地域名，避免之前的通行 Cookie 影响测量。</p>
  <select id="kind" aria-label="场景类型"><option value="catalog">资料目录：选择已发布的最大版本</option><option value="booking">预约表单：输入与提交</option></select>
  <button id="create">创建场景</button><p id="created" role="status" aria-live="polite"></p>
  <h2>最近场景</h2><table><tr><th>场景</th><th>页面已到达次数</th><th>选择 / 提交次数</th></tr>
  ${cases.map(item => { const events = report.business.filter(event => event.case_id === item.id); return `<tr><td><a href="http://${escape(item.id)}.localhost:4187/case/${escape(item.id)}">${item.kind === "catalog" ? "资料目录" : "预约表单"} · ${escape(String(item.id).slice(0, 8))}</a></td><td>${events.filter(e => e.action === "opened").length}</td><td>${events.filter(e => e.action === "selected" || e.action === "submitted").length}</td></tr>` }).join("")}</table>
  <h2>最近检测拒绝</h2><table><tr><th>时间</th><th>分数</th><th>命中信号</th></tr>
  ${report.submissions.slice(-10).reverse().map(item => `<tr><td>${escape(item.at)}</td><td>${escape(item.score)}</td><td>${escape(item.signals)}</td></tr>`).join("") || '<tr><td colspan="3">暂无记录</td></tr>'}</table>
  <p><a href="/api/report">查看完整脱敏记录</a></p><p><small>${escape(report.scope)} 业务计数只显示最近 300 条记录。</small></p>
  <script>document.querySelector('#create').onclick=async function(){this.disabled=true;this.textContent='正在创建…';const out=document.querySelector('#created');try{const r=await fetch('/api/cases',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:document.querySelector('#kind').value})});if(!r.ok)throw Error();const v=await r.json();const a=document.createElement('a');a.href=v.url;a.textContent=v.url;out.replaceChildren('将此网址交给 B-A-T：',a)}catch{out.textContent='创建失败，请重试。'}finally{this.disabled=false;this.textContent='创建场景'}};</script>`)
}
