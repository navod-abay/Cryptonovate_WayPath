import { useState } from 'react';
import { categories } from '../data/seed';
import { CategoryIcon } from './common';

const series = [[100, 120, 125, 160, 210], [132, 87, 164, 118, 202], [11, 11, 32, 39, 137], [50, 71, 12, 21, 39]];
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export default function DemandChart() {
  const [day, setDay] = useState(2);
  const x = (i: number) => 58 + i * 52;
  const y = (v: number) => 400 - v * 1.48;
  return <div className="chart panel">
    <svg viewBox="0 0 326 435" role="img" aria-label="Forecast item demand for Monday to Friday: chilled, dry, tech and style">
      {[0, 50, 100, 150, 200, 250].map(v => <g key={v}><line x1="32" x2="305" y1={y(v)} y2={y(v)} stroke="#e7edf0" /><text x="26" y={y(v) + 5} textAnchor="end">{v}</text></g>)}
      {series.map((values, i) => <polyline key={i} points={values.map((v, j) => `${x(j)},${y(v)}`).join(' ')} fill="none" stroke={categories[i].line} strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />)}
      <line x1={x(day)} x2={x(day)} y1="10" y2="400" stroke="#b4cddf" strokeDasharray="5 5" />
      {days.map((label, i) => <text key={label} x={x(i)} y="423" textAnchor="middle">{label}</text>)}
    </svg>
    <div className="chart-tooltip" style={{ left: `${Math.min(72, 22 + day * 15)}%` }} aria-live="polite">{categories.map((c, i) => <div key={c.id}><CategoryIcon category={c.id} small /><span>{series[i][day]}</span></div>)}</div>
    <div className="chart-targets">{days.map((label, i) => <button key={label} aria-label={`Show ${label} demand`} aria-pressed={day === i} onFocus={() => setDay(i)} onMouseEnter={() => setDay(i)} onClick={() => setDay(i)} />)}</div>
  </div>;
}
