import assert from "node:assert/strict"
import type { ActionContextSite } from "./action-context-site.js"

/** Static preflight: every real-browser mechanism must exist before Chromium is allowed to start. */
export async function assertActionContextFixtureContract(site: ActionContextSite) {
  const pages = [
    { url: site.startUrl, targets: [["button", "Variable Hit"]],
      markers: [/data-oracle-node="span-a"/, /dispatchEvent\(new MouseEvent/, /effect\('hit-a'\)/] },
    { url: site.url("/cases/hit?shape=b"), targets: [["button", "Variable Hit"]],
      markers: [/<svg[^>]*data-oracle-node="svg-b"/, /<rect /, /effect\('hit-b'\)/] },
    { url: site.url("/cases/shadow"), targets: [["button", "Open Shadow Action"],
      ["button", "Closed Shadow Action"]], markers: [/attachShadow\(\{mode:'open'\}\)/,
        /attachShadow\(\{mode:'closed'\}\)/, /data-closed-internal="true"/] },
    { url: site.url("/frames/same?document=a"), targets: [["button", "Same Frame Action"]],
      markers: [/location\.replace\('\/frames\/same\?document=b#same-b'\)/] },
    { url: site.url("/frames/same?document=b"), targets: [["button", "Rebuilt Frame Action"]],
      markers: [/effect\('frame-same-b'\)/] },
    { url: site.secondaryOrigin + "/frames/cross", targets: [["button", "Cross Frame Action"]],
      markers: [/effect\('frame-cross'\)/] },
    { url: site.url("/cases/navigation"), targets: [["button", "Navigate Now"]],
      markers: [/button\.remove\(\);location\.assign\('\/cases\/input\?from=action#arrived'\)/] },
    { url: site.url("/cases/input"), targets: [["input", "Next Input"]],
      markers: [/effect\('input-value'/, /event\.key==='Enter'/] },
    { url: site.url("/cases/scroll"), targets: [["div", "Scrollable Region"]],
      markers: [/data-oracle-action="page-scroll"/, /data-oracle-action="container-scroll"/,
        /effect\('page-scroll'/, /effect\('container-scroll'/, /effect\('lazy-inserted'/,
        /createElement\('strong'\)/] },
    { url: site.url("/cases/select"), targets: [["select", "Shipping Method"]],
      markers: [/data-oracle-action="native-select"/, /effect\('select-value'/,
        /event\.type==='change'/] },
    { url: site.url("/cases/dialog"), targets: [["button", "Open Confirm"], ["button", "Open Prompt"],
      ["button", "Open Modal"], ["button", "Close Modal"]], markers: [/confirm\(/, /prompt\(/,
        /modal\.showModal\(\)/, /effect\('confirm-result'/, /effect\('prompt-result'/,
        /effect\('modal-open'/, /effect\('modal-close'/] },
    { url: site.url("/cases/popup"), targets: [["button", "Open Child Tab"]],
      markers: [/window\.open\(/, /effect\('popup-opened'/, /data-popup-role="opener"/] },
    { url: site.url("/cases/popup-child"), targets: [["button", "Child Tab Action"]],
      markers: [/data-popup-role="child"/, /effect\('popup-child'/] },
    { url: site.url("/cases/final"), targets: [["button", "Repeat Final"]],
      markers: [/count===2\)button\.remove\(\)/] },
  ] as const
  for (const page of pages) {
    const response = await fetch(page.url), body = await response.text()
    assert.equal(response.status, 200, page.url)
    const staticMarkup = body.split("<script>", 1)[0]!
    for (const [tag, label] of page.targets) {
      assert.match(staticMarkup, new RegExp(`<${tag}[^>]*aria-label=["']${escapeRegExp(label)}["']`, "i"), page.url)
    }
    for (const marker of page.markers) assert.match(body, marker, page.url)
    if (page.url.startsWith(site.secondaryOrigin)) assert.doesNotMatch(body, /if\(!event\.isTrusted\)return;/)
    assert.match(body, /navigator\.sendBeacon/)
    const scripts = [...body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]!)
    assert.ok(scripts.length > 0, page.url)
    scripts.forEach((script) => { new Function(script) })
  }
  const frameRoot = await (await fetch(site.url("/cases/frames"))).text()
  assert.match(frameRoot, /<iframe[^>]*title="Same origin frame"[^>]*src="\/frames\/same\?document=a#same-a"/)
  assert.match(frameRoot, new RegExp(`<iframe[^>]*title="Cross origin frame"[^>]*src="${escapeRegExp(site.secondaryOrigin)}`))
  const scrollPage = await (await fetch(site.url("/cases/scroll"))).text()
  assert.doesNotMatch(scrollPage.split("<script>", 1)[0]!, /lazy-loaded/)
}

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }
