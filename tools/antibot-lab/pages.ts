export function page(title: string, body: string) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>
  <link rel="icon" href="data:,"><style>body{font:18px/1.7 system-ui;margin:48px auto;max-width:820px;padding:24px;color:#20303a;background:#f4f6f8}main{padding:32px;background:white;border-radius:12px}a{color:#135ba1}label,input,select,button{display:block;margin:14px 0}input,select,button{font:inherit;padding:8px}table{width:100%;border-collapse:collapse}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}code{overflow-wrap:anywhere}small{color:#556}</style>
  <main><small>本机反爬实验站 · 合成业务数据</small><h1>${title}</h1>${body}</main></html>`
}
export function catalog(id: string, variant: number) {
  const versions = variant === 4 ? [] : variant === 1 ? [4, 7, 2] : variant === 2 ? [11, 4, 7] : [2, 13, 7]
  return page("资料目录", `<p>打开版本号最大的已发布资料。预告未发布资料不符合条件。</p>
  <table><thead><tr><th>资料</th><th>版本号</th><th>状态</th><th>操作</th></tr></thead><tbody>
  ${[...versions, 99].map(n => `<tr data-version="${n}" data-status="${n === 99 ? "预告未发布" : "已发布"}"><td>自动化参考资料</td><td>${n}</td><td>${n === 99 ? "预告未发布" : "已发布"}</td><td><a href="/case/${id}/document/${n}">打开版本 ${n}</a></td></tr>`).join("")}
  </tbody></table>`)
}
export function booking(id: string) {
  return page("预约演示", `<p>填写虚构代号，选择演示方式并提交。无需真实身份或联系方式。</p>
    <form method="POST" action="/case/${id}/booking"><label>预约代号<input name="code" required maxlength="40" pattern="[A-Za-z0-9_-]+"></label>
    <label>演示方式<select name="format"><option value="online">线上</option><option value="onsite">现场</option></select></label><button type="submit">提交预约</button></form>`)
}
