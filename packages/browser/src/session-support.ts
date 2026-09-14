import { z } from "zod"
import { getDomain } from "tldts"
import { BrowserError, type BrowserCommand, type HumanWaitReason } from "./contracts.js"

const domActivationResultSchema = z.object({ ok: z.literal(true), tab_id: z.number().int(),
  value: z.object({ found: z.boolean(), activated: z.boolean(), ambiguous: z.boolean() }).passthrough() }).passthrough()

export function domActivationExpression(target: Extract<BrowserCommand, { type: "click" }>["target"]) {
  const encoded = JSON.stringify(target)
  // WHY：表达式固定且只插入 JSON 编码的 typed target；模型不能提供脚本，也不能读取页面存储或凭证。
  return `(()=>{const t=${encoded},n=s=>(s||'').replace(/\\s+/g,' ').trim(),a=e=>n(e.getAttribute('aria-label')||e.getAttribute('title')||(e instanceof HTMLInputElement?e.value:'')||(e.innerText||e.textContent||'')),q=t.selector?t.selector:{link:'a[href],[role="link"]',button:'button,input[type="button"],input[type="submit"],[role="button"]',textbox:'input:not([type]),input[type="text"],input[type="search"],textarea,[role="textbox"]',combobox:'select,input[list],[role="combobox"]'}[t.role],all=Array.from(document.querySelectorAll(q)).filter(e=>e.getClientRects().length),exact=t.selector?all:all.filter(e=>a(e)===n(t.name)),fallback=exact.length?exact:t.fallbackName?all.filter(e=>a(e).includes(n(t.fallbackName))):[],matches=t.selector?all:fallback;if(!matches.length)return{found:false,activated:false,ambiguous:false};if(t.occurrence===undefined&&matches.length>1)return{found:true,activated:false,ambiguous:true};const e=matches[t.occurrence||0];if(!e)return{found:false,activated:false,ambiguous:false};const f=e instanceof HTMLFormElement?e:e.closest('form');if(f instanceof HTMLFormElement){if(typeof f.requestSubmit==='function'){const s=e instanceof HTMLButtonElement||(e instanceof HTMLInputElement&&['submit','image'].includes(e.type))?e:undefined;s?f.requestSubmit(s):f.requestSubmit()}else f.submit();return{found:true,activated:true,ambiguous:false}}if('click'in e&&typeof e.click==='function'){e.click();return{found:true,activated:true,ambiguous:false}}return{found:true,activated:false,ambiguous:false}})()`
}

export function domActivationTabId(raw: unknown) {
  const result = domActivationResultSchema.parse(raw)
  if (result.value.ambiguous) throw new BrowserError("target_ambiguous")
  if (!result.value.found) throw new BrowserError("target_missing")
  if (!result.value.activated) throw new BrowserError("capability_unsupported")
  return result.tab_id
}

export function sameNavigationLocation(left: string, right: string) {
  const a = new URL(left), b = new URL(right)
  return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search
}

export function sameRegistrableSite(left: string, right: string) {
  try {
    const values = [new URL(left), new URL(right)]
    if (values.some((value) => value.username || value.password || !["http:", "https:"].includes(value.protocol))) return false
    const sites = values.map((value) => getDomain(value.hostname, { allowPrivateDomains: true }) ?? value.hostname)
    return sites[0] === sites[1]
  } catch { return false }
}

export function helpPrompt(reason: HumanWaitReason) {
  if (reason === "login") return "请在当前 Agent Window 中完成登录，并回到当前来源页面。完成后点击 Done, return control；请勿向系统发送密码或验证码。"
  if (reason === "captcha") return "请在当前 Agent Window 中完成验证码或人机验证。完成后点击 Done, return control。"
  if (reason === "confirmation") return "请检查当前页面并完成人工确认。完成后点击 Done, return control；如非预期请取消。"
  return "当前来源显示访问限制。只处理网站提供的正常浏览器内登录或验证，不通过移动端业务跳转绕过限制；页面恢复后点击 Done, return control，否则请取消。"
}

type TargetAction = Exclude<BrowserCommand, { type: "read" | "page" | "follow" | "navigate" | "observe" | "tabs"
  | "tab_open" | "tab_select" | "tab_close" | "request_help" }>
export function targetActionArguments(command: TargetAction, located: string[]) {
  const keyTarget = located[0]?.startsWith("@") ? ["--ref", ...located] : located
  if (command.type === "click" || command.type === "hover") return [command.type, ...located]
  if (command.type === "fill") return ["fill", ...located, "--value", command.value]
  if (command.type === "press") return ["press", command.key, ...keyTarget]
  if (command.type === "select") return ["select", ...located, ...command.values.flatMap((value) => ["--value", value])]
  if (command.type === "upload") return ["upload", ...located,
    ...command.files.flatMap((file) => ["--file", file]), "--mode", command.mode]
  return ["download", ...located, "--out", command.out, ...(command.overwrite ? ["--overwrite"] : [])]
}
