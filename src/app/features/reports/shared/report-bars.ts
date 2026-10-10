import { Component, Input } from '@angular/core';

export interface BarSeries { name: string; values: number[]; color?: string; }

/** Tiny dependency-free bar chart (prints correctly, no chart library needed). */
@Component({
  selector: 'app-report-bars',
  standalone: true,
  template: `
    @if (labels.length) {
      <div class="bars-card">
        <div class="bars-head">
          <h6>{{ title }}</h6>
          @if (series.length > 1) {
            <div class="legend">
              @for (s of series; track s.name) {
                <span><i [style.background]="s.color || '#4f46e5'"></i>{{ s.name }}</span>
              }
            </div>
          }
        </div>
        <div class="bars">
          @for (l of labels; track $index; let i = $index) {
            <div class="grp" [title]="tip(i)">
              @for (s of series; track s.name) {
                <div class="bar" [style.height.%]="h(s.values[i])" [style.background]="s.color || '#4f46e5'"></div>
              }
            </div>
          }
        </div>
        <div class="axis" [style.grid-template-columns]="'repeat(' + labels.length + ', 1fr)'">
          @for (l of labels; track $index; let i = $index) {
            <span>{{ i % step === 0 ? l : '' }}</span>
          }
        </div>
      </div>
    }`,
  styles: [`
    .bars-card { background:#fff; border:1px solid #ece9e1; border-radius:12px; padding:.9rem 1.1rem 1rem; margin-bottom:.75rem; }
    .bars-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:.75rem; }
    h6 { margin:0; font-size:.85rem; font-weight:700; color:#6b665c; }
    .legend { display:flex; gap:1rem; font-size:.75rem; color:#6b665c; }
    .legend i { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:.35rem; }
    .bars { display:flex; align-items:flex-end; gap:2px; height:160px; border-bottom:1px solid #ece9e1; }
    .grp { flex:1; height:100%; display:flex; align-items:flex-end; gap:1px; min-width:0; }
    .bar { flex:1; min-height:2px; border-radius:3px 3px 0 0; opacity:.9; transition:opacity .15s; }
    .grp:hover .bar { opacity:1; }
    .axis { display:grid; margin-top:.35rem; font-size:.65rem; color:#9a958a; }
    .axis span { white-space:nowrap; overflow:visible; }
  `]
})
export class ReportBars {
  @Input() title = '';
  @Input() labels: string[] = [];
  @Input() series: BarSeries[] = [];

  get max(): number {
    let m = 1;
    for (const s of this.series) for (const v of s.values) if (v > m) m = v;
    return m;
  }
  get step(): number { return Math.max(1, Math.ceil(this.labels.length / 10)); }
  h(v: number | undefined): number { return (Math.max(0, v || 0) / this.max) * 100; }
  tip(i: number): string {
    return `${this.labels[i]}: ` + this.series.map(s => `${s.name} ${(s.values[i] || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`).join(' | ');
  }
}
