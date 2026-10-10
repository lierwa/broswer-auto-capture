import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'

function SpecialInputs() {
  const initial = { date: '2025-01-02', time: '03:04', 'datetime-local': '2025-01-02T03:04',
    month: '2025-01', week: '2025-W01', color: '#112233', range: '20' }
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [committed, setCommitted] = useState<Record<string, string>>({})
  return <section>{Object.keys(initial).map(type => <label key={type}>{type}
    <input type={type} aria-label={type} value={values[type]} min={type === 'range' ? '0' : undefined}
      max={type === 'range' ? '100' : undefined} step={type === 'range' ? '1' : undefined}
      onChange={event => setValues(previous => ({ ...previous, [type]: event.target.value }))}
      onBlur={event => setCommitted(previous => ({ ...previous, [type]: event.target.value }))} />
    <output id={`${type}-state`}>{values[type]}</output><output id={`${type}-committed`}>{committed[type]}</output>
  </label>)}</section>
}

// 真实受控组件：输出来自React state，不能用DOM.value自证框架状态。
function Fixture() {
  const [value, setValue] = useState('initial')
  const [committed, setCommitted] = useState('')
  const [rich, setRich] = useState('before')
  const [richCommitted, setRichCommitted] = useState('')
  return <main><label>Controlled input<input aria-label="controlled" value={value}
    onChange={event => setValue(event.target.value)} onBlur={() => setCommitted(value)} /></label>
    <output id="state">{value}</output><output id="committed">{committed}</output>
    <textarea aria-label="multiline" defaultValue="before" />
    <input aria-label="number" type="number" defaultValue="12" />
    <div role="textbox" aria-label="rich" contentEditable suppressContentEditableWarning
      onInput={event => setRich(event.currentTarget.textContent ?? '')}
      onBlur={event => setRichCommitted(event.currentTarget.textContent ?? '')}>before</div>
    <output id="rich-state">{rich}</output><output id="rich-committed">{richCommitted}</output>
    <button>Next</button><SpecialInputs /></main>
}
createRoot(document.querySelector('#root')!).render(<Fixture />)
