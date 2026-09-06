$ErrorActionPreference = 'Stop'
$sid = $null
try {
  $sid = (bsk session start --json | ConvertFrom-Json).session_id
  bsk navigate http://127.0.0.1:4176 --session $sid | Out-Null
  bsk emulate --width 390 --height 844 --dpr 1 --session $sid | Out-Null
  bsk observe --session $sid | Out-Null
  bsk --json evaluate '(() => { const e=[...document.querySelectorAll(".task-select")].find(e=>e.getAttribute("aria-label")==="打开任务：目录调研");e.click();return true })()' --session $sid
  bsk --json evaluate 'document.querySelector(".task-workspace:not([hidden]) [id$=trigger-results]").click()' --session $sid
  Start-Sleep -Milliseconds 1300
  bsk --json evaluate '(() => { const e=[...document.querySelectorAll("button")].find(e=>e.getBoundingClientRect().width>0 && e.textContent==="查看来源记录"); e.focus(); e.click(); return true })()' --session $sid
  bsk observe --session $sid | Out-Null
  bsk --json evaluate 'JSON.stringify([...document.querySelectorAll(".detail-drawer")].map(e=>({state:e.dataset.state,animations:e.getAnimations().map(a=>({state:a.playState,time:a.currentTime,rate:a.playbackRate})),focus:document.activeElement?.outerHTML.slice(0,200)})))' --session $sid
  bsk --json evaluate 'document.querySelector("button[aria-label=\"关闭来源记录\"]").click()' --session $sid
  Start-Sleep -Milliseconds 700
  bsk --json evaluate 'JSON.stringify([...document.querySelectorAll(".detail-drawer")].map(e=>({state:e.dataset.state,animations:e.getAnimations().map(a=>({state:a.playState,time:a.currentTime,rate:a.playbackRate})),focus:document.activeElement?.outerHTML.slice(0,200)})))' --session $sid
  bsk screenshot --out D:/work/browser-capture-tool/work/f6-detail-diagnostic.png --session $sid | Out-Null
} finally { if ($sid) { bsk session stop $sid | Out-Null } }
