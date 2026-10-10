import { Component, Input } from '@angular/core';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-kpi',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <div class="kpi" [class.dark]="tone === 'dark'" [class.good]="tone === 'good'" [class.bad]="tone === 'bad'">
      <div class="kpi-label">{{ label }}</div>
      <div class="kpi-value">
        @switch (format) {
          @case ('int') { <span>{{ value ?? 0 | number: '1.0-0' }}</span> }
          @case ('pct') { <span>{{ value ?? 0 | number: '1.1-1' }}%</span> }
          @default { <span>{{ value ?? 0 | number: '1.2-2' }}</span> }
        }
      </div>
    </div>`,
  styles: [`
    :host { display: block; }
    .kpi { background:#fff; border:1px solid #ece9e1; border-radius:12px; padding:.85rem 1.1rem; height:100%; }
    .kpi-label { font-size:.75rem; font-weight:600; color:#8a857a; }
    .kpi-value { font-size:1.5rem; font-weight:800; line-height:1.25; color:#1c1a17;
                 font-family:'SFMono-Regular', Consolas, monospace; font-variant-numeric: tabular-nums; }
    .kpi.dark { background:#1c1a17; border-color:#1c1a17; }
    .kpi.dark .kpi-label { color:rgba(255,255,255,.7); }
    .kpi.dark .kpi-value { color:#fff; }
    .kpi.good .kpi-value { color:#047857; }
    .kpi.bad .kpi-value { color:#b91c1c; }
  `]
})
export class ReportKpi {
  @Input({ required: true }) label = '';
  @Input() value: number | null | undefined = 0;
  @Input() format: 'money' | 'int' | 'pct' = 'money';
  @Input() tone: '' | 'dark' | 'good' | 'bad' = '';
}
