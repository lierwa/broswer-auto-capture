const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let maskTick = 0;
const shapes = {
  human:['0000000000000','0000011100000','0000111110000','0000111110000','0000111110000','0000011100000','0000001000000','0000111110000','0001111111000','0011111111100','0011111111100','0011111111100','0000000000000'],
  bot:['0000001000000','0000001000000','0001111111000','0011111111100','0011001001100','0111001001110','0111111111110','0011111111100','0011000001100','0011111111100','0001111111000','0000000000000','0000000000000'],
  unknown:['0000000000000','0000111110000','0001100011000','0001000001000','0000000011000','0000000110000','0000001100000','0000001000000','0000000000000','0000001000000','0000001000000','0000000000000','0000000000000'],
  waiting:['0000000000000','0001000000000','0001100000000','0001110000000','0001111000000','0001111100000','0001111110000','0001111111000','0001111100000','0001101100000','0001000110000','0000000110000','0000000000000']
};
export function initArt() {
  $('#dot-grid').innerHTML = '<defs><linearGradient id="signal-fill" x1="0" y1="0" x2="1" y2="1"><stop class="gradient-start" offset="0"/><stop class="gradient-end" offset="1"/></linearGradient></defs>'+Array.from({length:169},(_,index) => {
    const x=index%13,y=Math.floor(index/13);
    return `<rect class="dot" x="${13+x*14}" y="${13+y*14}" width="8" height="8" rx="2.4" style="--delay:${(x+y)*-.08}s"/>`;
  }).join('');
}
export function paintArt(face) {
  const pattern = shapes[face==='pending'?(maskTick%2?'bot':'human'):face];
  $('#signal-art').dataset.state=face;
  $('#art-caption').textContent={pending:'SCANNING',waiting:'YOUR TURN',human:'HUMAN',bot:'BOT',unknown:'INCONCLUSIVE'}[face];
  $$('#dot-grid .dot').forEach((dot,index) => dot.classList.toggle('active',pattern[Math.floor(index/13)][index%13]==='1'));
}

setInterval(() => {if ($('#signal-art').dataset.state === 'pending') {maskTick++;paintArt('pending');}},800);
